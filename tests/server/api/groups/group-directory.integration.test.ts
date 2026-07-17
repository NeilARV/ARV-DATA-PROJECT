import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { inArray, like, eq } from 'drizzle-orm';
import type { Express } from 'express';
import { companies, companyGroups, companyCounties } from '@database/schemas/companies.schema';
import { properties, addresses, propertyTransactions } from '@database/schemas/properties.schema';
import { statuses, propertyStatuses } from '@database/schemas/statuses.schema';
import type { GroupDirectoryRow } from '@shared/types/groups';
import { createTestApp } from '../../../helpers/setup';
import { getTestDb } from '../../../helpers/db';

// Integration coverage for the PUBLIC groups directory (GET /api/companies/groups): the two-or-more
// gate, county scoping (visibility + county-scoped stats, gate evaluated globally), per-sort
// aggregation grouped by group id (DISTINCT de-dup on distinct-property sorts, intra-group transfers
// included), zero-count filtering, and unauthenticated reachability.
//
// The test branch holds real synced data, so every fixture is namespaced to counties/names unique to
// this file and asserted by seeded id — never by raw totals across the whole response.

const PREFIX = 'GD90';
const COUNTY = 'GD90 County';
const OTHER_COUNTY = 'GD90 Other';
const STATE = 'CA';

const YEAR = new Date().getFullYear();
const YTD = `${YEAR}-01-05`; // within the year-to-date window
const PRIOR = `${YEAR - 1}-06-01`; // prior year → all-time only, excluded from YTD

const db = getTestDb();
let app: Express;
let wholesaleStatusId: number;
let sfrCounter = 954_090_000_000;
let nameCounter = 0;

// Seeded group ids, assigned in beforeAll.
let multiId: string; // 2 members, active on every sort
let splitId: string; // 2 members split across counties (global gate; county-scoped stats)
let otherId: string; // 2 members, all in OTHER_COUNTY (absent from COUNTY)
let singleId: string; // 1 member (singleton — never appears)
let zeroId: string; // 2 members, no activity (zero-count filtered)

// ── Seed helpers ─────────────────────────────────────────────────────────────

async function seedCompany(label: string, counties: [string, string][] = []): Promise<string> {
    const [row] = await db
        .insert(companies)
        .values({ companyName: `${PREFIX} CO ${label} #${nameCounter++} LLC` })
        .returning({ id: companies.id });
    for (const [county, state] of counties) {
        await db.insert(companyCounties).values({ companyId: row.id, county, state });
    }
    return row.id;
}

async function seedGroup(label: string, memberIds: string[]): Promise<string> {
    const [row] = await db
        .insert(companyGroups)
        .values({ name: `${PREFIX} GROUP ${label} #${nameCounter++}` })
        .returning({ id: companyGroups.id });
    if (memberIds.length > 0) {
        await db.update(companies).set({ groupId: row.id }).where(inArray(companies.id, memberIds));
    }
    return row.id;
}

async function seedProperty(county: string): Promise<string> {
    const sfr = sfrCounter++;
    const [row] = await db
        .insert(properties)
        .values({ sfrPropertyId: sfr, county, msa: 'GD90 MSA', propertyType: 'Single Family' })
        .returning({ id: properties.id });
    await db.insert(addresses).values({
        propertyId: row.id,
        county,
        state: STATE,
        city: 'Integration',
        zipCode: '90000',
        formattedStreetAddress: `${sfr} ${PREFIX} AVE`,
    });
    return row.id;
}

async function seedTx(opts: {
    propertyId: string;
    buyerId?: string;
    sellerId?: string;
    type?: string;
    recordingDate: string;
    sortOrder?: number;
}): Promise<void> {
    await db.insert(propertyTransactions).values({
        propertyId: opts.propertyId,
        buyerId: opts.buyerId ?? null,
        sellerId: opts.sellerId ?? null,
        transactionType: opts.type ?? 'Arms Length',
        saleDate: opts.recordingDate,
        recordingDate: opts.recordingDate,
        sortOrder: opts.sortOrder ?? 1,
    });
}

async function markWholesale(propertyId: string): Promise<void> {
    await db.insert(propertyStatuses).values({ propertyId, statusId: wholesaleStatusId });
}

