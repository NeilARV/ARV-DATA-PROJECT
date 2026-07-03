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

// Field-level visibility of `supplementalTaxBill` (access-control.md §5.2): the signed
// supplemental-tax total on GET /api/properties and GET /api/properties/:id is returned
// only to admin/owner callers — resolved from the session via isAdminOrOwner, never from
// query params. Everyone else receives null; this is response shaping, not a 403.
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

// Seeded bills on the displayed sale: one bill (−100.00) + one refund (+25.00) across the
// two fiscal years of a Jan–May event → signed total −75 (bill = −, refund = +).
const EXPECTED_SIGNED_TOTAL = -75;

const db = getTestDb();

let propertyId: string;

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

    const [tx] = await db
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

    await db.insert(supplementalTaxBills).values([
        {
            propertyId,
            propertyTransactionId: tx.id,
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
            propertyTransactionId: tx.id,
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
    // Cascades to the address, transaction, and bills.
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

// ── GET /api/properties/:id — public route, admin/owner-only field ─────────
describe('GET /api/properties/:id — supplementalTaxBill visibility (integration)', () => {
    it('GET /api/properties/:id — admin — includes the signed supplemental-tax total', async () => {
        await assignRole(ACTING_USER_ID, 'admin');
        const res = await getDetail(ACTING_USER_ID);
        expect(res.status).toBe(200);
        expect(res.body.supplementalTaxBill).toBe(EXPECTED_SIGNED_TOTAL);
    });

    it('GET /api/properties/:id — owner — includes the signed supplemental-tax total', async () => {
        await assignRole(ACTING_USER_ID, 'owner');
        const res = await getDetail(ACTING_USER_ID);
        expect(res.status).toBe(200);
        expect(res.body.supplementalTaxBill).toBe(EXPECTED_SIGNED_TOTAL);
    });

    it('GET /api/properties/:id — member (boundary role) — supplementalTaxBill is null', async () => {
        await assignRole(ACTING_USER_ID, 'member');
        const res = await getDetail(ACTING_USER_ID);
        expect(res.status).toBe(200);
        expect(res.body.supplementalTaxBill).toBeNull();
    });

    it('GET /api/properties/:id — unauthenticated — 200 (public route) with null supplementalTaxBill', async () => {
        const res = await getDetail();
        expect(res.status).toBe(200);
        expect(res.body.supplementalTaxBill).toBeNull();
    });
});

// ── GET /api/properties — requireSub-gated route, admin/owner-only field ───
describe('GET /api/properties — supplementalTaxBill visibility (integration)', () => {
    it('GET /api/properties — admin — includes the signed supplemental-tax total', async () => {
        await assignRole(ACTING_USER_ID, 'admin');
        const res = await getList(ACTING_USER_ID);
        expect(res.status).toBe(200);
        const row = res.body.properties.find((p: { id: string }) => p.id === propertyId);
        expect(row).toBeDefined();
        expect(row.supplementalTaxBill).toBe(EXPECTED_SIGNED_TOTAL);
    });

    it('GET /api/properties — member (bypass role) — supplementalTaxBill is null', async () => {
        await assignRole(ACTING_USER_ID, 'member');
        const res = await getList(ACTING_USER_ID);
        expect(res.status).toBe(200);
        const row = res.body.properties.find((p: { id: string }) => p.id === propertyId);
        expect(row).toBeDefined();
        expect(row.supplementalTaxBill).toBeNull();
    });

    it('GET /api/properties — basic subscriber, no role — supplementalTaxBill is null', async () => {
        await assignSubscription(ACTING_USER_ID, 'basic');
        const res = await getList(ACTING_USER_ID);
        expect(res.status).toBe(200);
        const row = res.body.properties.find((p: { id: string }) => p.id === propertyId);
        expect(row).toBeDefined();
        expect(row.supplementalTaxBill).toBeNull();
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
