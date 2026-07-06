import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import {
    properties,
    addresses,
    propertyTransactions,
    supplementalTaxBills,
} from '@database/schemas/properties.schema';
import { setupIntegrationUsers } from '../../../helpers/setup';
import { assignRole, assignSubscription, getTestDb } from '../../../helpers/db';
import { isAdminOrOwner } from 'server/services/users/users.services';

// Field-level visibility of supplemental-tax data (access-control.md §5.2): the detail
// route's per-transaction `supplementalTax` accrual and `supplementalTaxBills` audit rows
// are returned only to admin/owner callers — resolved from the session via isAdminOrOwner,
// never from query params. Everyone else receives null / [] on every transaction; this is
// response shaping, not a 403. The LIST route carries no supplemental-tax data at all
// (the v1 `supplementalTaxBill` card field was removed in v2).
//
// server/storage is NOT mocked — routes, middleware, and services run real DB queries
// against the Neon test branch, so removing the controller gate breaks these tests.

// ── Test user IDs (unique to this file — files run in parallel) ─────────────
const ACTING_USER_ID = '00000000-0000-0000-0000-000000000751';
const TARGET_USER_ID = '00000000-0000-0000-0000-000000000752';

const { getApp } = setupIntegrationUsers(ACTING_USER_ID, TARGET_USER_ID);

// Unique seed data for this file: SFR id + zip, so the list route can isolate our row.
const SFR_PROPERTY_ID = 954_321_780_001;
const TEST_ZIP = '99981';

// Seeded bills on the April acquisition: one bill (−100.00, FY 2025) + one refund
// (+25.00, FY 2026) across the two fiscal years of a Jan–May event. The August resale
// closes the buyer's window at 4 presumed-date months (May 1 → Sep 1), so the accrual
// is deterministic regardless of when the tests run: the FY-2025 slot (billed May–Jun)
// is fully owned (−100) and the FY-2026 full-year slot is owned Jul–Aug = 2/12
// (+25 × 2/12 = +4.17) → −95.83, final.
const EXPECTED_ACCRUED = { amount: -95.83, monthsOwned: 4, status: 'final' };

const db = getTestDb();

let propertyId: string;
let acquisitionTxId: number;
let resaleTxId: number;

beforeAll(async () => {
    // Idempotent cleanup in case a prior run died before afterAll.
    await db.delete(properties).where(eq(properties.sfrPropertyId, SFR_PROPERTY_ID));

    const [property] = await db
        .insert(properties)
        .values({ sfrPropertyId: SFR_PROPERTY_ID })
        .returning({ id: properties.id });
    propertyId = property.id;

    await db.insert(addresses).values({
        propertyId,
        state: 'CA',
        city: 'Integration Test',
        zipCode: TEST_ZIP,
    });

    const [acquisitionTx] = await db
        .insert(propertyTransactions)
        .values({
            propertyId,
            transactionType: 'Arms Length',
            saleDate: '2026-04-20',
            recordingDate: '2026-04-22',
            salePrice: '410000.00',
            buyerName: 'VISIBILITY TEST BUYER LLC',
            sellerName: 'VISIBILITY TEST SELLER',
        })
        .returning({ id: propertyTransactions.propertyTransactionsId });
    acquisitionTxId = acquisitionTx.id;

    // The resale closes the acquisition buyer's ownership window (flip) so the accrued
    // amount is time-independent. It has no bill rows of its own.
    const [resaleTx] = await db
        .insert(propertyTransactions)
        .values({
            propertyId,
            transactionType: 'Arms Length',
            saleDate: '2026-08-15',
            recordingDate: '2026-08-17',
            salePrice: '520000.00',
            buyerName: 'VISIBILITY TEST NEXT BUYER LLC',
            sellerName: 'VISIBILITY TEST BUYER LLC',
        })
        .returning({ id: propertyTransactions.propertyTransactionsId });
    resaleTxId = resaleTx.id;

    await db.insert(supplementalTaxBills).values([
        {
            propertyId,
            propertyTransactionId: acquisitionTxId,
            fiscalYear: 2025,
            billType: 'bill',
            priorAssessedValue: '285000.00',
            newBaseValue: '410000.00',
            netSupplementalValue: '125000.00',
            taxRate: '0.0125',
            prorationFactor: '0.17',
            amount: '100.00',
            priorValueSource: 'prior_transaction',
        },
        {
            propertyId,
            propertyTransactionId: acquisitionTxId,
            fiscalYear: 2026,
            billType: 'refund',
            priorAssessedValue: '285000.00',
            newBaseValue: '410000.00',
            netSupplementalValue: '125000.00',
            taxRate: '0.0125',
            prorationFactor: '1',
            amount: '25.00',
            priorValueSource: 'prior_transaction',
        },
    ]);
});

