import { db } from "server/storage";
import { msas } from "@database/schemas/msas.schema";
import { fetchQueue } from "./processes/fetch-queue";
import { markProcessing, markComplete, markFailed } from "./processes/mark-queue";

// Reuse all process functions from the v1 pipeline — the logic is identical.
// Only the data source (market_scan_queue instead of /buyers/market live API) changes.
import { batchLookup } from "../data/processes/batch-lookup";
import { getTransactions } from "../data/processes/get-transactions";
import { cleanTransactions } from "../data/processes/clean-transactions";
import { insertCompanies } from "../data/processes/insert-companies";
import { resolvePropertyIds } from "../data/processes/resolve-ids";
import { resolveStatus } from "../data/processes/resolve-status";
import { cleanBeforeInsert } from "../data/processes/clean-before-insert";
import { insertProperties } from "../data/processes/insert-properties";

import type { BuyersMarketRecord } from "../data/processes/fetch-market";
import type { CleanMarketResult } from "../data/processes/clean-market";
import type { MarketScanQueue } from "@database/types/sync";

/**
 * Maximum unique properties to process per MSA per consumer run.
 * Adjust this to control throughput — lower for testing, raise for production.
 * Each property makes 1 batch-lookup call (shared) + 1 /transactions call,
 * so 100 properties ≈ 1-2 minutes of API time per MSA.
 */
const MAX_PROPERTIES_PER_MSA = 5;

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

                // CleanMarketResult shape: cleanTransactions only reads .records
                const cleanedForTransactions = { records: marketRecords } as unknown as CleanMarketResult;

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

                // ── Step 3: Clean transactions → company names/counties ────────
                const transactionCompanies = cleanTransactions(
                    propertiesWithTransactions,
                    cleanedForTransactions,
                    msa.name
                );

                // ── Step 4: Insert/update companies and MSA associations ───────
                await insertCompanies({
                    companyNames: transactionCompanies.companyNames,
                    msa: msa.name,
                    cityCode: msa.name,
                    companyCounties: transactionCompanies.companyCounties,
                });

                // ── Step 5: Resolve buyer_id / seller_id from companies table ──
                const propertiesWithIds = await resolvePropertyIds({
                    properties: propertiesWithTransactions,
                    cityCode: msa.name,
                });

                // ── Step 6: Determine property status ─────────────────────────
                // on-market | in-renovation | sold | wholesale
                const propertiesWithStatus = resolveStatus(propertiesWithIds, msa.name);

                // ── Step 7: Last-mile normalization (county, property_type) ────
                const propertiesToInsert = cleanBeforeInsert(propertiesWithStatus);

                // ── Step 8: Upsert properties + all child tables + transactions ─
                console.log(`${msaLabel} Batch ${batchNum}: inserting ${propertiesToInsert.length} properties`);
                const insertResult = await insertProperties({
                    properties: propertiesToInsert,
                    msa: msa.name,
                    cityCode: msa.name,
                });

                // ── Mark all queue rows complete ───────────────────────────────
                await markComplete(msa.id, allPropertyIds);

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