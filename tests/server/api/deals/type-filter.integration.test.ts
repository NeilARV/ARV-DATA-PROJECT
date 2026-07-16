import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { setupIntegrationUsers } from '../../../helpers/setup';
import { assignSubscription, getTestDb } from '../../../helpers/db';
import { deals } from '@database/schemas/deals.schema';
import { msas } from '@database/schemas/msas.schema';
import { eq } from 'drizzle-orm';

// ── Test user IDs ──────────────────────────────────────────────────────────
// Unique suffixes so this file can run concurrently with other integration files.
const ACTING_USER_ID = '00000000-0000-0000-0000-000000000016';
const DEAL_OWNER_ID = '00000000-0000-0000-0000-000000000017';

// Seeds both users; clears ACTING_USER_ID's roles + subscription before each test.
const { getApp } = setupIntegrationUsers(ACTING_USER_ID, DEAL_OWNER_ID);

const MSA_NAME = 'San Diego-Chula Vista-Carlsbad, CA';

// One deal per type, all owned by DEAL_OWNER_ID so list assertions can scope by
// userId and stay immune to deals seeded by concurrently running test files.
// Cascade-deleted when DEAL_OWNER_ID is torn down in afterAll.
beforeAll(async () => {
    const db = getTestDb();

    let [msa] = await db.select().from(msas).where(eq(msas.name, MSA_NAME)).limit(1);
    if (!msa) {
        [msa] = await db.insert(msas).values({ name: MSA_NAME }).returning();
    }

    await db.insert(deals).values(
        (['wholesale', 'agent', 'reo', 'sold'] as const).map((type) => ({
            userId: DEAL_OWNER_ID,
            msaId: msa.id,
            type,
            city: 'San Diego',
            state: 'CA',
            zipCode: '92101',
            price: '350000',
        })),
    );
});

// ── Helpers ────────────────────────────────────────────────────────────────

async function listDeals(query: Record<string, string>) {
    await assignSubscription(ACTING_USER_ID, 'basic');
    return request(getApp())
        .get('/api/deals')
        .query({ userId: DEAL_OWNER_ID, ...query })
        .set('x-test-user-id', ACTING_USER_ID);
}

function dealTypes(res: request.Response): string[] {
    return res.body.deals.map((d: { dealType: string }) => d.dealType);
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('GET /api/deals — type filter (integration)', () => {
    it('?type=wholesale — returns only wholesale deals', async () => {
        const res = await listDeals({ type: 'wholesale' });
        expect(res.status).toBe(200);
        expect(dealTypes(res)).toEqual(['wholesale']);
    });

    it('invalid type value — ignored, returns all types without error', async () => {
        const res = await listDeals({ type: 'bogus' });
        expect(res.status).toBe(200);
        expect(dealTypes(res).sort()).toEqual(['agent', 'reo', 'sold', 'wholesale']);
    });

    it('absent type — returns all types, including sold', async () => {
        const res = await listDeals({});
        expect(res.status).toBe(200);
        expect(dealTypes(res).sort()).toEqual(['agent', 'reo', 'sold', 'wholesale']);
    });
});

describe('GET /api/deals — removed status param (integration)', () => {
    it('?status=sold — ignored, returns all types without error', async () => {
        const res = await listDeals({ status: 'sold' });
        expect(res.status).toBe(200);
        expect(dealTypes(res).sort()).toEqual(['agent', 'reo', 'sold', 'wholesale']);
    });
});
