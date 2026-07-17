import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { inArray } from 'drizzle-orm';
import { properties, addresses, propertyTransactions } from '@database/schemas/properties.schema';
import { setupIntegrationUsers } from '../../../helpers/setup';
import { assignSubscription, getTestDb } from '../../../helpers/db';

// GET /api/properties county filtering (issue #119): with an `msa` param the query filters
// `county IN (...)` restricted to that MSA's tracked counties — a county from another MSA is
// dropped, and no (valid) counties selected returns nothing. Without `msa`, the legacy
// single-county equality still works for callers that never send an MSA (admin tools).
//
// The test DB holds real synced rows, so every request pins `search` to a marker unique to
// this file and asserts against the seeded property ids, not raw counts.

// ── Test user IDs (unique to this file — files run in parallel) ─────────────
const ACTING_USER_ID = '00000000-0000-0000-0000-000000000119';
const TARGET_USER_ID = '00000000-0000-0000-0000-000000001119';

const { getApp } = setupIntegrationUsers(ACTING_USER_ID, TARGET_USER_ID);

const DENVER_MSA = 'Denver-Aurora-Centennial, CO';
const SAN_DIEGO_MSA = 'San Diego-Chula Vista-Carlsbad, CA';
const SEARCH_MARKER = 'county119';

const SEEDS = [
    { sfrPropertyId: 954_119_780_001, county: 'Denver', msa: DENVER_MSA, state: 'CO' },
    { sfrPropertyId: 954_119_780_002, county: 'Adams', msa: DENVER_MSA, state: 'CO' },
    { sfrPropertyId: 954_119_780_003, county: 'Douglas', msa: DENVER_MSA, state: 'CO' },
    { sfrPropertyId: 954_119_780_004, county: 'San Diego', msa: SAN_DIEGO_MSA, state: 'CA' },
];
const SFR_IDS = SEEDS.map((s) => s.sfrPropertyId);

const db = getTestDb();

const idsByCounty = new Map<string, string>();

// setupIntegrationUsers strips roles/subscription before each test; the list route
// needs an app-access tier, so re-assign per test.
beforeEach(async () => {
    await assignSubscription(ACTING_USER_ID, 'basic');
});

beforeAll(async () => {
    // Idempotent cleanup in case a prior run died before afterAll.
    await db.delete(properties).where(inArray(properties.sfrPropertyId, SFR_IDS));

    for (const seed of SEEDS) {
        const [row] = await db
            .insert(properties)
            .values({
                sfrPropertyId: seed.sfrPropertyId,
                msa: seed.msa,
                county: seed.county,
                propertyType: 'Single Family',
            })
            .returning({ id: properties.id });
        idsByCounty.set(seed.county, row.id);

        await db.insert(addresses).values({
            propertyId: row.id,
            formattedStreetAddress: `${seed.sfrPropertyId} ${SEARCH_MARKER} AVE`,
            city: 'Integration Test',
            state: seed.state,
            county: seed.county,
            zipCode: '99119',
        });
        await db.insert(propertyTransactions).values({
            propertyId: row.id,
            transactionType: 'Arms Length',
            saleDate: '2026-05-01',
            recordingDate: '2026-05-01',
            salePrice: '500000.00',
            buyerName: 'COUNTY119 BUYER LLC',
            sellerName: 'COUNTY119 SELLER LLC',
        });
    }
});

afterAll(async () => {
    // Cascades to addresses and transactions.
    await db.delete(properties).where(inArray(properties.sfrPropertyId, SFR_IDS));
});

async function fetchIds(query: Record<string, string | string[]>): Promise<string[]> {
    const res = await request(getApp())
        .get('/api/properties')
        .query({ search: SEARCH_MARKER, limit: '50', ...query })
        .set('x-test-user-id', ACTING_USER_ID);
    expect(res.status).toBe(200);
    return res.body.properties.map((p: { id: string }) => p.id).sort();
}

function expectedIds(...counties: string[]): string[] {
    return counties.map((c) => idsByCounty.get(c)!).sort();
}

describe('GET /api/properties — county IN (...) scoped to MSA (integration)', () => {
    it('msa + several counties — returns exactly those counties’ rows', async () => {
        const ids = await fetchIds({ msa: DENVER_MSA, county: ['Denver', 'Adams'] });
        expect(ids).toEqual(expectedIds('Denver', 'Adams'));
    });

    it('msa + one county — returns only that county’s rows', async () => {
        const ids = await fetchIds({ msa: SAN_DIEGO_MSA, county: 'San Diego' });
        expect(ids).toEqual(expectedIds('San Diego'));
    });

    it('msa + a county from another MSA — the foreign county is dropped, never crosses the MSA', async () => {
        const ids = await fetchIds({ msa: DENVER_MSA, county: ['Denver', 'San Diego'] });
        expect(ids).toEqual(expectedIds('Denver'));
    });

    it('msa with no counties — returns no properties and total 0', async () => {
        const res = await request(getApp())
            .get('/api/properties')
            .query({ search: SEARCH_MARKER, msa: DENVER_MSA })
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(200);
        expect(res.body.properties).toEqual([]);
        expect(res.body.total).toBe(0);
    });

    it('msa with only foreign counties — empty intersection returns no properties', async () => {
        const res = await request(getApp())
            .get('/api/properties')
            .query({ search: SEARCH_MARKER, msa: SAN_DIEGO_MSA, county: ['Denver', 'Adams'] })
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(200);
        expect(res.body.properties).toEqual([]);
        expect(res.body.total).toBe(0);
    });

    it('legacy county without msa — single-county filtering still works', async () => {
        const ids = await fetchIds({ county: 'Adams' });
        expect(ids).toEqual(expectedIds('Adams'));
    });
});
