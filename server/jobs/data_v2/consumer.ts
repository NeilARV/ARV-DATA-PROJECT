import { db } from 'server/storage';
import { msas } from '@database/schemas/msas.schema';
import { fetchQueue } from './processes/fetch-queue';
import {
    markProcessing,
    markComplete,
    markFailed,
    resetStaleProcessing,
} from './processes/mark-queue';

import { batchLookup } from './processes/batch-lookup';
import { getTransactions } from './processes/get-transactions';
import { cleanTransactions } from './processes/clean-transactions';
import { insertCompanies } from './processes/insert-companies';
import { resolvePropertyIds } from './processes/resolve-ids';
import { resolveStatuses } from './processes/resolve-status';
import { cleanBeforeInsert } from './processes/clean-before-insert';
import { resolveArvFunded } from './processes/is-arv-funded';
import { insertProperties } from './processes/insert-properties';
import { insertSupplementalTaxBills } from './processes/insert-supplemental-tax';
import { updateArvClientCompanies } from './processes/is-arv-client';
import { updatePurchaseToArvRatios } from './processes/update-purchase-arv-ratio';
import { isSupplementalTaxState } from 'server/utils/supplementalTax';

import type { BuyersMarketRecord } from './processes/get-market';
import type { MarketScanQueue } from '@database/types/sync';
import { MSA_STATE } from './msa-states';

/**
 * Maximum unique properties to process across ALL MSAs per consumer run.
 * San Diego (PRIORITY_MSA) is drained first and may consume the whole budget;
 * whatever remains is split evenly (floored) across the other MSAs. Adjust this
 * to control throughput — each property makes 1 batch-lookup + 1 /transactions call.
 */
const MAX_PROPERTIES_PER_RUN = 45;

/** MSA drained before all others — it gets first claim on MAX_PROPERTIES_PER_RUN. */
const PRIORITY_MSA = 'San Diego-Chula Vista-Carlsbad, CA';

/** Run-wide stats accumulated across every MSA, logged in the closing summary. */
interface ConsumerTotals {
    batches: number;
    propertiesProcessed: number;
    propertiesInserted: number;
    propertiesUpdated: number;
    transactionsInserted: number;
    propertiesFailed: number;
    sbtRowsWritten: number;
    sbtSkipped: number;
    sbtStepFailures: number;
}

/** A zeroed ConsumerTotals to accumulate into. */
function emptyTotals(): ConsumerTotals {
    return {
        batches: 0,
        propertiesProcessed: 0,
        propertiesInserted: 0,
        propertiesUpdated: 0,
        transactionsInserted: 0,
        propertiesFailed: 0,
        sbtRowsWritten: 0,
        sbtSkipped: 0,
        sbtStepFailures: 0,
    };
}

/** Sums two ConsumerTotals into a new object (neither input is mutated). */
function mergeTotals(a: ConsumerTotals, b: ConsumerTotals): ConsumerTotals {
    return {
        batches: a.batches + b.batches,
        propertiesProcessed: a.propertiesProcessed + b.propertiesProcessed,
        propertiesInserted: a.propertiesInserted + b.propertiesInserted,
        propertiesUpdated: a.propertiesUpdated + b.propertiesUpdated,
        transactionsInserted: a.transactionsInserted + b.transactionsInserted,
        propertiesFailed: a.propertiesFailed + b.propertiesFailed,
        sbtRowsWritten: a.sbtRowsWritten + b.sbtRowsWritten,
        sbtSkipped: a.sbtSkipped + b.sbtSkipped,
        sbtStepFailures: a.sbtStepFailures + b.sbtStepFailures,
    };
}

/**
 * Converts a market_scan_queue row into the BuyersMarketRecord shape that the
 * v1 pipeline process functions expect.
 *
 * rawData is spread first so that formatAddressForBatch (in batch-lookup.ts) can
 * find address fields under whatever name the SFR API uses (e.g. "street_address",
 * "formattedStreetAddress"). The typed columns are then overlaid — they win for
 * fields that were successfully mapped on insert, but fall through to rawData for
 * anything that was stored as null (e.g. when the API used an unexpected field name).
 *
 * msaName is used as a reliable state fallback: if the API stopped returning the
 * state field, the MSA name (e.g. "Denver-Aurora-Centennial, CO") always has it.
 * This also handles rows already sitting in the queue with state = NULL.
 */
