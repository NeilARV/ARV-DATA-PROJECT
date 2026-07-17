import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { inArray, like } from 'drizzle-orm';
import type { Express } from 'express';
import { companies, companyGroups, companyCounties } from '@database/schemas/companies.schema';
import { properties, addresses, propertyTransactions } from '@database/schemas/properties.schema';
import { createTestApp } from '../../../helpers/setup';
import {
    getTestDb,
    seedTestUser,
    deleteTestUser,
    assignSubscription,
    removeSubscription,
} from '../../../helpers/db';

// Integration coverage for the groupId param across the property queries (issue #142): the list,
// map-pin, and zip-count endpoints resolve a group to its member companies through the shared
// involvement predicate — all members' transactions match, the buyer/seller role pin is respected,
// companyId wins over groupId, the date-range filter is suppressed on selection, and a stale group
// id yields an empty result rather than an error. Also covers GET /api/companies/groups/:id, the
// deep-link validation lookup.
//
// The test branch holds real synced data, so fixtures are namespaced to a county unique to this
// file and asserted by seeded id.

const PREFIX = 'GF42';
const COUNTY = 'GF42 County';
const OTHER_COUNTY = 'GF42 Other';
const STATE = 'CA';
const ZIP = '90042';

// This file's own user (TST.UNIQUE-UUID) — GET /api/properties is subscription-gated.
const ACTOR = 'aaaaaaaa-4242-4242-4242-424242424242';

const YEAR = new Date().getFullYear();
const RECENT = `${YEAR}-01-05`;
const OLD = `${YEAR - 2}-06-01`; // far outside every relative date range

const db = getTestDb();
let app: Express;
let sfrCounter = 954_042_000_000;
let nameCounter = 0;

let groupId: string; // 2 members: buyerMember + sellerMember
let emptyGroupId: string; // 0 members — stale (disbanded-equivalent)
let singletonGroupId: string; // 1 member — invisible in the directory
let buyerMemberId: string; // member: buys boughtPropId, assignor on assignedPropId
let sellerMemberId: string; // member: sells soldPropId
let outsiderId: string; // ungrouped company: buys outsiderPropId
let boughtPropId: string;
let soldPropId: string;
let assignedPropId: string;
let outsiderPropId: string;