async function cleanup(): Promise<void> {
    // Property counties are unique to this file, so this also clears a crashed prior run.
    // Deleting properties cascades their transactions/addresses/statuses.
    await db.delete(properties).where(inArray(properties.county, [COUNTY, OTHER_COUNTY]));
    // Groups first (SET NULLs companies.group_id), then companies (cascades company_counties).
    await db.delete(companyGroups).where(like(companyGroups.name, `${PREFIX}%`));
    await db.delete(companies).where(like(companies.companyName, `${PREFIX}%`));
}

const getGroups = (query: Record<string, string | string[]>, actor?: string) => {
    const req = request(app).get('/api/companies/groups').query(query);
    if (actor) req.set('x-test-user-id', actor);
    return req;
};

const findGroup = (body: { groups: GroupDirectoryRow[] }, id: string) =>
    body.groups.find((g) => g.id === id);

const COUNT_FIELDS: (keyof GroupDirectoryRow)[] = [
    'propertyCount',
    'propertiesSoldCount',
    'propertiesSoldCountAllTime',
    'propertiesBoughtCount',
    'propertiesBoughtCountAllTime',
    'wholesaleBuyCount',
    'wholesalerCount',
];

beforeAll(async () => {
    app = createTestApp();
    await cleanup();

    const [wholesale] = await db
        .select({ id: statuses.id })
        .from(statuses)
        .where(eq(statuses.name, 'wholesale'));
    wholesaleStatusId = wholesale.id;

    // ── MULTI: a1 + a2, both in COUNTY, active across every sort ──
    const a1 = await seedCompany('A1', [[COUNTY, STATE]]);
    const a2 = await seedCompany('A2', [[COUNTY, STATE]]);
    const xExt = await seedCompany('EXT'); // external, ungrouped — never a member
    multiId = await seedGroup('MULTI', [a1, a2]);

    const p1 = await seedProperty(COUNTY);
    const p2 = await seedProperty(COUNTY);
    const p3 = await seedProperty(COUNTY);
    const pShared = await seedProperty(COUNTY);
    const p4 = await seedProperty(COUNTY);
    const p5 = await seedProperty(COUNTY);
    const p6 = await seedProperty(COUNTY);

    await seedTx({ propertyId: p1, buyerId: a1, sellerId: xExt, recordingDate: YTD }); // a1 owns
    await seedTx({ propertyId: p2, buyerId: a2, sellerId: xExt, recordingDate: YTD }); // a2 owns
    await seedTx({ propertyId: p3, buyerId: a1, sellerId: xExt, recordingDate: PRIOR }); // a1 owns
    // pShared: two sort_order=1 rows, one per member → DISTINCT counts the property once for the group.
    await seedTx({ propertyId: pShared, buyerId: a1, sellerId: xExt, recordingDate: YTD });
    await seedTx({ propertyId: pShared, buyerId: a2, sellerId: xExt, recordingDate: YTD });
    await seedTx({ propertyId: p4, buyerId: xExt, sellerId: a1, recordingDate: YTD }); // a1 sold (YTD)
    await seedTx({ propertyId: p5, buyerId: xExt, sellerId: a2, recordingDate: PRIOR }); // a2 sold (prior)
    // p6: intra-group sale a1 → a2 on a wholesale property.
    await seedTx({ propertyId: p6, buyerId: a2, sellerId: a1, recordingDate: YTD });
    await markWholesale(p6);

    // ── SPLIT: b1 in COUNTY, b2 in OTHER_COUNTY (two-or-more gate is global) ──
    const b1 = await seedCompany('B1', [[COUNTY, STATE]]);
    const b2 = await seedCompany('B2', [[OTHER_COUNTY, STATE]]);
    splitId = await seedGroup('SPLIT', [b1, b2]);
    const pB1 = await seedProperty(COUNTY);
    const pB2 = await seedProperty(OTHER_COUNTY);
    await seedTx({ propertyId: pB1, buyerId: b1, sellerId: xExt, recordingDate: YTD });
    await seedTx({ propertyId: pB2, buyerId: b2, sellerId: xExt, recordingDate: YTD });

    // ── OTHER: both members only in OTHER_COUNTY (absent from COUNTY) ──
    const d1 = await seedCompany('D1', [[OTHER_COUNTY, STATE]]);
    const d2 = await seedCompany('D2', [[OTHER_COUNTY, STATE]]);
    otherId = await seedGroup('OTHER', [d1, d2]);
    const pD1 = await seedProperty(OTHER_COUNTY);
    await seedTx({ propertyId: pD1, buyerId: d1, sellerId: xExt, recordingDate: YTD });

    // ── SINGLE: one company (singleton — must never appear) ──
    const c1 = await seedCompany('C1', [[COUNTY, STATE]]);
    singleId = await seedGroup('SINGLE', [c1]);
    const pC = await seedProperty(COUNTY);
    await seedTx({ propertyId: pC, buyerId: c1, sellerId: xExt, recordingDate: YTD });

    // ── ZERO: two members in COUNTY but no transactions (zero-count filtered) ──
    const e1 = await seedCompany('E1', [[COUNTY, STATE]]);
    const e2 = await seedCompany('E2', [[COUNTY, STATE]]);
    zeroId = await seedGroup('ZERO', [e1, e2]);
});

