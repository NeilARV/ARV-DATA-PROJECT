import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import {
    companies,
    companyGroups,
    companyMembers,
    groupMembers,
} from '@database/schemas/companies.schema';
import type { GroupMember } from '@database/types/companies';
import { getTestDb, seedTestUser, deleteTestUser } from '../../helpers/db';
import {
    backfillCompanyGroups,
    type CompanyGroupsBackfillResult,
} from 'server/jobs/backfill-company-groups';

// UUIDs / company names unique to this file (TST.UNIQUE-UUID) — integration files run in parallel,
// and the backfill scans the whole DB, so every fixture must be distinguishable from other suites'.
const USER_IDS = {
    // A member of BOTH company A and company B → must land in two singleton groups.
    multiCompany: 'c9870000-0000-4000-8000-000000000001',
    // A member of company A only.
    aOnly: 'c9870000-0000-4000-8000-000000000002',
};

const COMPANY_NAMES = {
    alpha: 'CG87 BACKFILL OPERATOR ALPHA LLC', // 2 members
    beta: 'CG87 BACKFILL OPERATOR BETA LLC', // 1 member (role null)
    gamma: 'CG87 BACKFILL OPERATOR GAMMA LLC', // 0 members → must stay ungrouped
};

// Distinct createdAt values so "copied verbatim" is a meaningful assertion, not all default-now.
const CREATED_AT = {
    alphaMulti: new Date('2021-01-15T08:30:00.000Z'),
    alphaOnly: new Date('2022-06-20T14:00:00.000Z'),
    betaMulti: new Date('2023-03-05T19:45:00.000Z'),
};

const db = getTestDb();

let alphaId: string;
let betaId: string;
let gammaId: string;
let firstRun: CompanyGroupsBackfillResult;

async function seedCompany(companyName: string): Promise<string> {
    const [row] = await db
        .insert(companies)
        .values({ companyName })
        .returning({ id: companies.id });
    return row.id;
}

async function groupByName(name: string) {
    const [row] = await db.select().from(companyGroups).where(eq(companyGroups.name, name));
    return row;
}

async function membersOfGroup(groupId: string): Promise<GroupMember[]> {
    return db.select().from(groupMembers).where(eq(groupMembers.groupId, groupId));
}

beforeAll(async () => {
    // Delete-then-seed so a crashed prior run's leftover users don't collide on users_pkey.
    await deleteTestUser(USER_IDS.multiCompany);
    await deleteTestUser(USER_IDS.aOnly);
    await seedTestUser(USER_IDS.multiCompany);
    await seedTestUser(USER_IDS.aOnly);

    alphaId = await seedCompany(COMPANY_NAMES.alpha);
    betaId = await seedCompany(COMPANY_NAMES.beta);
    gammaId = await seedCompany(COMPANY_NAMES.gamma);

    await db.insert(companyMembers).values([
        {
            companyId: alphaId,
            userId: USER_IDS.multiCompany,
            role: 'owner',
            isPrimary: true,
            createdAt: CREATED_AT.alphaMulti,
        },
        {
            companyId: alphaId,
            userId: USER_IDS.aOnly,
            role: 'member',
            isPrimary: false,
            createdAt: CREATED_AT.alphaOnly,
        },
        {
            companyId: betaId,
            userId: USER_IDS.multiCompany,
            role: null, // company_members.role is nullable — the copy must preserve null
            isPrimary: false,
            createdAt: CREATED_AT.betaMulti,
        },
    ]);
    // gamma is intentionally left member-less.

    firstRun = await backfillCompanyGroups();
});

afterAll(async () => {
    // Deleting the companies cascades company_members; deleting the groups cascades group_members.
    await db.delete(companies).where(inArray(companies.id, [alphaId, betaId, gammaId]));
    await db
        .delete(companyGroups)
        .where(inArray(companyGroups.name, Object.values(COMPANY_NAMES)));
    await deleteTestUser(USER_IDS.multiCompany);
    await deleteTestUser(USER_IDS.aOnly);
});