afterAll(async () => {
    // Cascades to the address, transactions, and bills.
    await db.delete(properties).where(eq(properties.id, propertyId));
});

// ── Helpers ────────────────────────────────────────────────────────────────
function getDetail(userId?: string) {
    const req = request(getApp()).get(`/api/properties/${propertyId}`);
    return userId ? req.set('x-test-user-id', userId) : req;
}

function getList(userId?: string) {
    const req = request(getApp()).get('/api/properties').query({ zipcode: TEST_ZIP });
    return userId ? req.set('x-test-user-id', userId) : req;
}

type DetailTx = {
    id: number;
    supplementalTax: { amount: number; monthsOwned: number; status: string } | null;
    supplementalTaxBills: Array<Record<string, unknown>>;
};

function findTx(body: { transactions: DetailTx[] }, txId: number): DetailTx | undefined {
    return body.transactions.find((tx) => tx.id === txId);
}

// ── GET /api/properties/:id — public route, admin/owner-only fields ────────
describe('GET /api/properties/:id — per-transaction supplementalTax visibility (integration)', () => {
    it('GET /api/properties/:id — admin — acquisition row carries the accrued ownership-window amount', async () => {
        await assignRole(ACTING_USER_ID, 'admin');
        const res = await getDetail(ACTING_USER_ID);
        expect(res.status).toBe(200);

        // Transactions come back newest-first: resale, then acquisition.
        expect(res.body.transactions.map((tx: DetailTx) => tx.id)).toEqual([
            resaleTxId,
            acquisitionTxId,
        ]);

        const acquisition = findTx(res.body, acquisitionTxId);
        expect(acquisition?.supplementalTax).toEqual(EXPECTED_ACCRUED);

        // Audit breakdown: the stored statutory rows, numeric-typed.
        expect(acquisition?.supplementalTaxBills).toHaveLength(2);
        expect(acquisition?.supplementalTaxBills[0]).toMatchObject({
            fiscalYear: 2025,
            billType: 'bill',
            amount: 100,
            priorAssessedValue: 285000,
            priorValueSource: 'prior_transaction',
            netSupplementalValue: 125000,
            taxRate: 0.0125,
            prorationFactor: 0.17,
        });
    });

    it('GET /api/properties/:id — admin — resale row (no bills) has null supplementalTax', async () => {
        await assignRole(ACTING_USER_ID, 'admin');
        const res = await getDetail(ACTING_USER_ID);
        expect(res.status).toBe(200);
        const resale = findTx(res.body, resaleTxId);
        expect(resale?.supplementalTax).toBeNull();
        expect(resale?.supplementalTaxBills).toEqual([]);
    });

    it('GET /api/properties/:id — owner — includes the accrued amount', async () => {
        await assignRole(ACTING_USER_ID, 'owner');
        const res = await getDetail(ACTING_USER_ID);
        expect(res.status).toBe(200);
        expect(findTx(res.body, acquisitionTxId)?.supplementalTax).toEqual(EXPECTED_ACCRUED);
    });

    it('GET /api/properties/:id — member (boundary role) — transactions present, SBT fields empty', async () => {
        await assignRole(ACTING_USER_ID, 'member');
        const res = await getDetail(ACTING_USER_ID);
        expect(res.status).toBe(200);
        expect(res.body.transactions).toHaveLength(2);
        for (const tx of res.body.transactions as DetailTx[]) {
            expect(tx.supplementalTax).toBeNull();
            expect(tx.supplementalTaxBills).toEqual([]);
        }
    });

    it('GET /api/properties/:id — unauthenticated — 200 (public route) with SBT fields empty', async () => {
        const res = await getDetail();
        expect(res.status).toBe(200);
        for (const tx of res.body.transactions as DetailTx[]) {
            expect(tx.supplementalTax).toBeNull();
            expect(tx.supplementalTaxBills).toEqual([]);
        }
    });

    it('GET /api/properties/:id — the v1 supplementalTaxBill field is gone', async () => {
        await assignRole(ACTING_USER_ID, 'admin');
        const res = await getDetail(ACTING_USER_ID);
        expect(res.status).toBe(200);
        expect(res.body).not.toHaveProperty('supplementalTaxBill');
    });
});

