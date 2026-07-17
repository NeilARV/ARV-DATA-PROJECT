import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { inArray, like } from 'drizzle-orm';
import type { Express } from 'express';
import { companies, companyGroups, companyCounties } from '@database/schemas/companies.schema';
import { properties, addresses, propertyTransactions } from '@database/schemas/properties.schema';
import { createTestApp } from '../../../helpers/setup';
import { getTestDb } from '../../../helpers/db';

// Integration coverage for the PUBLIC group profile (GET /api/companies/groups/:id/profile): the
// aggregate stats summed across member companies (owned de-duplicated across members, YTD sold with
// intra-group transfers, assigned de-duplicated on property, the 90-day acquisition chart), the
// two-or-more gate, county scoping, and 404s for stale/malformed ids.
//
// The test branch holds real synced data, so every fixture is namespaced to counties/names unique to
// this file and asserted by seeded id — never by raw totals across the whole response.

const PREFIX = 'GP43';
const COUNTY = 'GP43 County';
const OTHER_COUNTY = 'GP43 Other';
const STATE = 'CA';

// Dates relative to now so the chart window assertions are deterministic: three acquisitions inside
// the strict 90-day window, older activity well before the chart's earliest full month.
function daysAgo(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
}
const D5 = daysAgo(5);
const D10 = daysAgo(10);
const D40 = daysAgo(40);
const OLD = daysAgo(200); // before the chart superset window
const PRIOR_YEAR = `${new Date().getFullYear() - 1}-06-01`; // excluded from YTD sold

const db = getTestDb();
let app: Express;
let sfrCounter = 954_430_000_000;
let nameCounter = 0;

// Seeded ids, assigned in beforeAll.
let profileGroupId: string; // 2 members, the main aggregate-assertions group
let splitGroupId: string; // 2 members split across counties
let otherGroupId: string; // 2 members, all in OTHER_COUNTY
let singleGroupId: string; // 1 member (singleton — 404)

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
        .values({ sfrPropertyId: sfr, county, msa: 'GP43 MSA', propertyType: 'Single Family' })
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
    assignorId?: string;
    type?: string;
    recordingDate: string;
    sortOrder?: number;
}): Promise<void> {
    await db.insert(propertyTransactions).values({
        propertyId: opts.propertyId,
        buyerId: opts.buyerId ?? null,
        sellerId: opts.sellerId ?? null,
        assignorId: opts.assignorId ?? null,
        isAssignment: opts.assignorId != null,
        transactionType: opts.type ?? 'Arms Length',
        saleDate: opts.recordingDate,
        recordingDate: opts.recordingDate,
        sortOrder: opts.sortOrder ?? 1,
    });
}

async function cleanup(): Promise<void> {
    // Property counties are unique to this file, so this also clears a crashed prior run.
    // Deleting properties cascades their transactions/addresses.
    await db.delete(properties).where(inArray(properties.county, [COUNTY, OTHER_COUNTY]));
    // Groups first (SET NULLs companies.group_id), then companies (cascades company_counties).
    await db.delete(companyGroups).where(like(companyGroups.name, `${PREFIX}%`));
    await db.delete(companies).where(like(companies.companyName, `${PREFIX}%`));
}

const getProfile = (id: string, query: Record<string, string | string[]> = {}) =>
    request(app).get(`/api/companies/groups/${id}/profile`).query(query);

/** Month keys the chart must span: from the month of (now − 90d) through the current month. */
function expectedMonthCount(): number {
    const now = new Date();
    const ninetyDaysAgo = new Date(now);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    return (
        (now.getFullYear() - ninetyDaysAgo.getFullYear()) * 12 +
        (now.getMonth() - ninetyDaysAgo.getMonth()) +
        1
    );
}

