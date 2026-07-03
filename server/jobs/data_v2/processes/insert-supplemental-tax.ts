import { db } from 'server/storage';
import { and, inArray, notInArray, sql } from 'drizzle-orm';
import {
    properties,
    addresses,
    assessments,
    propertyTransactions,
    supplementalTaxBills,
} from '@database/schemas/properties.schema';
import {
    sortTransactionsDesc,
    isArmsLength,
    priceOf,
    traceSellerAcquisition,
    expandTruncatedNames,
} from 'server/utils/orderTransactions';
import {
    getSupplementalTaxSchedule,
    calculateSupplementalBill,
    isSupplementalTaxState,
    CA_SUPPLEMENTAL_TAX_RATE,
} from 'server/utils/supplementalTax';
import type { PropertyWithStatus } from './resolve-status';

/** Counters returned by the sync routine — the step and backfill both report them. */
export interface SupplementalTaxComputeResult {
    /** Properties (of those given) whose address resolved to a supplemental-tax state. */
    supplementalStateProperties: number;
    /** Rows written — inserted or refreshed in place by the (transaction, FY) upsert. */
    rowsWritten: number;
    billRowsWritten: number;
    refundRowsWritten: number;
    /** Arm's-length transactions skipped: no usable sale price. */
    skippedNoPrice: number;
    /** Arm's-length transactions skipped: no prior value resolvable for any slot (§4.4). */
    skippedNoPriorValue: number;
    /** Arm's-length transactions skipped: unparseable date, zero difference, or $0.00 amount. */
    skippedZeroOrInvalid: number;
    /** Sum of the skip counters above — the one number callers aggregate/report. */
    skippedTotal: number;
    /** Properties whose compute or write failed — logged; their existing rows are untouched. */
    failedProperties: number;
}

function emptyResult(): SupplementalTaxComputeResult {
    return {
        supplementalStateProperties: 0,
        rowsWritten: 0,
        billRowsWritten: 0,
        refundRowsWritten: 0,
        skippedNoPrice: 0,
        skippedNoPriorValue: 0,
        skippedZeroOrInvalid: 0,
        skippedTotal: 0,
        failedProperties: 0,
    };
}

/** Upsert chunk size — keeps parameter counts well under the Postgres limit. */
const INSERT_CHUNK_SIZE = 500;

/** One property's transaction rows, as projected by the batch read below. */
type BillSourceTx = Pick<
    typeof propertyTransactions.$inferSelect,
    | 'propertyTransactionsId'
    | 'propertyId'
    | 'transactionType'
    | 'saleDate'
    | 'recordingDate'
    | 'salePrice'
    | 'buyerId'
    | 'buyerName'
    | 'sellerId'
    | 'sellerName'
>;

/** One property's assessment rows, as projected by the batch read below. */
type BillSourceAssessment = Pick<
    typeof assessments.$inferSelect,
    'propertyId' | 'assessedYear' | 'assessedValue'
>;

/** One property's derived bill rows + skip counters (same meanings as the result counters). */
interface DerivedPropertyBills {
    rows: (typeof supplementalTaxBills.$inferInsert)[];
    skippedNoPrice: number;
    skippedNoPriorValue: number;
    skippedZeroOrInvalid: number;
}

/**
 * Pure derivation (no I/O) of one property's bill rows from its transaction history
 * and assessment rolls. For every arm's-length sale with a price > 0, resolves a
 * prior value PER FISCAL-YEAR SLOT of the statutory schedule (the two slots of a
 * Jan–May event have different rolls) and calculates that slot's bill.
 */