afterAll(async () => {
    await cleanup();
});

// ── Per-sort aggregation ──────────────────────────────────────────────────────

describe('GET /api/companies/groups — per-sort aggregation (integration)', () => {
    // Expected MULTI count for each sort, computed from the seeded ledger above. most-properties is
    // 5 (not 6) because pShared, touched by both members, is de-duplicated on the distinct sort.
    const MULTI_EXPECTED: [string, keyof GroupDirectoryRow, number][] = [
        ['most-properties', 'propertyCount', 5],
        ['most-sold-properties', 'propertiesSoldCount', 2],
        ['most-sold-properties-all-time', 'propertiesSoldCountAllTime', 3],
        ['most-bought-properties', 'propertiesBoughtCount', 5],
        ['most-bought-properties-all-time', 'propertiesBoughtCountAllTime', 6],
        ['buys-wholesale', 'wholesaleBuyCount', 1],
        ['wholesalers', 'wholesalerCount', 1],
    ];

    for (const [sort, field, expected] of MULTI_EXPECTED) {
        it(`sort=${sort} → MULTI aggregates to ${expected} with exactly one populated count`, async () => {
            const res = await getGroups({ county: COUNTY, sort });
            expect(res.status).toBe(200);

            const multi = findGroup(res.body, multiId);
            expect(multi).toBeDefined();
            expect(multi!.companyCount).toBe(2);
            expect(multi![field]).toBe(expected);

            // Exactly one count is populated for the active sort; the rest are zero.
            for (const other of COUNT_FIELDS) {
                if (other !== field) expect(multi![other]).toBe(0);
            }
        });
    }

    it('most-sold YTD counts the intra-group transfer but excludes prior-year sales', async () => {
        // a1→a2 sale (p6, YTD) and a1→external (p4, YTD) count; a2's prior-year sale (p5) does not.
        const res = await getGroups({ county: COUNTY, sort: 'most-sold-properties' });
        expect(findGroup(res.body, multiId)!.propertiesSoldCount).toBe(2);
    });
});

// ── Two-or-more gate ──────────────────────────────────────────────────────────

describe('GET /api/companies/groups — two-or-more gate (integration)', () => {
    it('singleton (one-company) groups never appear', async () => {
        const res = await getGroups({ county: COUNTY, sort: 'most-properties' });
        expect(res.status).toBe(200);
        expect(findGroup(res.body, singleId)).toBeUndefined();
    });

    it('multi-company groups appear', async () => {
        const res = await getGroups({ county: COUNTY, sort: 'most-properties' });
        expect(findGroup(res.body, multiId)).toBeDefined();
    });
});

// ── County scoping ────────────────────────────────────────────────────────────

describe('GET /api/companies/groups — county scoping (integration)', () => {
    it('a group appears when ≥1 member operates in the county; the gate is evaluated globally', async () => {
        // SPLIT has one member in COUNTY and one in OTHER_COUNTY — it still counts as 2 members
        // globally, so it appears in COUNTY.
        const res = await getGroups({ county: COUNTY, sort: 'most-properties' });
        const split = findGroup(res.body, splitId);
        expect(split).toBeDefined();
        expect(split!.companyCount).toBe(2);
    });

    it('stats are county-scoped: only the in-county member’s activity is counted', async () => {
        const res = await getGroups({ county: COUNTY, sort: 'most-properties' });
        // Only b1's property (in COUNTY) counts; b2's property (in OTHER_COUNTY) is excluded.
        expect(findGroup(res.body, splitId)!.propertyCount).toBe(1);
    });

    it('the same group scoped to the other county counts the other member’s activity', async () => {
        const res = await getGroups({ county: OTHER_COUNTY, sort: 'most-properties' });
        expect(findGroup(res.body, splitId)!.propertyCount).toBe(1);
    });

    it('a group with no member in the county is absent', async () => {
        const res = await getGroups({ county: COUNTY, sort: 'most-properties' });
        expect(findGroup(res.body, otherId)).toBeUndefined();
    });
});

