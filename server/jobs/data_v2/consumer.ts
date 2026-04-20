import { db } from "server/storage";
import { msas } from "@database/schemas/msas.schema";
import { fetchQueue } from "./processes/fetch-queue";
import { markProcessing, markComplete, markFailed } from "./processes/mark-queue";

import { batchLookup } from "./processes/batch-lookup";
import { getTransactions } from "./processes/get-transactions";
import { cleanTransactions } from "./processes/clean-transactions";
import { insertCompanies } from "./processes/insert-companies";
import { resolvePropertyIds } from "./processes/resolve-ids";
import { resolveStatuses } from "./processes/resolve-status";
import { cleanBeforeInsert } from "./processes/clean-before-insert";
import { resolveArvFunded } from "./processes/is-arv-funded";
import { insertProperties } from "./processes/insert-properties";
import { updateArvClientCompanies } from "./processes/is-arv-client";

import type { BuyersMarketRecord } from "./processes/get-market";
import type { MarketScanQueue } from "@database/types/sync";

/**
 * Maximum unique properties to process per MSA per consumer run.
 * Adjust this to control throughput — lower for testing, raise for production.
 * Each property makes 1 batch-lookup call (shared) + 1 /transactions call,
 * so 100 properties ≈ 1-2 minutes of API time per MSA.
 */


/**
 * Adjusted from 10 --> 5 to reduce total processing time per call (8 minutes --> 4 minutes)
 */
const MAX_PROPERTIES_PER_MSA = 20;

/**
 * Converts a market_scan_queue row into the BuyersMarketRecord shape that the
 * v1 pipeline process functions expect. BuyersMarketRecord is Record<string, unknown>
 * so this is a straightforward field mapping — no data transformation.
 */
function queueRowToMarketRecord(row: MarketScanQueue): BuyersMarketRecord {
    return {
        id: row.sfrMarketId,
        propertyId: row.sfrPropertyId,
        address: row.address ?? undefined,
        city: row.city ?? undefined,
        state: row.state ?? undefined,
        zipCode: row.zipCode ?? undefined,
        saleDate: row.saleDate,
        recordingDate: row.recordingDate,
        buyerName: row.buyerName ?? undefined,
        sellerName: row.sellerName ?? undefined,
        // saleValue is stored as decimal string in DB; pipeline functions expect a number
        saleValue: row.saleValue != null ? Number(row.saleValue) : undefined,
        isCorporate: row.isCorporate ?? undefined,
        isPrivateLender: row.isPrivateLender ?? undefined,
        propertyType: row.propertyType ?? undefined,
        lenderName: row.lenderName ?? undefined,
    };
}

/**
 * Consumer job: reads pending rows from market_scan_queue in batches of 100,
 * runs the full property pipeline for each batch, then marks rows complete/failed.
 *
 * Processes all MSAs sequentially. Within each MSA, loops through all pending
 * batches until none remain. Per-batch errors mark that batch as failed and
 * continue to the next batch — one bad batch does not abort the MSA.
 *
 * Pipeline per batch:
 *   fetchQueue → markProcessing → batchLookup → getTransactions →
 *   cleanTransactions → insertCompanies → resolvePropertyIds → resolveStatus →
 *   cleanBeforeInsert → insertProperties → markComplete
 */