function deriveSupplementalBillRows(
    propertyId: string,
    state: string | null,
    txs: BillSourceTx[],
    assessmentRows: BillSourceAssessment[],
): DerivedPropertyBills {
    const derived: DerivedPropertyBills = {
        rows: [],
        skippedNoPrice: 0,
        skippedNoPriorValue: 0,
        skippedZeroOrInvalid: 0,
    };

    const sorted = sortTransactionsDesc(expandTruncatedNames(txs));
    // Newest-first once per property; each slot takes the first row at/before its lien year.
    const propertyAssessments = assessmentRows
        .filter((a) => a.assessedValue != null && Number(a.assessedValue) > 0)
        .sort((a, b) => b.assessedYear - a.assessedYear);

    for (let i = 0; i < sorted.length; i++) {
        const saleTx = sorted[i];
        if (!isArmsLength(saleTx)) continue;

        const salePrice = priceOf(saleTx);
        if (salePrice === null || salePrice <= 0) {
            derived.skippedNoPrice += 1;
            continue;
        }

        const schedule = getSupplementalTaxSchedule(state, saleTx.saleDate);
        if (schedule.length === 0) {
            derived.skippedZeroOrInvalid += 1; // unparseable sale date
            continue;
        }

        // The seller's own acquisition (traced through Non-Arms-Length
        // transfers) — resolved once per sale, compared per slot below.
        const acquisition = traceSellerAcquisition(sorted, i);

        let missingPriorValue = false;
        let rowsForTx = 0;

        for (const slot of schedule) {
            // Prior value for THIS slot's fiscal year: its roll value (the
            // assessment at/before the slot year, effective its Jan-1 lien
            // date) vs the seller's traced acquisition — whichever is more
            // recent is what the slot's roll actually carries, since a sale
            // reassesses the base the day it records. (YYYY-MM-DD strings
            // compare lexicographically; a missing acquisition date ('')
            // sorts older than any lien date, so the assessment wins.)
            const rollValue = propertyAssessments.find((a) => a.assessedYear <= slot.fiscalYear);

            let priorAssessedValue: number | null = null;
            let priorValueSource: 'assessment' | 'prior_transaction' | null = null;
            if (
                acquisition &&
                (!rollValue || acquisition.date > `${rollValue.assessedYear}-01-01`)
            ) {
                priorAssessedValue = acquisition.price;
                priorValueSource = 'prior_transaction';
            } else if (rollValue) {
                priorAssessedValue = Number(rollValue.assessedValue);
                priorValueSource = 'assessment';
            }
            if (priorAssessedValue == null || priorValueSource == null) {
                missingPriorValue = true;
                continue;
            }

            const bill = calculateSupplementalBill({
                priorAssessedValue,
                newBaseValue: salePrice,
                taxRate: CA_SUPPLEMENTAL_TAX_RATE,
                fiscalYear: slot.fiscalYear,
                prorationFactor: slot.prorationFactor,
            });
            if (!bill) continue; // zero difference / $0.00 amount — nothing owed

            derived.rows.push({
                propertyId,
                propertyTransactionId: saleTx.propertyTransactionsId,
                fiscalYear: bill.fiscalYear,
                billType: bill.billType,
                priorAssessedValue: priorAssessedValue.toFixed(2),
                newBaseValue: salePrice.toFixed(2),
                netSupplementalValue: bill.netSupplementalValue.toFixed(2),
                taxRate: String(bill.taxRate),
                prorationFactor: String(bill.prorationFactor),
                amount: bill.amount.toFixed(2),
                priorValueSource,
            });
            rowsForTx += 1;
        }

        if (rowsForTx === 0) {
            if (missingPriorValue) derived.skippedNoPriorValue += 1;
            else derived.skippedZeroOrInvalid += 1;
        }
    }

    return derived;
}

/**
 * Computes and upserts supplemental tax bills for the given properties (by UUID).
 *
 * Shared by pipeline Step 12 and the backfill script so there is exactly one
 * implementation. Reads each property's state, transactions, and assessments in
 * three batched queries, then per supplemental-state property: for every
 * arm's-length transaction with a sale price > 0, resolves a prior value PER
 * FISCAL-YEAR SLOT of the statutory schedule (the two slots of a Jan–May event have
 * different rolls) and upserts the calculated rows on
 * (property_transaction_id, fiscal_year) — an upsert, not a conflict-skip, so
 * recomputed amounts refresh rows whose transaction id survives across syncs
 * (user-created transactions are never cascade-recreated).
 *
 * Per-property failures are logged and skipped — one bad property never aborts the
 * batch — and a failed write chunk is contained the same way. Non-supplemental-state
 * properties produce no rows.
 *
 * @param propertyIds properties.id UUIDs to process (deduped internally)
 * @param options.recompute after the upserts, delete rows the recomputation no
 * longer produces (stale fiscal years, transactions that no longer qualify). Runs
 * AFTER the writes so a failure never leaves a property with fewer rows than it had.
 * @returns counters for logging (rows written by type, skips by reason, failures)
 */