beforeAll(async () => {
    app = createTestApp();
    await cleanup();

    // ── PROFILE: m1 + m2, both in COUNTY — the main aggregate ledger ──
    const m1 = await seedCompany('M1', [[COUNTY, STATE]]);
    const m2 = await seedCompany('M2', [[COUNTY, STATE]]);
    const ext = await seedCompany('EXT'); // external, ungrouped — never a member
    profileGroupId = await seedGroup('PROFILE', [m1, m2]);

    const pA = await seedProperty(COUNTY);
    const pB = await seedProperty(COUNTY);
    const pShared = await seedProperty(COUNTY);
    const pSoldExt = await seedProperty(COUNTY);
    const pIntra = await seedProperty(COUNTY);
    const pAssigned = await seedProperty(COUNTY);
    const pAssignedDup = await seedProperty(COUNTY);
    const pSoldPrior = await seedProperty(COUNTY);

    // Owned + in-window acquisitions (one per member).
    await seedTx({ propertyId: pA, buyerId: m1, sellerId: ext, recordingDate: D5 });
    await seedTx({ propertyId: pB, buyerId: m2, sellerId: ext, recordingDate: D40 });
    // pShared: two sort_order=1 rows, one per member → DISTINCT counts the property once.
    await seedTx({ propertyId: pShared, buyerId: m1, sellerId: ext, recordingDate: OLD });
    await seedTx({ propertyId: pShared, buyerId: m2, sellerId: ext, recordingDate: OLD });
    // m1 sold to an external buyer this year.
    await seedTx({ propertyId: pSoldExt, buyerId: ext, sellerId: m1, recordingDate: D5 });
    // Intra-group sale m1 → m2: counts as sold AND as m2's owned/acquisition.
    await seedTx({ propertyId: pIntra, buyerId: m2, sellerId: m1, recordingDate: D10 });
    // Assignments: one plain, one with two in-group assignor rows on the same property (distinct).
    await seedTx({
        propertyId: pAssigned,
        buyerId: ext,
        sellerId: ext,
        assignorId: m1,
        recordingDate: D5,
    });
    await seedTx({
        propertyId: pAssignedDup,
        buyerId: ext,
        sellerId: ext,
        assignorId: m1,
        recordingDate: D5,
    });
    await seedTx({
        propertyId: pAssignedDup,
        buyerId: ext,
        sellerId: ext,
        assignorId: m2,
        recordingDate: OLD,
        sortOrder: 2,
    });
    // Prior-year sale — excluded from the YTD sold count.
    await seedTx({ propertyId: pSoldPrior, buyerId: ext, sellerId: m2, recordingDate: PRIOR_YEAR });

    // ── SPLIT: s1 in COUNTY, s2 in OTHER_COUNTY (global gate; county-scoped stats) ──
    const s1 = await seedCompany('S1', [[COUNTY, STATE]]);
    const s2 = await seedCompany('S2', [[OTHER_COUNTY, STATE]]);
    splitGroupId = await seedGroup('SPLIT', [s1, s2]);
    const pS1 = await seedProperty(COUNTY);
    const pS2 = await seedProperty(OTHER_COUNTY);
    await seedTx({ propertyId: pS1, buyerId: s1, sellerId: ext, recordingDate: D5 });
    await seedTx({ propertyId: pS2, buyerId: s2, sellerId: ext, recordingDate: D5 });

    // ── OTHER: both members only in OTHER_COUNTY (absent from COUNTY) ──
    const o1 = await seedCompany('O1', [[OTHER_COUNTY, STATE]]);
    const o2 = await seedCompany('O2', [[OTHER_COUNTY, STATE]]);
    otherGroupId = await seedGroup('OTHER', [o1, o2]);
    const pO = await seedProperty(OTHER_COUNTY);
    await seedTx({ propertyId: pO, buyerId: o1, sellerId: ext, recordingDate: D5 });

    // ── SINGLE: one company with activity (singleton — must 404) ──
    const c1 = await seedCompany('C1', [[COUNTY, STATE]]);
    singleGroupId = await seedGroup('SINGLE', [c1]);
    const pC = await seedProperty(COUNTY);
    await seedTx({ propertyId: pC, buyerId: c1, sellerId: ext, recordingDate: D5 });
});

afterAll(async () => {
    await cleanup();
});

// ── Aggregate stats ───────────────────────────────────────────────────────────