// ── Zero-count filtering ──────────────────────────────────────────────────────

describe('GET /api/companies/groups — zero-count filtering (integration)', () => {
    it('a multi-company group with no activity for the active sort is hidden', async () => {
        const res = await getGroups({ county: COUNTY, sort: 'most-properties' });
        expect(findGroup(res.body, zeroId)).toBeUndefined();
    });

    it('a group active for one sort is hidden under a sort it has no activity for', async () => {
        // SPLIT owns a property (most-properties > 0) but has no wholesale activity.
        const res = await getGroups({ county: COUNTY, sort: 'wholesalers' });
        expect(findGroup(res.body, splitId)).toBeUndefined();
        expect(findGroup(res.body, multiId)).toBeDefined(); // MULTI does have a wholesaler
    });
});

// ── Search ────────────────────────────────────────────────────────────────────

describe('GET /api/companies/groups — search (integration)', () => {
    it('matches on the group name, case-insensitively', async () => {
        const res = await getGroups({
            county: COUNTY,
            sort: 'most-properties',
            search: 'gd90 group multi',
        });
        expect(res.status).toBe(200);
        expect(findGroup(res.body, multiId)).toBeDefined();
        expect(findGroup(res.body, splitId)).toBeUndefined();
    });

    it('matches on a member company name even when the group name differs', async () => {
        // "GD90 CO A1" appears only in member a1's company name, not in MULTI's group name.
        const res = await getGroups({
            county: COUNTY,
            sort: 'most-properties',
            search: 'gd90 co a1',
        });
        expect(res.status).toBe(200);
        expect(findGroup(res.body, multiId)).toBeDefined();
        expect(findGroup(res.body, splitId)).toBeUndefined();
    });

    it('returns no seeded groups for a term matching neither group nor member names', async () => {
        const res = await getGroups({
            county: COUNTY,
            sort: 'most-properties',
            search: 'gd90 nomatch',
        });
        expect(res.status).toBe(200);
        expect(res.body.groups).toHaveLength(0);
        expect(res.body.total).toBe(0);
    });

    it('a member-name match still respects the zero-count filter', async () => {
        // ZERO's member e1 matches, but the group has no activity for the sort and stays hidden.
        const res = await getGroups({
            county: COUNTY,
            sort: 'most-properties',
            search: 'gd90 co e1',
        });
        expect(findGroup(res.body, zeroId)).toBeUndefined();
    });
});

// ── Pagination & envelope ─────────────────────────────────────────────────────

describe('GET /api/companies/groups — envelope & pagination (integration)', () => {
    it('returns the { groups, total, page, limit } envelope', async () => {
        const res = await getGroups({ county: COUNTY, sort: 'most-properties' });
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.groups)).toBe(true);
        expect(res.body.page).toBe(1);
        expect(typeof res.body.total).toBe('number');
        expect(res.body.total).toBeGreaterThanOrEqual(2); // at least MULTI + SPLIT
    });

    it('respects limit and page', async () => {
        const first = await getGroups({
            county: COUNTY,
            sort: 'most-properties',
            limit: '1',
            page: '1',
        });
        expect(first.body.groups).toHaveLength(1);
        expect(first.body.limit).toBe(1);

        const second = await getGroups({
            county: COUNTY,
            sort: 'most-properties',
            limit: '1',
            page: '2',
        });
        expect(second.body.groups).toHaveLength(1);
        // Different rows across pages.
        expect(second.body.groups[0].id).not.toBe(first.body.groups[0].id);
    });
});

// ── Public-access baseline ────────────────────────────────────────────────────

describe('GET /api/companies/groups — public access (integration)', () => {
    it('is reachable unauthenticated, matching the company directory', async () => {
        const res = await request(app)
            .get('/api/companies/groups')
            .query({ county: COUNTY, sort: 'most-properties' });
        expect(res.status).toBe(200);
        expect(findGroup(res.body, multiId)).toBeDefined();
    });
});
