import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { deals } from '@database/schemas/deals.schema';
import { msas } from '@database/schemas/msas.schema';
import { setupIntegrationUsers } from '../../../helpers/setup';
import { assignSubscription, getTestDb } from '../../../helpers/db';

// GET /api/deals county filtering (issue #120): with an `msa` param the query filters
// `county IN (...)` restricted to that MSA's tracked counties — a county from another MSA is
// dropped, and no (valid) counties selected returns nothing. Mirrors the #119 contract on
// GET /api/properties (countyFilter.integration.test.ts).
//
// The test DB holds deals from other files running in parallel, so every request pins
// `userId` to this file's deal owner and asserts against the seeded deal ids.

// ── Test user IDs (unique to this file — files run in parallel) ─────────────
const ACTING_USER_ID = '00000000-0000-0000-0000-000000000120';
const DEAL_OWNER_ID = '00000000-0000-0000-0000-000000001120';

const { getApp } = setupIntegrationUsers(ACTING_USER_ID, DEAL_OWNER_ID);

const DENVER_MSA = 'Denver-Aurora-Centennial, CO';
const SAN_DIEGO_MSA = 'San Diego-Chula Vista-Carlsbad, CA';

const SEEDS = [
    { county: 'Denver', msa: DENVER_MSA, state: 'CO', zipCode: '80202' },
    { county: 'Adams', msa: DENVER_MSA, state: 'CO', zipCode: '80229' },
    { county: 'Douglas', msa: DENVER_MSA, state: 'CO', zipCode: '80104' },
    { county: 'San Diego', msa: SAN_DIEGO_MSA, state: 'CA', zipCode: '92101' },
];

const db = getTestDb();

const idsByCounty = new Map<string, number>();
let nullCountyDealId: number;

// setupIntegrationUsers strips roles/subscription before each test; the list route
// needs an app-access tier, so re-assign per test.
beforeEach(async () => {
    await assignSubscription(ACTING_USER_ID, 'basic');
});

// Seeded deals are cascade-deleted when DEAL_OWNER_ID is torn down by afterAll.
beforeAll(async () => {
    const msaIdsByName = new Map<string, number>();
    for (const msaName of [DENVER_MSA, SAN_DIEGO_MSA]) {
        let [msa] = await db.select().from(msas).where(eq(msas.name, msaName)).limit(1);
        if (!msa) {
            [msa] = await db.insert(msas).values({ name: msaName }).returning();
        }
        msaIdsByName.set(msaName, msa.id);
    }

    for (const seed of SEEDS) {
        const [deal] = await db
            .insert(deals)
            .values({
                userId: DEAL_OWNER_ID,
                msaId: msaIdsByName.get(seed.msa),
                type: 'wholesale',
                city: 'Integration Test',
                state: seed.state,
                zipCode: seed.zipCode,
                county: seed.county,
            })
            .returning({ id: deals.id });
        idsByCounty.set(seed.county, deal.id);
    }

    // A deal whose county never resolved — must not match any county-set query.
    const [nullCountyDeal] = await db
        .insert(deals)
        .values({
            userId: DEAL_OWNER_ID,
            msaId: msaIdsByName.get(DENVER_MSA),
            type: 'wholesale',
            city: 'Integration Test',
            state: 'CO',
            zipCode: '80014',
            county: null,
        })
        .returning({ id: deals.id });
    nullCountyDealId = nullCountyDeal.id;
});

async function fetchIds(query: Record<string, string | string[]>): Promise<number[]> {
    const res = await request(getApp())
        .get('/api/deals')
        .query({ userId: DEAL_OWNER_ID, limit: '50', ...query })
        .set('x-test-user-id', ACTING_USER_ID);
    expect(res.status).toBe(200);
    return res.body.deals.map((d: { id: number }) => d.id).sort();
}

function expectedIds(...counties: string[]): number[] {
    return counties.map((c) => idsByCounty.get(c)!).sort();
}

describe('GET /api/deals — county IN (...) scoped to MSA (integration)', () => {
    it('msa + several counties — returns exactly those counties’ deals', async () => {
        const ids = await fetchIds({ msa: DENVER_MSA, county: ['Denver', 'Adams'] });
        expect(ids).toEqual(expectedIds('Denver', 'Adams'));
    });

    it('msa + one county — returns only that county’s deals', async () => {
        const ids = await fetchIds({ msa: SAN_DIEGO_MSA, county: 'San Diego' });
        expect(ids).toEqual(expectedIds('San Diego'));
    });

    it('msa + a county from another MSA — the foreign county is dropped, never crosses the MSA', async () => {
        const ids = await fetchIds({ msa: DENVER_MSA, county: ['Denver', 'San Diego'] });
        expect(ids).toEqual(expectedIds('Denver'));
    });

    it('msa with no counties — returns no deals and total 0', async () => {
        const res = await request(getApp())
            .get('/api/deals')
            .query({ userId: DEAL_OWNER_ID, msa: DENVER_MSA })
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(200);
        expect(res.body.deals).toEqual([]);
        expect(res.body.total).toBe(0);
    });

    it('msa with only foreign counties — empty intersection returns no deals', async () => {
        const res = await request(getApp())
            .get('/api/deals')
            .query({ userId: DEAL_OWNER_ID, msa: SAN_DIEGO_MSA, county: ['Denver', 'Adams'] })
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(200);
        expect(res.body.deals).toEqual([]);
        expect(res.body.total).toBe(0);
    });

    it('a null-county deal is never matched by a county-set query', async () => {
        const ids = await fetchIds({
            msa: DENVER_MSA,
            county: ['Denver', 'Adams', 'Douglas'],
        });
        expect(ids).not.toContain(nullCountyDealId);
        expect(ids).toEqual(expectedIds('Denver', 'Adams', 'Douglas'));
    });

    it('legacy county without msa — single-county filtering still works', async () => {
        const ids = await fetchIds({ county: 'Adams' });
        expect(ids).toEqual(expectedIds('Adams'));
    });
});