export async function syncSupplementalTaxForProperties(
    propertyIds: string[],
    options?: { recompute?: boolean },
): Promise<SupplementalTaxComputeResult> {
    const result = emptyResult();
    // Dedupe defensively: a duplicate id would put the same (transaction, fiscal
    // year) row twice into one upsert statement, which Postgres rejects for DO UPDATE.
    const ids = Array.from(new Set(propertyIds));
    if (ids.length === 0) return result;

    const [addressRows, txRows, assessmentRows] = await Promise.all([
        db
            .select({
                propertyId: addresses.propertyId,
                state: addresses.state,
                county: addresses.county,
            })
            .from(addresses)
            .where(inArray(addresses.propertyId, ids)),
        db
            .select({
                propertyTransactionsId: propertyTransactions.propertyTransactionsId,
                propertyId: propertyTransactions.propertyId,
                transactionType: propertyTransactions.transactionType,
                saleDate: propertyTransactions.saleDate,
                recordingDate: propertyTransactions.recordingDate,
                salePrice: propertyTransactions.salePrice,
                buyerId: propertyTransactions.buyerId,
                buyerName: propertyTransactions.buyerName,
                sellerId: propertyTransactions.sellerId,
                sellerName: propertyTransactions.sellerName,
            })
            .from(propertyTransactions)
            .where(inArray(propertyTransactions.propertyId, ids)),
        db
            .select({
                propertyId: assessments.propertyId,
                assessedYear: assessments.assessedYear,
                assessedValue: assessments.assessedValue,
            })
            .from(assessments)
            .where(inArray(assessments.propertyId, ids)),
    ]);

    // Case/whitespace-tolerant state gate — addresses.state is stored verbatim from
    // SFR, and this is the authoritative per-property gate for any caller.
    const taxableAddressByProperty = new Map(
        addressRows.filter((a) => isSupplementalTaxState(a.state)).map((a) => [a.propertyId, a]),
    );

    const txsByProperty = new Map<string, typeof txRows>();
    for (const tx of txRows) {
        const bucket = txsByProperty.get(tx.propertyId);
        if (bucket) bucket.push(tx);
        else txsByProperty.set(tx.propertyId, [tx]);
    }
    const assessmentsByProperty = new Map<string, typeof assessmentRows>();
    for (const a of assessmentRows) {
        const bucket = assessmentsByProperty.get(a.propertyId);
        if (bucket) bucket.push(a);
        else assessmentsByProperty.set(a.propertyId, [a]);
    }

    const rowsToWrite: (typeof supplementalTaxBills.$inferInsert)[] = [];
    const failedPropertyIds = new Set<string>();

    for (const propertyId of ids) {
        const address = taxableAddressByProperty.get(propertyId);
        if (!address) continue; // unsupported state (or no address row) — nothing to compute
        result.supplementalStateProperties += 1;

        try {
            const derived = deriveSupplementalBillRows(
                propertyId,
                address.state,
                txsByProperty.get(propertyId) ?? [],
                assessmentsByProperty.get(propertyId) ?? [],
            );
            rowsToWrite.push(...derived.rows);
            result.skippedNoPrice += derived.skippedNoPrice;
            result.skippedNoPriorValue += derived.skippedNoPriorValue;
            result.skippedZeroOrInvalid += derived.skippedZeroOrInvalid;
        } catch (err) {
            failedPropertyIds.add(propertyId);
            console.error(
                `[SUPPLEMENTAL_TAX] Failed to compute bills for property ${propertyId}:`,
                err,
            );
        }
    }

    // ── Write phase: chunked upserts on (property_transaction_id, fiscal_year) ──────
    const writtenRowIds: number[] = [];
    for (let i = 0; i < rowsToWrite.length; i += INSERT_CHUNK_SIZE) {
        const chunk = rowsToWrite.slice(i, i + INSERT_CHUNK_SIZE);
        try {
            const written = await db
                .insert(supplementalTaxBills)
                .values(chunk)
                .onConflictDoUpdate({
                    target: [
                        supplementalTaxBills.propertyTransactionId,
                        supplementalTaxBills.fiscalYear,
                    ],
                    set: {
                        billType: sql`excluded.bill_type`,
                        priorAssessedValue: sql`excluded.prior_assessed_value`,
                        newBaseValue: sql`excluded.new_base_value`,
                        netSupplementalValue: sql`excluded.net_supplemental_value`,
                        taxRate: sql`excluded.tax_rate`,
                        prorationFactor: sql`excluded.proration_factor`,
                        amount: sql`excluded.amount`,
                        priorValueSource: sql`excluded.prior_value_source`,
                    },
                })
                .returning({
                    id: supplementalTaxBills.supplementalTaxBillsId,
                    billType: supplementalTaxBills.billType,
                });
            result.rowsWritten += written.length;
            result.billRowsWritten += written.filter((r) => r.billType === 'bill').length;
            result.refundRowsWritten += written.filter((r) => r.billType === 'refund').length;
            for (const r of written) writtenRowIds.push(r.id);
        } catch (err) {
            // One bad chunk (e.g. a transaction FK gone stale under a concurrent
            // sync) must not abort the batch or the backfill run. The affected
            // properties keep whatever rows they had and are excluded from the
            // recompute purge below; the next run heals them.
            for (const row of chunk) failedPropertyIds.add(row.propertyId);
            console.error(`[SUPPLEMENTAL_TAX] Failed to write ${chunk.length} bill row(s):`, err);
        }
    }

    // ── Recompute purge: drop rows the recomputation no longer produces ─────────────
    // Runs AFTER the upserts so a failure at any point leaves the previous rows in
    // place (the old delete-first order lost every existing bill in the page whenever
    // a later insert failed). Parameter counts stay bounded: callers page property
    // ids (≤500) and writtenRowIds scales with the page's bill rows.
    if (options?.recompute) {
        const purgeScope = ids.filter((id) => !failedPropertyIds.has(id));
        if (purgeScope.length > 0) {
            await db
                .delete(supplementalTaxBills)
                .where(
                    and(
                        inArray(supplementalTaxBills.propertyId, purgeScope),
                        writtenRowIds.length > 0
                            ? notInArray(supplementalTaxBills.supplementalTaxBillsId, writtenRowIds)
                            : undefined,
                    ),
                );
        }
    }

    result.skippedTotal =
        result.skippedNoPrice + result.skippedNoPriorValue + result.skippedZeroOrInvalid;
    result.failedProperties = failedPropertyIds.size;

    return result;
}

