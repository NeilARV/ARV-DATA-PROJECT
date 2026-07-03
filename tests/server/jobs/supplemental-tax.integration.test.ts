import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { asc, eq, inArray } from 'drizzle-orm';
import {
    properties,
    addresses,
    assessments,
    propertyTransactions,
    supplementalTaxBills,
} from '@database/schemas/properties.schema';
import { getTestDb } from '../../helpers/db';
import {
    syncSupplementalTaxForProperties,
    insertSupplementalTaxBills,
} from 'server/jobs/data_v2/processes/insert-supplemental-tax';
import type { SupplementalTaxComputeResult } from 'server/jobs/data_v2/processes/insert-supplemental-tax';
import type { PropertyWithStatus } from 'server/jobs/data_v2/processes/resolve-status';

// SFR ids unique to this file (TST.UNIQUE-UUID) — files run in parallel.
const SFR_BASE = 954_321_770_000;
const SFR_IDS = {
    workedExample: SFR_BASE + 1,
    flip: SFR_BASE + 2,
    truncated: SFR_BASE + 3,
    nonCa: SFR_BASE + 4,
    skips: SFR_BASE + 5,
    zeroDiff: SFR_BASE + 6,
    lowercaseState: SFR_BASE + 7,
};

// The 40-char truncation-repair fixture: SFR stores the seller as the first 40 chars
// of the name it stores in full on the buyer side of the earlier transaction.
const FULL_SELLER_NAME = 'GOLDEN STATE ACQUISITIONS DEVELOPMENT GROUP INC';
const TRUNCATED_SELLER_NAME = FULL_SELLER_NAME.slice(0, 40);

const db = getTestDb();

async function seedProperty(sfrPropertyId: number, state: string): Promise<string> {
    const [row] = await db
        .insert(properties)
        .values({ sfrPropertyId })
        .returning({ id: properties.id });
    await db.insert(addresses).values({ propertyId: row.id, state, city: 'Integration Test' });
    return row.id;
}

interface TxSeed {
    type: string;
    saleDate: string;
    recordingDate: string;
    price: string | null;
    buyerName: string;
    sellerName: string;
}

async function seedTx(propertyId: string, tx: TxSeed): Promise<number> {
    const [row] = await db
        .insert(propertyTransactions)
        .values({
            propertyId,
            transactionType: tx.type,
            saleDate: tx.saleDate,
            recordingDate: tx.recordingDate,
            salePrice: tx.price,
            buyerName: tx.buyerName,
            sellerName: tx.sellerName,
        })
        .returning({ id: propertyTransactions.propertyTransactionsId });
    return row.id;
}

async function billsFor(propertyId: string) {
    return db
        .select()
        .from(supplementalTaxBills)
        .where(eq(supplementalTaxBills.propertyId, propertyId))
        .orderBy(asc(supplementalTaxBills.fiscalYear));
}

let workedExampleId: string;
let flipId: string;
let truncatedId: string;
let nonCaId: string;
let skipsId: string;
let zeroDiffId: string;
let lowercaseStateId: string;
let workedExampleTxId: number;
let flipResaleTxId: number;
let truncatedResaleTxId: number;
let firstRun: SupplementalTaxComputeResult;