describe('GET /api/companies/groups/:id/profile — aggregate stats (integration)', () => {
    it('returns the { profile } envelope with the group identity and raw name', async () => {
        const res = await getProfile(profileGroupId);
        expect(res.status).toBe(200);
        expect(res.body.profile.id).toBe(profileGroupId);
        expect(res.body.profile.name).toMatch(new RegExp(`^${PREFIX} GROUP PROFILE`));
        expect(res.body.profile.companyCount).toBe(2);
    });

    it('propertyCount sums owned across members and de-duplicates a shared property', async () => {
        // pA (m1) + pB (m2) + pShared (both members, counted once) + pIntra (m2) = 4.
        const res = await getProfile(profileGroupId);
        expect(res.body.profile.propertyCount).toBe(4);
    });

    it('propertiesSoldCount is YTD Arms-Length sales including intra-group transfers', async () => {
        // pSoldExt (m1 → external) + pIntra (m1 → m2); the prior-year sale is excluded.
        const res = await getProfile(profileGroupId);
        expect(res.body.profile.propertiesSoldCount).toBe(2);
    });

    it('propertiesAssignedCount de-duplicates a property with two in-group assignor rows', async () => {
        // pAssigned + pAssignedDup (two rows, one per member, counted once) = 2.
        const res = await getProfile(profileGroupId);
        expect(res.body.profile.propertiesAssignedCount).toBe(2);
    });

    it('the 90-day chart aggregates member acquisitions with the strict 90-day total', async () => {
        const res = await getProfile(profileGroupId);
        // pA (D5, m1) + pB (D40, m2) + pIntra (D10, m2); pShared's old rows are outside the window.
        expect(res.body.profile.acquisition90DayTotal).toBe(3);
        const byMonth: { key: string; count: number }[] = res.body.profile.acquisition90DayByMonth;
        expect(byMonth).toHaveLength(expectedMonthCount());
        expect(byMonth.reduce((sum, m) => sum + m.count, 0)).toBe(3);
    });

    it('omits company-level fields: no contacts and no purchase-to-ARV ratio', async () => {
        const res = await getProfile(profileGroupId);
        expect(res.body.profile.contacts).toBeUndefined();
        expect(res.body.profile.purchaseToArvRatio).toBeUndefined();
    });
});

// ── County scoping ────────────────────────────────────────────────────────────

describe('GET /api/companies/groups/:id/profile — county scoping (integration)', () => {
    it('stats are county-scoped: only the in-county member’s activity is counted', async () => {
        const res = await getProfile(splitGroupId, { county: COUNTY });
        expect(res.status).toBe(200);
        expect(res.body.profile.companyCount).toBe(2); // the two-or-more gate is global
        expect(res.body.profile.propertyCount).toBe(1);
    });

    it('without a county filter the stats span all counties', async () => {
        const res = await getProfile(splitGroupId);
        expect(res.body.profile.propertyCount).toBe(2);
    });

    it('404s when no member operates in the selected county', async () => {
        const res = await getProfile(otherGroupId, { county: COUNTY });
        expect(res.status).toBe(404);
    });
});

// ── Visibility & 404s ─────────────────────────────────────────────────────────

describe('GET /api/companies/groups/:id/profile — visibility (integration)', () => {
    it('404s for a singleton (one-company) group even with activity', async () => {
        const res = await getProfile(singleGroupId);
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ message: 'Group not found' });
    });

    it('404s for an unknown uuid', async () => {
        const res = await getProfile('00000000-0000-4000-8000-000000000000');
        expect(res.status).toBe(404);
    });

    it('404s for a malformed id instead of erroring on the uuid cast', async () => {
        const res = await getProfile('not-a-uuid');
        expect(res.status).toBe(404);
    });
});

// ── Public-access baseline ────────────────────────────────────────────────────

describe('GET /api/companies/groups/:id/profile — public access (integration)', () => {
    it('is reachable unauthenticated, matching the groups directory', async () => {
        const res = await getProfile(profileGroupId);
        expect(res.status).toBe(200);
    });
});