/**
 * Pipeline Step 12: computes supplemental tax bills for the batch's properties.
 *
 * Runs after insertProperties (bills FK to the freshly-inserted transaction IDs) and
 * reads everything back from the DB via the shared sync routine. The consumer only
 * calls this for supplemental-tax-state MSAs; the routine's per-property address gate
 * also protects any other caller.
 *
 * @param items the batch's properties (used only to resolve property UUIDs)
 * @param cityCode MSA label, for logging
 * @returns the compute counters (also aggregated into the consumer run summary)
 */
export async function insertSupplementalTaxBills(
    items: PropertyWithStatus[],
    cityCode: string,
): Promise<SupplementalTaxComputeResult> {
    const sfrIds = items
        .map((item) => Number((item.property as Record<string, unknown>).property_id ?? 0))
        .filter((id) => id > 0);
    if (sfrIds.length === 0) return emptyResult();

    const propertyRows = await db
        .select({ id: properties.id })
        .from(properties)
        .where(inArray(properties.sfrPropertyId, sfrIds));

    const result = await syncSupplementalTaxForProperties(propertyRows.map((r) => r.id));

    console.log(
        `[${cityCode}] Supplemental tax: ${result.billRowsWritten} bill(s), ` +
            `${result.refundRowsWritten} refund(s) written across ${result.supplementalStateProperties} properties; ` +
            `${result.skippedTotal} transaction(s) skipped ` +
            `(${result.skippedNoPrice} no price, ${result.skippedNoPriorValue} no prior value, ` +
            `${result.skippedZeroOrInvalid} zero-diff/invalid)` +
            (result.failedProperties > 0 ? `; ${result.failedProperties} properties FAILED` : ''),
    );

    return result;
}