beforeAll(async () => {
    // ── Worked example (§2 of the plan): long-held CA property, roll value wins.
    // August event → §75.41 presumed date Sep 1 → factor 0.83, single bill. ──
    workedExampleId = await seedProperty(SFR_IDS.workedExample, 'CA');
    await db.insert(assessments).values({
        propertyId: workedExampleId,
        assessedYear: 2025,
        assessedValue: '122000.00',
    });
    workedExampleTxId = await seedTx(workedExampleId, {
        type: 'Arms Length',
        saleDate: '2026-08-20',
        recordingDate: '2026-08-25',
        price: '1000000.00',
        buyerName: 'WORKED EXAMPLE BUYER LLC',
        sellerName: 'LONG HELD OWNER TRUST',
    });

    // ── Flip: resale measured against the seller's own recent purchase, not the
    // stale roll (the mislabeled-refund case that drove the §11.4 design change) ──
    flipId = await seedProperty(SFR_IDS.flip, 'CA');
    await db.insert(assessments).values({
        propertyId: flipId,
        assessedYear: 2025,
        assessedValue: '413000.00',
    });
    await seedTx(flipId, {
        type: 'Arms Length',
        saleDate: '2026-03-10',
        recordingDate: '2026-03-12',
        price: '285000.00',
        buyerName: 'FLIPPER DEVELOPMENT GROUP INC',
        sellerName: 'PREVIOUS FAMILY OWNER',
    });
    flipResaleTxId = await seedTx(flipId, {
        type: 'Arms Length',
        saleDate: '2026-04-20',
        recordingDate: '2026-04-22',
        price: '410000.00',
        buyerName: 'END RETAIL BUYER',
        sellerName: 'FLIPPER DEVELOPMENT GROUP INC',
    });

    // ── Truncated seller name: chain only traces if the 40-char repair links the
    // resale's seller to the earlier transaction's full buyer name ──
    truncatedId = await seedProperty(SFR_IDS.truncated, 'CA');
    await db.insert(assessments).values({
        propertyId: truncatedId,
        assessedYear: 2025,
        assessedValue: '500000.00',
    });
    await seedTx(truncatedId, {
        type: 'Arms Length',
        saleDate: '2026-02-10',
        recordingDate: '2026-02-12',
        price: '300000.00',
        buyerName: FULL_SELLER_NAME,
        sellerName: 'ORIGINAL OWNER OF FRESNO',
    });
    truncatedResaleTxId = await seedTx(truncatedId, {
        type: 'Arms Length',
        saleDate: '2026-05-15',
        recordingDate: '2026-05-17',
        price: '450000.00',
        buyerName: 'FINAL RETAIL BUYER LLC',
        sellerName: TRUNCATED_SELLER_NAME,
    });

    // ── Non-CA property with data that WOULD bill if the state gate failed ──
    nonCaId = await seedProperty(SFR_IDS.nonCa, 'WA');
    await db.insert(assessments).values({
        propertyId: nonCaId,
        assessedYear: 2025,
        assessedValue: '122000.00',
    });
    await seedTx(nonCaId, {
        type: 'Arms Length',
        saleDate: '2026-08-20',
        recordingDate: '2026-08-25',
        price: '1000000.00',
        buyerName: 'SEATTLE BUYER LLC',
        sellerName: 'SEATTLE SELLER LLC',
    });

    // ── Skip reasons: one no-price transaction, one with no resolvable prior value ──
    skipsId = await seedProperty(SFR_IDS.skips, 'CA');
    await seedTx(skipsId, {
        type: 'Arms Length',
        saleDate: '2026-08-01',
        recordingDate: '2026-08-03',
        price: null,
        buyerName: 'NO PRICE BUYER',
        sellerName: 'NO PRICE SELLER',
    });
    await seedTx(skipsId, {
        type: 'Arms Length',
        saleDate: '2020-05-01',
        recordingDate: '2020-05-03',
        price: '600000.00',
        buyerName: 'CHAINLESS BUYER',
        sellerName: 'UNTRACEABLE PERSON',
    });

    // ── Zero difference: sale price equals the prior roll value ──
    zeroDiffId = await seedProperty(SFR_IDS.zeroDiff, 'CA');
    await db.insert(assessments).values({
        propertyId: zeroDiffId,
        assessedYear: 2025,
        assessedValue: '700000.00',
    });
    await seedTx(zeroDiffId, {
        type: 'Arms Length',
        saleDate: '2026-08-10',
        recordingDate: '2026-08-12',
        price: '700000.00',
        buyerName: 'BREAK EVEN BUYER',
        sellerName: 'BREAK EVEN SELLER',
    });

    // ── Lowercase state code: addresses.state is stored verbatim from SFR, so the
    // gate must be case-insensitive or this property silently gets no bills ──
    lowercaseStateId = await seedProperty(SFR_IDS.lowercaseState, 'ca');
    await db.insert(assessments).values({
        propertyId: lowercaseStateId,
        assessedYear: 2025,
        assessedValue: '122000.00',
    });
    await seedTx(lowercaseStateId, {
        type: 'Arms Length',
        saleDate: '2026-07-20',
        recordingDate: '2026-07-25',
        price: '1000000.00',
        buyerName: 'LOWERCASE STATE BUYER LLC',
        sellerName: 'LOWERCASE STATE SELLER',
    });

    firstRun = await syncSupplementalTaxForProperties([
        workedExampleId,
        flipId,
        truncatedId,
        nonCaId,
        skipsId,
        zeroDiffId,
        lowercaseStateId,
    ]);
});