// ── GET /api/properties — requireSub-gated route, no supplemental-tax data ─
describe('GET /api/properties — supplemental tax removed from list rows (integration)', () => {
    it('GET /api/properties — admin — list rows carry no supplementalTaxBill field', async () => {
        await assignRole(ACTING_USER_ID, 'admin');
        const res = await getList(ACTING_USER_ID);
        expect(res.status).toBe(200);
        const row = res.body.properties.find((p: { id: string }) => p.id === propertyId);
        expect(row).toBeDefined();
        expect(row).not.toHaveProperty('supplementalTaxBill');
    });

    it('GET /api/properties — member (bypass role) — list rows carry no supplementalTaxBill field', async () => {
        await assignRole(ACTING_USER_ID, 'member');
        const res = await getList(ACTING_USER_ID);
        expect(res.status).toBe(200);
        const row = res.body.properties.find((p: { id: string }) => p.id === propertyId);
        expect(row).toBeDefined();
        expect(row).not.toHaveProperty('supplementalTaxBill');
    });

    it('GET /api/properties — basic subscriber, no role — 200 without supplemental-tax data', async () => {
        await assignSubscription(ACTING_USER_ID, 'basic');
        const res = await getList(ACTING_USER_ID);
        expect(res.status).toBe(200);
        const row = res.body.properties.find((p: { id: string }) => p.id === propertyId);
        expect(row).toBeDefined();
        expect(row).not.toHaveProperty('supplementalTaxBill');
    });

    it('GET /api/properties — authenticated, no sub, no role — returns 403', async () => {
        const res = await getList(ACTING_USER_ID);
        expect(res.status).toBe(403);
    });

    it('GET /api/properties — unauthenticated — returns 401', async () => {
        const res = await getList();
        expect(res.status).toBe(401);
    });
});

// ── isAdminOrOwner — the service check behind the controller gate ──────────
describe('isAdminOrOwner (integration)', () => {
    it('isAdminOrOwner — admin role — true', async () => {
        await assignRole(ACTING_USER_ID, 'admin');
        expect(await isAdminOrOwner(ACTING_USER_ID)).toBe(true);
    });

    it('isAdminOrOwner — owner role — true', async () => {
        await assignRole(ACTING_USER_ID, 'owner');
        expect(await isAdminOrOwner(ACTING_USER_ID)).toBe(true);
    });

    it('isAdminOrOwner — member role — false', async () => {
        await assignRole(ACTING_USER_ID, 'member');
        expect(await isAdminOrOwner(ACTING_USER_ID)).toBe(false);
    });

    it('isAdminOrOwner — relationship-manager role — false', async () => {
        await assignRole(ACTING_USER_ID, 'relationship-manager');
        expect(await isAdminOrOwner(ACTING_USER_ID)).toBe(false);
    });

    it('isAdminOrOwner — no roles — false', async () => {
        expect(await isAdminOrOwner(ACTING_USER_ID)).toBe(false);
    });

    it('isAdminOrOwner — undefined userId (no session) — false', async () => {
        expect(await isAdminOrOwner(undefined)).toBe(false);
    });
});
