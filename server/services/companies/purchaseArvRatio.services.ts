import { db } from 'server/storage';
import { companies } from '@database/schemas/companies.schema';
import { properties, propertyTransactions } from '@database/schemas/properties.schema';
import { inArray, sql } from 'drizzle-orm';
import { computeSaleRatios } from 'server/utils/orderTransactions';

/**
 * Purchase-to-ARV ratio recompute.
 *
 * A company's ratio is the average, across every Arms Length sale where it was the
 * seller, of (its purchase price for that property ÷ its sale price). For each sale the
 * seller's acquisition price is traced back through that property's earlier transactions
 * (following Non-Arms Length transfers) by `computeSaleRatios`. Sales without a traceable
 * acquisition are excluded — never counted as zero. The value is stored on
 * `companies.purchase_to_arv_ratio` as a raw ratio (e.g. 0.7143), formatted as a percent
 * at the display edge; companies with no qualifying sale are set to NULL.
 */

type TransactionRow = typeof propertyTransactions.$inferSelect;

interface RatioAccumulator {
    sum: number;
    count: number;
}

// Bounds the size of the IN (...) list when loading transactions and the number of WHEN
// branches per UPDATE … CASE statement. Both stay well within Postgres parameter limits.
const PROPERTY_ID_CHUNK = 500;
const COMPANY_WRITE_CHUNK = 200;

// Drop implausible ratios (sale price below ~1/10th of the purchase price). These come from
// mis-keyed prices in the source data and would skew a company's average; and since the stored
// average can never exceed the largest retained ratio, capping here also keeps the value within
// the companies.purchase_to_arv_ratio numeric(6,4) column (max 99.9999).
const MAX_REASONABLE_RATIO = 10;

/** Groups transactions by property, runs computeSaleRatios, and folds each sale's ratio into acc (keyed by seller company id). */
function addTransactionsToAccumulator(acc: Map<string, RatioAccumulator>, txs: TransactionRow[]): void {
    const byProperty = new Map<string, TransactionRow[]>();
    for (const tx of txs) {
        const bucket = byProperty.get(tx.propertyId);
        if (bucket) bucket.push(tx);
        else byProperty.set(tx.propertyId, [tx]);
    }

    for (const propertyTxs of Array.from(byProperty.values())) {
        for (const { sellerId, ratio } of computeSaleRatios(propertyTxs)) {
            if (!sellerId || ratio > MAX_REASONABLE_RATIO) continue;
            const entry = acc.get(sellerId);
            if (entry) {
                entry.sum += ratio;
                entry.count += 1;
            } else {
                acc.set(sellerId, { sum: ratio, count: 1 });
            }
        }
    }
}

/** Loads all transactions for the given properties (chunked) and accumulates ratios by seller company id. */
async function accumulateRatios(propertyIds: string[]): Promise<Map<string, RatioAccumulator>> {
    const acc = new Map<string, RatioAccumulator>();
    for (let i = 0; i < propertyIds.length; i += PROPERTY_ID_CHUNK) {
        const chunk = propertyIds.slice(i, i + PROPERTY_ID_CHUNK);
        const txs = await db
            .select()
            .from(propertyTransactions)
            .where(inArray(propertyTransactions.propertyId, chunk));
        addTransactionsToAccumulator(acc, txs);
    }
    return acc;
}

/** Writes ratio values to companies in chunked UPDATE … CASE statements (value may be null to clear). */
async function writeRatios(valueById: Map<string, string | null>): Promise<void> {
    const entries = Array.from(valueById.entries());
    for (let i = 0; i < entries.length; i += COMPANY_WRITE_CHUNK) {
        const chunk = entries.slice(i, i + COMPANY_WRITE_CHUNK);
        const ids = chunk.map(([id]) => id);
        const cases = chunk.map(
            ([id, value]) => sql`WHEN ${companies.id} = ${id}::uuid THEN ${value}::numeric`,
        );
        await db
            .update(companies)
            .set({ purchaseToArvRatio: sql`CASE ${sql.join(cases, sql` `)} END` })
            .where(inArray(companies.id, ids));
    }
}

/** Average of an accumulator as a fixed-precision decimal string, or null when empty. */
function averageOrNull(agg: RatioAccumulator | undefined): string | null {
    return agg && agg.count > 0 ? (agg.sum / agg.count).toFixed(4) : null;
}

/**
 * Recomputes purchase-to-ARV ratio from scratch for the given companies and writes the
 * result to `companies.purchase_to_arv_ratio`. Reads each company's FULL sale history
 * from the database (not just a single batch), so it is idempotent across re-runs.
 * Companies with no traceable sale are set to NULL. No-op when `companyIds` is empty.
 *
 * Use this for incremental pipeline updates (recompute only the companies a sync touched).
 *
 * @param companyIds company ids to recompute (deduped internally; falsy ids ignored)
 */
export async function recomputeRatiosForCompanies(companyIds: string[]): Promise<void> {
    const ids = Array.from(new Set(companyIds.filter((id): id is string => Boolean(id))));
    if (ids.length === 0) return;

    const soldRows = await db
        .selectDistinct({ propertyId: propertyTransactions.propertyId })
        .from(propertyTransactions)
        .where(inArray(propertyTransactions.sellerId, ids));
    const propertyIds = soldRows.map((r) => r.propertyId);

    const acc = await accumulateRatios(propertyIds);

    const valueById = new Map<string, string | null>();
    for (const id of ids) valueById.set(id, averageOrNull(acc.get(id)));
    await writeRatios(valueById);
}

/**
 * Recomputes purchase-to-ARV ratio for EVERY company by scanning all properties, then
 * writes the results. Clears every company to NULL first so companies that no longer have
 * a traceable sale are reset, then writes the freshly computed averages. Intended for the
 * one-off backfill script — prefer `recomputeRatiosForCompanies` for incremental updates.
 *
 * @returns counts of companies written and properties scanned, for logging
 */
export async function recomputeAllPurchaseToArvRatios(): Promise<{
    companiesUpdated: number;
    propertiesScanned: number;
}> {
    const propertyRows = await db.select({ id: properties.id }).from(properties);
    const propertyIds = propertyRows.map((r) => r.id);

    const acc = await accumulateRatios(propertyIds);

    // Clear all, then write only companies that have a computed average.
    await db.update(companies).set({ purchaseToArvRatio: null });

    const valueById = new Map<string, string | null>();
    for (const [companyId, agg] of Array.from(acc.entries())) {
        const value = averageOrNull(agg);
        if (value !== null) valueById.set(companyId, value);
    }
    await writeRatios(valueById);

    return { companiesUpdated: valueById.size, propertiesScanned: propertyIds.length };
}