describe('backfillCompanyGroups', () => {
    it('backfillCompanyGroups — membered company — creates one singleton group named after the raw company name', async () => {
        const alpha = await groupByName(COMPANY_NAMES.alpha);
        const beta = await groupByName(COMPANY_NAMES.beta);
        expect(alpha).toBeDefined();
        expect(beta).toBeDefined();
        expect(alpha.id).not.toBe(beta.id);
    });

    it('backfillCompanyGroups — membered company — links companies.group_id to its singleton', async () => {
        const alphaGroup = await groupByName(COMPANY_NAMES.alpha);
        const betaGroup = await groupByName(COMPANY_NAMES.beta);
        const [alpha] = await db.select().from(companies).where(eq(companies.id, alphaId));
        const [beta] = await db.select().from(companies).where(eq(companies.id, betaId));
        expect(alpha.groupId).toBe(alphaGroup.id);
        expect(beta.groupId).toBe(betaGroup.id);
    });

    it('backfillCompanyGroups — member-less company — is left ungrouped with no group created', async () => {
        const [gamma] = await db.select().from(companies).where(eq(companies.id, gammaId));
        expect(gamma.groupId).toBeNull();
        expect(await groupByName(COMPANY_NAMES.gamma)).toBeUndefined();
    });

    it('backfillCompanyGroups — memberships — copied verbatim (role, is_primary, created_at) with the count preserved', async () => {
        const alphaGroup = await groupByName(COMPANY_NAMES.alpha);
        const betaGroup = await groupByName(COMPANY_NAMES.beta);

        // Every company_members row for these companies must appear once in the group, unchanged.
        const sourceMembers = await db
            .select()
            .from(companyMembers)
            .where(inArray(companyMembers.companyId, [alphaId, betaId]));
        const groupIdByCompany = { [alphaId]: alphaGroup.id, [betaId]: betaGroup.id };

        const copied = [
            ...(await membersOfGroup(alphaGroup.id)),
            ...(await membersOfGroup(betaGroup.id)),
        ];
        // group_members count == pre-existing company_members count (3: 2 in alpha, 1 in beta).
        expect(copied).toHaveLength(sourceMembers.length);
        expect(copied).toHaveLength(3);

        for (const source of sourceMembers) {
            const match = copied.find(
                (m) =>
                    m.userId === source.userId &&
                    m.groupId === groupIdByCompany[source.companyId],
            );
            expect(match).toBeDefined();
            expect(match!.role).toBe(source.role);
            expect(match!.isPrimary).toBe(source.isPrimary);
            expect(match!.createdAt.getTime()).toBe(source.createdAt.getTime());
        }
    });

    it('backfillCompanyGroups — user in N companies — becomes a member of N singleton groups', async () => {
        const alphaGroup = await groupByName(COMPANY_NAMES.alpha);
        const betaGroup = await groupByName(COMPANY_NAMES.beta);
        const memberships = await db
            .select()
            .from(groupMembers)
            .where(
                inArray(groupMembers.groupId, [alphaGroup.id, betaGroup.id]),
            );
        const multiCompany = memberships.filter((m) => m.userId === USER_IDS.multiCompany);
        expect(multiCompany).toHaveLength(2);
        expect(multiCompany.map((m) => m.groupId).sort()).toEqual(
            [alphaGroup.id, betaGroup.id].sort(),
        );
    });

    it('backfillCompanyGroups — first run — reports the groups and members it wrote', () => {
        // Lower bounds: the shared test DB may hold other ungrouped membered companies, but these
        // fixtures (2 groups, 3 members) are guaranteed to be part of this run.
        expect(firstRun.companiesScanned).toBeGreaterThanOrEqual(2);
        expect(firstRun.groupsCreated).toBeGreaterThanOrEqual(2);
        expect(firstRun.membersCopied).toBeGreaterThanOrEqual(3);
    });

    it('backfillCompanyGroups — second run — is idempotent (no new groups or members, no changes)', async () => {
        const alphaBefore = await groupByName(COMPANY_NAMES.alpha);
        const betaBefore = await groupByName(COMPANY_NAMES.beta);
        const alphaMembersBefore = await membersOfGroup(alphaBefore.id);
        const betaMembersBefore = await membersOfGroup(betaBefore.id);

        await backfillCompanyGroups();

        // Same singleton rows (no duplicates created), same ids, same rosters.
        const alphaGroups = await db
            .select()
            .from(companyGroups)
            .where(eq(companyGroups.name, COMPANY_NAMES.alpha));
        const betaGroups = await db
            .select()
            .from(companyGroups)
            .where(eq(companyGroups.name, COMPANY_NAMES.beta));
        expect(alphaGroups).toHaveLength(1);
        expect(betaGroups).toHaveLength(1);
        expect(alphaGroups[0].id).toBe(alphaBefore.id);
        expect(betaGroups[0].id).toBe(betaBefore.id);
        expect(await membersOfGroup(alphaBefore.id)).toHaveLength(alphaMembersBefore.length);
        expect(await membersOfGroup(betaBefore.id)).toHaveLength(betaMembersBefore.length);

        // group_id links are unchanged.
        const [alpha] = await db.select().from(companies).where(eq(companies.id, alphaId));
        const [gamma] = await db.select().from(companies).where(eq(companies.id, gammaId));
        expect(alpha.groupId).toBe(alphaBefore.id);
        expect(gamma.groupId).toBeNull();
    });
});