function queueRowToMarketRecord(row: MarketScanQueue, msaName: string): BuyersMarketRecord {
    const raw = (row.rawData as Record<string, unknown>) ?? {};
    // Derive state from MSA name as a fallback for rows where the API omitted it
    const stateFromMsa = MSA_STATE[msaName];
    return {
        ...raw,
        id: row.sfrMarketId,
        propertyId: row.sfrPropertyId,
        address: row.address ?? undefined,
        city: row.city ?? undefined,
        state: row.state ?? stateFromMsa,
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

interface ProcessMsaParams {
    msa: { id: number; name: string };
    /** Max unique properties to process for this MSA before stopping. */
    cap: number;
    apiKey: string;
    apiUrl: string;
}

/**
 * Runs the full property pipeline for a single MSA until `cap` unique properties
 * have been processed or its pending queue is drained, returning this MSA's stats
 * delta (its `propertiesProcessed` is the count that consumes the run budget).
 *
 * Side effect: marks market_scan_queue rows processing→complete/failed and upserts
 * properties, companies, transactions, and supplemental tax bills.
 */
async function processMsaQueue({
    msa,
    cap,
    apiKey,
    apiUrl,
}: ProcessMsaParams): Promise<ConsumerTotals> {
    const label = `[CONSUMER][${msa.name}]`;
    // msaList is DB-driven while MSA_STATE is a hand-maintained map — a miss here
    // silently degrades the state fallback AND disables Step 12 for the whole
    // MSA, so make it loud (new/renamed MSAs must be added to msa-states.ts).
    if (MSA_STATE[msa.name] === undefined) {
        console.warn(
            `${label} No MSA_STATE entry — state fallback and supplemental tax ` +
                `are disabled until msa-states.ts is updated`,
        );
    }
    const totals = emptyTotals();
    let batchNum = 0;
    let processed = 0;

    while (processed < cap) {
        const remaining = cap - processed;

        // ── Fetch next batch of unique pending properties for this MSA ──────
        const { rows, allPropertyIds } = await fetchQueue(msa.id, msa.name, remaining);

        if (rows.length === 0) {
            if (batchNum === 0) {
                console.log(`${label} No pending rows`);
            } else {
                console.log(`${label} Done — ${batchNum} batch(es), ${processed} properties`);
            }
            break;
        }

        batchNum++;
        totals.batches++;

        console.log(
            `${label} Batch ${batchNum}: ${rows.length} properties ` +
                `(${allPropertyIds.length} total queue rows to mark)`,
        );

        // ── Mark all matching rows as 'processing' before starting work ────
        // This prevents a concurrent consumer run from picking up the same rows.
        await markProcessing(msa.id, allPropertyIds);

        try {
            // Convert queue rows → BuyersMarketRecord for downstream functions
            const marketRecords = rows.map((row) => queueRowToMarketRecord(row, msa.name));

            // ── Step 1: Batch property lookup (/properties/batch) ─────────
            console.log(
                `${label} Batch ${batchNum}: fetching property details for ${rows.length} addresses`,
            );
            const mergedProperties = await batchLookup({
                records: marketRecords,
                API_KEY: apiKey,
                API_URL: apiUrl,
                cityCode: msa.name,
            });

            if (mergedProperties.length === 0) {
                // All properties in this batch came back NOT_FOUND from the batch API.
                // Mark as failed so they appear in the queue for manual review rather
                // than silently disappearing as "complete" with nothing inserted.
                console.warn(
                    `${label} Batch ${batchNum}: all ${rows.length} properties returned NOT_FOUND from batch lookup — marking failed`,
                );
                await markFailed(msa.id, allPropertyIds, 'NOT_FOUND in batch property lookup');
                processed += rows.length;
                totals.propertiesProcessed += rows.length;
                totals.propertiesFailed += rows.length;
                continue;
            }

            // ── Partial NOT_FOUND: some properties came back but others didn't ──────
            // Properties missing from mergedProperties were silently dropped by batchLookup
            // (address couldn't be matched or the API returned no result for them).
            // Mark them failed individually so they don't get silently marked 'complete'
            // at the end of the batch without ever having been inserted.
            const foundSfrPropertyIds = new Set(
                mergedProperties.map((mp) =>
                    Number((mp.property as Record<string, unknown>).property_id ?? 0),
                ),
            );
            const partialNotFoundIds = rows
                .map((r) => r.sfrPropertyId)
                .filter((id) => !foundSfrPropertyIds.has(id));
            if (partialNotFoundIds.length > 0) {
                await markFailed(msa.id, partialNotFoundIds, 'NOT_FOUND in batch property lookup');
                console.warn(
                    `${label} Batch ${batchNum}: ${partialNotFoundIds.length} of ${rows.length} properties NOT_FOUND in batch lookup — marked failed`,
                );
                totals.propertiesFailed += partialNotFoundIds.length;
            }

            // ── Step 2: Get transaction history (/properties/transactions) ─
            console.log(
                `${label} Batch ${batchNum}: fetching transaction history for ${mergedProperties.length} properties`,
            );
            const propertiesWithTransactions = await getTransactions({
                properties: mergedProperties,
                API_KEY: apiKey,
                API_URL: apiUrl,
                cityCode: msa.name,
            });

            // ── Step 3: Filter out New Construction properties ────────────
            const newConstructionSfrIds: number[] = [];
            const nonNewConstruction = propertiesWithTransactions.filter((item) => {
                const isNC = item.transactions.some((tx) => {
                    const r = tx as Record<string, unknown>;
                    const type = String(
                        r.TRANSACTION_TYPE ?? r.transaction_type ?? '',
                    ).toLowerCase();
                    return type === 'new construction';
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
                await markFailed(msa.id, newConstructionSfrIds, 'Property is New Construction');
                console.log(
                    `${label} Batch ${batchNum}: ${newConstructionSfrIds.length} new construction properties excluded`,
                );
            }

            // ── Step 4: Clean transactions → company names/counties ────────
            const transactionCompanies = cleanTransactions(nonNewConstruction, msa.name);

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
            const resolvedProperties = propertiesWithStatus.filter((item) => {
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
                console.log(
                    `${label} Batch ${batchNum}: ${unresolvedSfrIds.length} properties excluded — status unresolvable`,
                );
            }

            // ── Step 9: Final normalization (county, property_type) ────
            const propertiesToInsert = cleanBeforeInsert(resolvedProperties);

            // ── Step 10: Annotate is_arv_funded from transaction history ──
            const propertiesToInsertWithArv = resolveArvFunded(propertiesToInsert);

            // ── Step 11: Upsert properties + all child tables + transactions ─
            console.log(
                `${label} Batch ${batchNum}: inserting ${propertiesToInsertWithArv.length} properties`,
            );
            const insertResult = await insertProperties({
                properties: propertiesToInsertWithArv,
                msa: msa.name,
                cityCode: msa.name,
            });

            // ── Step 12: Compute supplemental tax bills (supplemental-tax states) ─
            // Must run after insertProperties — bills FK to the fresh transaction
            // IDs. Isolated try/catch: Step 11 already cascade-wiped the batch's
            // old bills, so a Step-12 failure must not mark the (successfully
            // inserted) batch failed — failed queue rows are never auto-retried.
            // Log loudly; the backfill script repairs missed bills.
            if (isSupplementalTaxState(MSA_STATE[msa.name])) {
                try {
                    const sbtResult = await insertSupplementalTaxBills(
                        propertiesToInsertWithArv,
                        msa.name,
                    );
                    totals.sbtRowsWritten += sbtResult.rowsWritten;
                    totals.sbtSkipped += sbtResult.skippedTotal;
                } catch (err) {
                    totals.sbtStepFailures += 1;
                    console.error(
                        `${label} Batch ${batchNum}: supplemental tax step failed ` +
                            `(recoverable via backfill:supplemental-tax):`,
                        err,
                    );
                }
            }

            // ── Step 13: Mark companies as ARV clients from resolved transactions ─
            await updateArvClientCompanies(propertiesToInsertWithArv, msa.name);

            // ── Step 14: Recompute purchase-to-ARV ratio for affected seller companies ─
            await updatePurchaseToArvRatios(propertiesToInsertWithArv, msa.name);

            // ── Mark complete only for properties that were not individually failed ──
            // partialNotFoundIds: dropped silently by batchLookup (never inserted)
            // newConstructionSfrIds: excluded at Step 3
            // unresolvedSfrIds: excluded at Step 8
            const failedSfrIds = new Set<number>([
                ...partialNotFoundIds,
                ...newConstructionSfrIds,
                ...unresolvedSfrIds,
            ]);
            const idsToComplete = allPropertyIds.filter((id) => !failedSfrIds.has(id));
            await markComplete(msa.id, idsToComplete);

            processed += rows.length;
            totals.propertiesProcessed += rows.length;
            totals.propertiesInserted += insertResult.propertiesInserted;
            totals.propertiesUpdated += insertResult.propertiesUpdated;
            totals.transactionsInserted += insertResult.transactionsInserted;

            console.log(
                `${label} Batch ${batchNum} complete — ` +
                    `${insertResult.propertiesInserted} inserted, ` +
                    `${insertResult.propertiesUpdated} updated, ` +
                    `${insertResult.transactionsInserted} transactions`,
            );
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error(`${label} Batch ${batchNum} failed: ${errorMessage}`);

            // Mark the whole batch failed. These rows will not be automatically
            // retried — failed rows stay in the queue for manual review.
            await markFailed(msa.id, allPropertyIds, errorMessage);
            processed += rows.length;
            totals.propertiesFailed += rows.length;
            // Continue — don't let one bad batch abort the rest of the MSA
        }
    }

    return totals;
}

/**
 * Consumer job: drains pending market_scan_queue rows through the full property
 * pipeline, prioritizing San Diego. San Diego is processed first with the entire
 * per-run budget (MAX_PROPERTIES_PER_RUN); whatever it leaves unused is split
 * evenly (floored) across the remaining MSAs.
 *
 * Side effect: mutates market_scan_queue rows and upserts properties, companies,
 * transactions, and supplemental tax bills.
 */
export async function runConsumer(): Promise<void> {
    const label = '[CONSUMER]';
    const apiKey = process.env.SFR_API_KEY!;
    const apiUrl = process.env.SFR_API_URL!;

    console.log(`${label} Consumer run started`);
    const startedAt = Date.now();

    // ── Recovery: reset any rows orphaned in 'processing' from a prior crashed run ──
    // Any row still in 'processing' after 60 minutes was never completed — reset to
    // 'pending' so it gets picked up on this run. Uses enqueuedAt as a staleness proxy.
    const staleReset = await resetStaleProcessing(60);
    if (staleReset > 0) {
        console.log(
            `${label} Recovered ${staleReset} stale 'processing' row(s) → reset to 'pending'`,
        );
    }

    const msaList = await db.select().from(msas);
    if (msaList.length === 0) {
        console.log(`${label} No MSAs in database, nothing to consume`);
        return;
    }

    console.log(`${label} Processing ${msaList.length} MSAs (budget ${MAX_PROPERTIES_PER_RUN})`);

    let totals = emptyTotals();

    // ── Priority pass: drain San Diego first with the full run budget ──────────
    const priorityMsa = msaList.find((m) => m.name === PRIORITY_MSA);
    const otherMsas = msaList.filter((m) => m.name !== PRIORITY_MSA);

    let processedTotal = 0;
    if (priorityMsa) {
        console.log(
            `${label} Priority MSA "${priorityMsa.name}" — up to ${MAX_PROPERTIES_PER_RUN}`,
        );
        const delta = await processMsaQueue({
            msa: priorityMsa,
            cap: MAX_PROPERTIES_PER_RUN,
            apiKey,
            apiUrl,
        });
        totals = mergeTotals(totals, delta);
        processedTotal += delta.propertiesProcessed;
    } else {
        console.warn(
            `${label} Priority MSA "${PRIORITY_MSA}" not in database — splitting budget across all MSAs`,
        );
    }

    // ── Distribute the leftover budget evenly across the remaining MSAs ────────
    // Floor so we never overshoot the run budget; the remainder (< otherMsas.length)
    // is intentionally left unprocessed until the next run.
    const remainingBudget = MAX_PROPERTIES_PER_RUN - processedTotal;
    const perMsaCap = otherMsas.length > 0 ? Math.floor(remainingBudget / otherMsas.length) : 0;

    if (perMsaCap > 0) {
        console.log(
            `${label} Distributing ${remainingBudget} remaining across ${otherMsas.length} MSAs — ${perMsaCap} each`,
        );
        for (const msa of otherMsas) {
            const delta = await processMsaQueue({
                msa,
                cap: perMsaCap,
                apiKey,
                apiUrl,
            });
            totals = mergeTotals(totals, delta);
            processedTotal += delta.propertiesProcessed;
        }
    } else {
        console.log(
            `${label} No remaining budget for other MSAs — San Diego consumed ${processedTotal}/${MAX_PROPERTIES_PER_RUN}`,
        );
    }

    const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(
        `${label} Consumer run complete in ${elapsedSec}s — ` +
            `${totals.batches} batches, ` +
            `${totals.propertiesProcessed} processed (${totals.propertiesInserted} new / ${totals.propertiesUpdated} updated), ` +
            `${totals.transactionsInserted} transactions, ` +
            `${totals.sbtRowsWritten} supplemental tax rows ` +
            `(${totals.sbtSkipped} tx skipped, ${totals.sbtStepFailures} step failures), ` +
            `${totals.propertiesFailed} failed`,
    );
}