async function seedCompany(label: string, counties: string[] = []): Promise<string> {
    const [row] = await db
        .insert(companies)
        .values({ companyName: `${PREFIX} CO ${label} #${nameCounter++} LLC` })
        .returning({ id: companies.id });
    for (const county of counties) {
        await db.insert(companyCounties).values({ companyId: row.id, county, state: STATE });
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
        .values({ sfrPropertyId: sfr, county, msa: 'GF42 MSA', propertyType: 'Single Family' })
        .returning({ id: properties.id });
    await db.insert(addresses).values({
        propertyId: row.id,
        county,
        state: STATE,
        city: 'Integration',
        zipCode: ZIP,
        formattedStreetAddress: `${sfr} ${PREFIX} AVE`,
        latitude: '33.10000000',
        longitude: '-117.10000000',
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
}): Promise<void> {
    await db.insert(propertyTransactions).values({
        propertyId: opts.propertyId,
        buyerId: opts.buyerId ?? null,
        sellerId: opts.sellerId ?? null,
        assignorId: opts.assignorId ?? null,
        transactionType: opts.type ?? 'Arms Length',
        saleDate: opts.recordingDate,
        recordingDate: opts.recordingDate,
        sortOrder: 1,
    });
}

async function cleanup(): Promise<void> {
    // Deleting properties cascades their transactions/addresses; groups SET NULL companies first.
    await db.delete(properties).where(inArray(properties.county, [COUNTY, OTHER_COUNTY]));
    await db.delete(companyGroups).where(like(companyGroups.name, `${PREFIX}%`));
    await db.delete(companies).where(like(companies.companyName, `${PREFIX}%`));
}

beforeAll(async () => {
    app = createTestApp();
    await cleanup();
    await deleteTestUser(ACTOR);
    await seedTestUser(ACTOR);

    buyerMemberId = await seedCompany('BUYER', [COUNTY]);
    sellerMemberId = await seedCompany('SELLER', [COUNTY]);
    outsiderId = await seedCompany('OUTSIDER', [COUNTY]);
    const singletonMemberId = await seedCompany('SINGLE', [COUNTY]);

    groupId = await seedGroup('MULTI', [buyerMemberId, sellerMemberId]);
    emptyGroupId = await seedGroup('EMPTY', []);
    singletonGroupId = await seedGroup('SINGLETON', [singletonMemberId]);

    // Old recording date on the bought property proves date-range suppression on selection.
    boughtPropId = await seedProperty(COUNTY);
    await seedTx({ propertyId: boughtPropId, buyerId: buyerMemberId, recordingDate: OLD });

    soldPropId = await seedProperty(COUNTY);
    await seedTx({ propertyId: soldPropId, sellerId: sellerMemberId, recordingDate: RECENT });

    // Non-Arms-Length assignment: matches only via the assignor arm of the predicate (no role pin).
    assignedPropId = await seedProperty(COUNTY);
    await seedTx({
        propertyId: assignedPropId,
        assignorId: buyerMemberId,
        type: 'Assignment',
        recordingDate: RECENT,
    });

    outsiderPropId = await seedProperty(COUNTY);
    await seedTx({ propertyId: outsiderPropId, buyerId: outsiderId, recordingDate: RECENT });
});

afterAll(async () => {
    await cleanup();
    await deleteTestUser(ACTOR);
});

beforeEach(async () => {
    await removeSubscription(ACTOR);
    await assignSubscription(ACTOR, 'basic');
});

const getProperties = (query: Record<string, string | string[]>) =>
    request(app).get('/api/properties').query(query).set('x-test-user-id', ACTOR);

const returnedIds = (body: { properties: { id: string }[] }) =>
    body.properties.map((p) => p.id).sort();

describe('GET /api/properties?groupId= (integration)', () => {
    it('groupId — returns every member company transaction, not the outsider', async () => {
        const res = await getProperties({ county: COUNTY, groupId });
        expect(res.status).toBe(200);
        expect(returnedIds(res.body)).toEqual([boughtPropId, soldPropId, assignedPropId].sort());
    });

    it('groupId + companyRole=buyer — only sales where a member bought', async () => {
        const res = await getProperties({ county: COUNTY, groupId, companyRole: 'buyer' });
        expect(res.status).toBe(200);
        expect(returnedIds(res.body)).toEqual([boughtPropId]);
    });

    it('groupId + companyRole=seller — only sales where a member sold', async () => {
        const res = await getProperties({ county: COUNTY, groupId, companyRole: 'seller' });
        expect(res.status).toBe(200);
        expect(returnedIds(res.body)).toEqual([soldPropId]);
    });

    it('companyId wins when both companyId and groupId are present', async () => {
        const res = await getProperties({ county: COUNTY, groupId, companyId: outsiderId });
        expect(res.status).toBe(200);
        expect(returnedIds(res.body)).toEqual([outsiderPropId]);
    });

    it('date range is suppressed on group selection — old transactions still show', async () => {
        const res = await getProperties({ county: COUNTY, groupId, dateRange: '90d' });
        expect(res.status).toBe(200);
        expect(returnedIds(res.body)).toContain(boughtPropId);
    });

    it('a stale (memberless) group returns an empty page, not an error', async () => {
        const res = await getProperties({ county: COUNTY, groupId: emptyGroupId });
        expect(res.status).toBe(200);
        expect(res.body.properties).toEqual([]);
        expect(res.body.total).toBe(0);
    });
});

describe('GET /api/properties/map?groupId= (integration)', () => {
    it('returns pins for all member transactions, respecting the role pin', async () => {
        const all = await request(app)
            .get('/api/properties/map')
            .query({ county: COUNTY, groupId });
        expect(all.status).toBe(200);
        expect(all.body.map((p: { id: string }) => p.id).sort()).toEqual(
            [boughtPropId, soldPropId, assignedPropId].sort(),
        );

        const buyers = await request(app)
            .get('/api/properties/map')
            .query({ county: COUNTY, groupId, companyRole: 'buyer' });
        expect(buyers.status).toBe(200);
        expect(buyers.body.map((p: { id: string }) => p.id)).toEqual([boughtPropId]);
    });

    it('pin txInfo resolves the member company on the matched sale', async () => {
        const res = await request(app)
            .get('/api/properties/map')
            .query({ county: COUNTY, groupId, companyRole: 'seller' });
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].sellerId).toBe(sellerMemberId);
    });
});

describe('GET /api/properties/zip-counts?groupId= (integration)', () => {
    it('counts every member transaction in the zip, agreeing with the list', async () => {
        const res = await request(app)
            .get('/api/properties/zip-counts')
            .query({ county: COUNTY, groupId });
        expect(res.status).toBe(200);
        const zipRow = res.body.find((r: { zipCode: string }) => r.zipCode === ZIP);
        expect(zipRow?.count).toBe(3);
    });
});

describe('GET /api/companies/groups/:id (integration)', () => {
    it('returns the directory row for a visible multi-company group', async () => {
        const res = await request(app)
            .get(`/api/companies/groups/${groupId}`)
            .query({ county: COUNTY });
        expect(res.status).toBe(200);
        expect(res.body.group.id).toBe(groupId);
        expect(res.body.group.companyCount).toBe(2);
    });

    it('404 for a singleton group (invisible in the directory)', async () => {
        const res = await request(app)
            .get(`/api/companies/groups/${singletonGroupId}`)
            .query({ county: COUNTY });
        expect(res.status).toBe(404);
    });

    it('404 for a group with no activity in the selected county', async () => {
        const res = await request(app)
            .get(`/api/companies/groups/${groupId}`)
            .query({ county: OTHER_COUNTY });
        expect(res.status).toBe(404);
    });

    it('404 for an unknown or malformed id', async () => {
        const unknown = await request(app)
            .get('/api/companies/groups/00000000-0000-4000-8000-000000000000')
            .query({ county: COUNTY });
        expect(unknown.status).toBe(404);

        const malformed = await request(app)
            .get('/api/companies/groups/not-a-uuid')
            .query({ county: COUNTY });
        expect(malformed.status).toBe(404);
    });
});
