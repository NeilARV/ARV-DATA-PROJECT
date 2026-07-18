import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { inArray, like } from 'drizzle-orm';
import type { Express } from 'express';
import { companies, companyGroups, companyCounties } from '@database/schemas/companies.schema';
import { properties, addresses, propertyTransactions } from '@database/schemas/properties.schema';
import { createTestApp } from '../../../helpers/setup';
import { getTestDb } from '../../../helpers/db';

// Integration coverage for the company directory payload's `group` field (GET /api/companies): the
// company's operator group (id + name) is populated only for members of a multi-company group (2+
// members, evaluated globally) and null for singleton or ungrouped companies. This feeds the
// company-card group chip (#145).
//
// The test branch holds real synced data, so every fixture is namespaced to a county/name unique to
// this file and asserted by seeded id — never by raw totals across the whole response.

const PREFIX = 'CDG91';
const COUNTY = 'CDG91 County';
const STATE = 'CA';

const db = getTestDb();
let app: Express;
let sfrCounter = 954_910_000_000;
let nameCounter = 0;

// Seeded ids, assigned in beforeAll.
let multiId: string; // a group with two member companies (appears on the chip)
let multiName: string; // the group's RAW stored name (returned unformatted)
let m1: string; // member of MULTI
let m2: string; // member of MULTI
let singleMember: string; // sole member of a singleton group (no chip)
let ungrouped: string; // company with no group at all (no chip)

// ── Seed helpers ─────────────────────────────────────────────────────────────

async function seedCompany(label: string): Promise<string> {
    const [row] = await db
        .insert(companies)
        .values({ companyName: `${PREFIX} CO ${label} #${nameCounter++} LLC` })
        .returning({ id: companies.id });
    await db.insert(companyCounties).values({ companyId: row.id, county: COUNTY, state: STATE });
    return row.id;
}

async function seedGroup(
    label: string,
    memberIds: string[],
): Promise<{ id: string; name: string }> {
    const name = `${PREFIX} GROUP ${label} #${nameCounter++}`;
    const [row] = await db
        .insert(companyGroups)
        .values({ name })
        .returning({ id: companyGroups.id });
    if (memberIds.length > 0) {
        await db.update(companies).set({ groupId: row.id }).where(inArray(companies.id, memberIds));
    }
    return { id: row.id, name };
}

// Give a company one owned property in COUNTY so it clears the most-properties zero-count filter and
// appears in the directory.
async function seedOwnedProperty(ownerId: string): Promise<void> {
    const sfr = sfrCounter++;
    const [prop] = await db
        .insert(properties)
        .values({
            sfrPropertyId: sfr,
            county: COUNTY,
            msa: 'CDG91 MSA',
            propertyType: 'Single Family',
        })
        .returning({ id: properties.id });
    await db.insert(addresses).values({
        propertyId: prop.id,
        county: COUNTY,
        state: STATE,
        city: 'Integration',
        zipCode: '90000',
        formattedStreetAddress: `${sfr} ${PREFIX} AVE`,
    });
    await db.insert(propertyTransactions).values({
        propertyId: prop.id,
        buyerId: ownerId,
        sellerId: null,
        transactionType: 'Arms Length',
        saleDate: `${new Date().getFullYear()}-01-05`,
        recordingDate: `${new Date().getFullYear()}-01-05`,
        sortOrder: 1,
    });
}

async function cleanup(): Promise<void> {
    await db.delete(properties).where(inArray(properties.county, [COUNTY]));
    await db.delete(companyGroups).where(like(companyGroups.name, `${PREFIX}%`));
    await db.delete(companies).where(like(companies.companyName, `${PREFIX}%`));
}

const getCompanies = (query: Record<string, string | string[]>) =>
    request(app).get('/api/companies').query(query);

type DirectoryCompany = { id: string; group: { id: string; name: string } | null };

const findCompany = (body: { companies: DirectoryCompany[] }, id: string) =>
    body.companies.find((c) => c.id === id);

beforeAll(async () => {
    app = createTestApp();
    await cleanup();

    m1 = await seedCompany('M1');
    m2 = await seedCompany('M2');
    const multi = await seedGroup('MULTI', [m1, m2]);
    multiId = multi.id;
    multiName = multi.name;
    await seedOwnedProperty(m1);
    await seedOwnedProperty(m2);

    singleMember = await seedCompany('SINGLE');
    await seedGroup('SINGLE', [singleMember]);
    await seedOwnedProperty(singleMember);

    ungrouped = await seedCompany('UNGROUPED');
    await seedOwnedProperty(ungrouped);
});

afterAll(async () => {
    await cleanup();
});

describe('GET /api/companies — payload group field (integration)', () => {
    it('populates group (id + RAW name) for a multi-company-group member', async () => {
        const res = await getCompanies({ county: COUNTY, sort: 'most-properties' });
        expect(res.status).toBe(200);

        const member = findCompany(res.body, m1);
        expect(member).toBeDefined();
        expect(member!.group).toEqual({ id: multiId, name: multiName });
    });

    it('gives every member of the same multi-company group the same group', async () => {
        const res = await getCompanies({ county: COUNTY, sort: 'most-properties' });
        expect(findCompany(res.body, m2)!.group).toEqual({ id: multiId, name: multiName });
    });

    it('returns the RAW group name, unformatted (formatted at the render edge)', async () => {
        const res = await getCompanies({ county: COUNTY, sort: 'most-properties' });
        // Seeded name is ALL-CAPS-ish raw text; the payload must not title-case it.
        expect(findCompany(res.body, m1)!.group!.name).toBe(multiName);
    });

    it('leaves group null for a singleton-group member', async () => {
        const res = await getCompanies({ county: COUNTY, sort: 'most-properties' });
        const member = findCompany(res.body, singleMember);
        expect(member).toBeDefined();
        expect(member!.group).toBeNull();
    });

    it('leaves group null for an ungrouped company', async () => {
        const res = await getCompanies({ county: COUNTY, sort: 'most-properties' });
        const member = findCompany(res.body, ungrouped);
        expect(member).toBeDefined();
        expect(member!.group).toBeNull();
    });
});