afterAll(async () => {
    // Cascades to addresses, assessments, transactions, and bills.
    await db.delete(properties).where(inArray(properties.sfrPropertyId, Object.values(SFR_IDS)));
});

describe('syncSupplementalTaxForProperties', () => {
    it('syncSupplementalTaxForProperties — long-held CA property — persists the assessment-based bill (§2 worked example)', async () => {
        const rows = await billsFor(workedExampleId);
        expect(rows).toHaveLength(1);
        const [bill] = rows;
        expect(bill.billType).toBe('bill');
        expect(bill.priorValueSource).toBe('assessment');
        expect(bill.fiscalYear).toBe(2026);
        expect(Number(bill.priorAssessedValue)).toBe(122_000);
        expect(Number(bill.newBaseValue)).toBe(1_000_000);
        expect(Number(bill.netSupplementalValue)).toBe(878_000);
        // August event → presumed Sep 1 → statutory factor 0.83 (§75.41(c))
        expect(Number(bill.prorationFactor)).toBe(0.83);
        // 878,000 × 0.0125 × 0.83
        expect(Number(bill.amount)).toBe(9_109.25);
    });

    it('syncSupplementalTaxForProperties — flip resold after the lien date — seller acquisition beats the stale roll (bill, not refund)', async () => {
        const rows = await db
            .select()
            .from(supplementalTaxBills)
            .where(eq(supplementalTaxBills.propertyTransactionId, flipResaleTxId))
            .orderBy(asc(supplementalTaxBills.fiscalYear));
        // April event → prorated current-FY row + full next-FY row
        expect(rows).toHaveLength(2);
        for (const row of rows) {
            expect(row.billType).toBe('bill');
            expect(row.priorValueSource).toBe('prior_transaction');
            expect(Number(row.priorAssessedValue)).toBe(285_000);
            expect(Number(row.netSupplementalValue)).toBe(125_000);
        }
        expect(rows[0].fiscalYear).toBe(2025);
        // April event → presumed May 1 → statutory factor 0.17
        expect(Number(rows[0].prorationFactor)).toBe(0.17);
        // 125,000 × 0.0125 × 0.17 = 265.625 → rounds to cents
        expect(Number(rows[0].amount)).toBe(265.63);
        expect(rows[1].fiscalYear).toBe(2026);
        expect(Number(rows[1].prorationFactor)).toBe(1);
        expect(Number(rows[1].amount)).toBe(1_562.5);
    });

    it('syncSupplementalTaxForProperties — 40-char truncated seller name — repair links the chain and traces the acquisition', async () => {
        expect(TRUNCATED_SELLER_NAME).toHaveLength(40);
        const rows = await db
            .select()
            .from(supplementalTaxBills)
            .where(eq(supplementalTaxBills.propertyTransactionId, truncatedResaleTxId))
            .orderBy(asc(supplementalTaxBills.fiscalYear));
        // Without the repair the trace fails and the 500k roll would mislabel this
        // 300k → 450k resale as a refund.
        expect(rows).toHaveLength(2);
        for (const row of rows) {
            expect(row.billType).toBe('bill');
            expect(row.priorValueSource).toBe('prior_transaction');
            expect(Number(row.priorAssessedValue)).toBe(300_000);
        }
        // May event → presumed Jun 1 → factor 0.08: 150,000 × 0.0125 × 0.08
        expect(Number(rows[0].amount)).toBe(150);
        expect(Number(rows[1].amount)).toBe(1_875); // next FY at 1.00
    });

    it('syncSupplementalTaxForProperties — non-CA property — produces no rows', async () => {
        expect(await billsFor(nonCaId)).toHaveLength(0);
    });

    it('syncSupplementalTaxForProperties — lowercase state code — gate is case-insensitive', async () => {
        const rows = await billsFor(lowercaseStateId);
        expect(rows).toHaveLength(1);
        // July event → presumed Aug 1 → factor 0.92: 878,000 × 0.0125 × 0.92
        expect(Number(rows[0].prorationFactor)).toBe(0.92);
        expect(Number(rows[0].amount)).toBe(10_097);
    });

    it('syncSupplementalTaxForProperties — skip reasons — each counted once and summed into skippedTotal', async () => {
        expect(firstRun.supplementalStateProperties).toBe(6);
        expect(firstRun.skippedNoPrice).toBe(1);
        expect(firstRun.skippedNoPriorValue).toBe(1);
        expect(firstRun.skippedZeroOrInvalid).toBe(1);
        expect(firstRun.skippedTotal).toBe(3);
        expect(firstRun.billRowsWritten).toBe(6);
        expect(firstRun.refundRowsWritten).toBe(4);
        expect(firstRun.rowsWritten).toBe(10);
        expect(firstRun.failedProperties).toBe(0);
        expect(await billsFor(skipsId)).toHaveLength(0);
        expect(await billsFor(zeroDiffId)).toHaveLength(0);
    });

    it('syncSupplementalTaxForProperties — re-run — refreshes rows in place via the upsert (idempotent)', async () => {
        const again = await syncSupplementalTaxForProperties([workedExampleId]);
        expect(again.rowsWritten).toBe(1); // same (transaction, FY) row rewritten, not duplicated
        const rows = await billsFor(workedExampleId);
        expect(rows).toHaveLength(1);
        expect(Number(rows[0].amount)).toBe(9_109.25);
    });

    it('syncSupplementalTaxForProperties — recompute — purges rows the recomputation no longer produces', async () => {
        // A stale orphan (e.g. left behind by an older FY-labeling model) on the same
        // transaction: a plain upsert can never remove it, --recompute must.
        await db.insert(supplementalTaxBills).values({
            propertyId: workedExampleId,
            propertyTransactionId: workedExampleTxId,
            fiscalYear: 1999,
            billType: 'bill',
            priorAssessedValue: '1.00',
            newBaseValue: '2.00',
            netSupplementalValue: '1.00',
            taxRate: '0.0125',
            prorationFactor: '1',
            amount: '0.01',
            priorValueSource: 'assessment',
        });

        const recomputed = await syncSupplementalTaxForProperties([workedExampleId], {
            recompute: true,
        });
        expect(recomputed.rowsWritten).toBe(1);
        const rows = await billsFor(workedExampleId);
        expect(rows).toHaveLength(1); // orphan purged, fresh row kept
        expect(rows[0].fiscalYear).toBe(2026);
        expect(Number(rows[0].amount)).toBe(9_109.25);
    });
});

describe('insertSupplementalTaxBills', () => {
    it('insertSupplementalTaxBills — pipeline items — resolves SFR ids to property UUIDs and computes', async () => {
        // The step only reads property.property_id from each item; the rest of the
        // pipeline shape is irrelevant to it.
        const items = [
            { property: { property_id: SFR_IDS.workedExample } },
        ] as unknown as PropertyWithStatus[];
        const result = await insertSupplementalTaxBills(items, 'TEST');
        expect(result.supplementalStateProperties).toBe(1);
        expect(result.rowsWritten).toBe(1); // existing row refreshed via the upsert
        expect(await billsFor(workedExampleId)).toHaveLength(1);
    });

    it('insertSupplementalTaxBills — no resolvable SFR ids — returns the empty result without querying', async () => {
        const items = [{ property: {} }] as unknown as PropertyWithStatus[];
        const result = await insertSupplementalTaxBills(items, 'TEST');
        expect(result.supplementalStateProperties).toBe(0);
        expect(result.rowsWritten).toBe(0);
    });
});
