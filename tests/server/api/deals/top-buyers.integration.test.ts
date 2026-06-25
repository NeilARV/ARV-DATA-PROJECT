import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { setupIntegrationUsers } from '../../../helpers/setup';
import { assignRole, assignSubscription, getTestDb } from '../../../helpers/db';
import { deals } from '@database/schemas/deals.schema';
import { msas } from '@database/schemas/msas.schema';
import { eq } from 'drizzle-orm';

// ── Test user IDs ──────────────────────────────────────────────────────────
// Unique suffixes so this file can run concurrently with other integration files.
const ACTING_USER_ID = '00000000-0000-0000-0000-000000000012';
const DEAL_OWNER_ID = '00000000-0000-0000-0000-000000000013';

// Seeds both users; clears ACTING_USER_ID's roles + subscription before each test.
const { getApp } = setupIntegrationUsers(ACTING_USER_ID, DEAL_OWNER_ID);

let seededDealId: number;

const MSA_NAME = 'San Diego-Chula Vista-Carlsbad, CA';

beforeAll(async () => {
    const db = getTestDb();

    let [msa] = await db.select().from(msas).where(eq(msas.name, MSA_NAME)).limit(1);
    if (!msa) {
        [msa] = await db.insert(msas).values({ name: MSA_NAME }).returning();
    }

    // The owner needs a bypass role to clear requireSub before the service ownership check runs.
    await assignRole(DEAL_OWNER_ID, 'member');

    const [deal] = await db
        .insert(deals)
        .values({
            userId: DEAL_OWNER_ID,
            msaId: msa.id,
            type: 'wholesale',
            city: 'San Diego',
            state: 'CA',
            zipCode: '92101',
            price: '350000',
        })
        .returning();
    seededDealId = deal.id;
});

// ── Helpers ────────────────────────────────────────────────────────────────

function getTopBuyers(actingUserId: string | null, dealId: number = seededDealId) {
    const req = request(getApp()).get(`/api/deals/${dealId}/top-buyers`);
    if (actingUserId) req.set('x-test-user-id', actingUserId);
    return req;
}

// ── GET /api/deals/:id/top-buyers — ownership enforcement ─────────────────────

describe('GET /api/deals/:id/top-buyers — ownership enforcement (integration)', () => {
    it('returns 200 with a topBuyers array when caller is the deal owner', async () => {
        const res = await getTopBuyers(DEAL_OWNER_ID);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.topBuyers)).toBe(true);
    });

    it('returns 200 when caller has admin role', async () => {
        await assignRole(ACTING_USER_ID, 'admin');
        expect((await getTopBuyers(ACTING_USER_ID)).status).toBe(200);
    });

    it('returns 200 when caller has relationship-manager role', async () => {
        await assignRole(ACTING_USER_ID, 'relationship-manager');
        expect((await getTopBuyers(ACTING_USER_ID)).status).toBe(200);
    });

    // member clears requireSub (bypass) but is not privileged → ownership check rejects.
    it('returns 403 when caller is a non-owner member', async () => {
        await assignRole(ACTING_USER_ID, 'member');
        expect((await getTopBuyers(ACTING_USER_ID)).status).toBe(403);
    });

    it('returns 403 when caller is a non-owner basic subscriber', async () => {
        await assignSubscription(ACTING_USER_ID, 'basic');
        expect((await getTopBuyers(ACTING_USER_ID)).status).toBe(403);
    });

    it('returns 404 when the deal does not exist', async () => {
        // member role clears requireSub so the request reaches the service 404.
        await assignRole(ACTING_USER_ID, 'member');
        expect((await getTopBuyers(ACTING_USER_ID, 99999999)).status).toBe(404);
    });
});

// ── GET /api/deals/:id/top-buyers — access gate (requireSub) ──────────────────

describe('GET /api/deals/:id/top-buyers — access gate (integration)', () => {
    it('returns 401 when there is no session', async () => {
        expect((await getTopBuyers(null)).status).toBe(401);
    });

    it('returns 403 when caller has no role or subscription', async () => {
        expect((await getTopBuyers(ACTING_USER_ID)).status).toBe(403);
    });
});