export async function runConsumer(): Promise<void> {
    const label = "[CONSUMER]";
    const API_KEY = process.env.SFR_API_KEY!;
    const API_URL = process.env.SFR_API_URL!;

    console.log(`${label} Consumer run started`);
    const startedAt = Date.now();

    const msaList = await db.select().from(msas);
    if (msaList.length === 0) {
        console.log(`${label} No MSAs in database, nothing to consume`);
        return;
    }

    console.log(`${label} Processing ${msaList.length} MSAs`);

    const totals = {
        batches: 0,
        propertiesProcessed: 0,
        propertiesInserted: 0,
        propertiesUpdated: 0,
        transactionsInserted: 0,
        propertiesFailed: 0,
    };

    for (const msa of msaList) {

        if (msa.name !== "Tampa-St. Petersburg-Clearwater, FL") {
            continue;
        }

        const msaLabel = `${label}[${msa.name}]`;
        let batchNum = 0;
        let processedThisMsa = 0;

        while (processedThisMsa < MAX_PROPERTIES_PER_MSA) {
            const remaining = MAX_PROPERTIES_PER_MSA - processedThisMsa;

            // ── Fetch next batch of unique pending properties for this MSA ──────
            const { rows, allPropertyIds } = await fetchQueue(msa.id, msa.name, remaining);

            if (rows.length === 0) {
                if (batchNum === 0) {
                    console.log(`${msaLabel} No pending rows`);
                } else {
                    console.log(`${msaLabel} Done — ${batchNum} batch(es), ${processedThisMsa} properties`);
                }
                break;
            }

            batchNum++;
            totals.batches++;

            console.log(
                `${msaLabel} Batch ${batchNum}: ${rows.length} properties ` +
                `(${allPropertyIds.length} total queue rows to mark)`
            );

            // ── Mark all matching rows as 'processing' before starting work ────
            // This prevents a concurrent consumer run from picking up the same rows.
            await markProcessing(msa.id, allPropertyIds);

            try {
                // Convert queue rows → BuyersMarketRecord for downstream functions
                const marketRecords = rows.map(queueRowToMarketRecord);

                // ── Step 1: Batch property lookup (/properties/batch) ─────────
                console.log(`${msaLabel} Batch ${batchNum}: fetching property details for ${rows.length} addresses`);
                const mergedProperties = await batchLookup({
                    records: marketRecords,
                    API_KEY,
                    API_URL,
                    cityCode: msa.name,
                });

                if (mergedProperties.length === 0) {
                    console.warn(
                        `${msaLabel} Batch ${batchNum}: batch lookup returned 0 results — ` +
                        `addresses may be malformed. Marking complete to avoid repeated failures.`
                    );
                    await markComplete(msa.id, allPropertyIds);
                    processedThisMsa += rows.length;
                    totals.propertiesProcessed += rows.length;
                    continue;
                }

                // ── Step 2: Get transaction history (/properties/transactions) ─
                console.log(`${msaLabel} Batch ${batchNum}: fetching transaction history for ${mergedProperties.length} properties`);
                const propertiesWithTransactions = await getTransactions({
                    properties: mergedProperties,
                    API_KEY,
                    API_URL,
                    cityCode: msa.name,
                });

                // ── Step 3: Filter out New Construction properties ────────────
                const newConstructionSfrIds: number[] = [];
                const nonNewConstruction = propertiesWithTransactions.filter(item => {
                    const isNC = item.transactions.some(tx => {
                        const r = tx as Record<string, unknown>;
                        const type = String(r.TRANSACTION_TYPE ?? r.transaction_type ?? "").toLowerCase();
                        return type === "new construction";
                    });
                    if (isNC) {
                        const p = item.property as Record<string, unknown>;
                        const sfrId = Number(p.property_id ?? 0);
                        if (sfrId) newConstructionSfrIds.push(sfrId);
                        return false;
                    }
                    return true;
                });
                if (newConstructionSfrIds.length > 0) {
                    await markFailed(msa.id, newConstructionSfrIds, "Property is New Construction");
                    console.log(`${msaLabel} Batch ${batchNum}: ${newConstructionSfrIds.length} new construction properties excluded`);
                }

                // ── Step 4: Clean transactions → company names/counties ────────
                const transactionCompanies = cleanTransactions(
                    nonNewConstruction,
                    msa.name
                );

                // ── Step 5: Insert/update companies and MSA associations ───────
                await insertCompanies({
                    companyNames: transactionCompanies.companyNames,
                    msa: msa.name,
                    cityCode: msa.name,
                    companyCounties: transactionCompanies.companyCounties,
                });

                // ── Step 6: Resolve buyer_id / seller_id from companies table ──
                const propertiesWithIds = await resolvePropertyIds({
                    properties: nonNewConstruction,
                    cityCode: msa.name,
                });

                // ── Step 7: Determine property status ─────────────────────────
                // on-market | in-renovation | sold | wholesale
                const propertiesWithStatus = resolveStatuses(propertiesWithIds, msa.name);

                // ── Step 8: Filter out properties where status could not be resolved
                const unresolvedSfrIds: number[] = [];
                const resolvedProperties = propertiesWithStatus.filter(item => {
                    if (item.statuses.length === 0) {
                        const p = item.property as Record<string, unknown>;
                        const sfrId = Number(p.property_id ?? 0);
                        if (sfrId) unresolvedSfrIds.push(sfrId);
                        return false;
                    }
                    return true;
                });
                if (unresolvedSfrIds.length > 0) {
                    await markFailed(msa.id, unresolvedSfrIds, "Couldn't Resolve Status");
                    console.log(`${msaLabel} Batch ${batchNum}: ${unresolvedSfrIds.length} properties excluded — status unresolvable`);
                }

                // ── Step 9: Final normalization (county, property_type) ────
                const propertiesToInsert = cleanBeforeInsert(resolvedProperties);

                // ── Step 10: Annotate is_arv_funded from transaction history ──
                const propertiesToInsertWithArv = resolveArvFunded(propertiesToInsert);

                // ── Step 11: Upsert properties + all child tables + transactions ─
                console.log(`${msaLabel} Batch ${batchNum}: inserting ${propertiesToInsertWithArv.length} properties`);
                const insertResult = await insertProperties({
                    properties: propertiesToInsertWithArv,
                    msa: msa.name,
                    cityCode: msa.name,
                });

                // ── Step 12: Mark companies as ARV clients from resolved transactions ─
                await updateArvClientCompanies(propertiesToInsertWithArv, msa.name);

                // ── Mark complete only for properties that were not individually failed ──
                const failedSfrIds = new Set<number>([...newConstructionSfrIds, ...unresolvedSfrIds]);
                const idsToComplete = allPropertyIds.filter(id => !failedSfrIds.has(id));
                await markComplete(msa.id, idsToComplete);

                processedThisMsa += rows.length;
                totals.propertiesProcessed += rows.length;
                totals.propertiesInserted += insertResult.propertiesInserted;
                totals.propertiesUpdated += insertResult.propertiesUpdated;
                totals.transactionsInserted += insertResult.transactionsInserted;

                console.log(
                    `${msaLabel} Batch ${batchNum} complete — ` +
                    `${insertResult.propertiesInserted} inserted, ` +
                    `${insertResult.propertiesUpdated} updated, ` +
                    `${insertResult.transactionsInserted} transactions`
                );
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : String(err);
                console.error(`${msaLabel} Batch ${batchNum} failed: ${errorMessage}`);

                // Mark the whole batch failed. These rows will not be automatically
                // retried — failed rows stay in the queue for manual review.
                await markFailed(msa.id, allPropertyIds, errorMessage);
                processedThisMsa += rows.length;
                totals.propertiesFailed += rows.length;
                // Continue — don't let one bad batch abort the rest of the MSA
            }
        }
    }

    const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(
        `${label} Consumer run complete in ${elapsedSec}s — ` +
        `${totals.batches} batches, ` +
        `${totals.propertiesProcessed} processed (${totals.propertiesInserted} new / ${totals.propertiesUpdated} updated), ` +
        `${totals.transactionsInserted} transactions, ` +
        `${totals.propertiesFailed} failed`
    );
}