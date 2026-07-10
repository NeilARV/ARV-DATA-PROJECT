import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { eq, like, inArray } from 'drizzle-orm';
import { companies, companyGroups, groupMembers } from '@database/schemas/companies.schema';
import { setupIntegrationUsers } from '../../../helpers/setup';
import {
    assignRole,
    getTestDb,
    seedTestUser,
    deleteTestUser,
    removeAllRoles,
} from '../../../helpers/db';

// The membership cutover (#91): a user's companies resolve through their group_members, and the
// admin editor manages group membership. Covers /me/company-memberships and /:userId/groups.

// UUIDs / names unique to this file (TST.UNIQUE-UUID) — integration files run in parallel.
const ACTING_USER_ID = 'c9910000-0000-4000-8000-000000000001'; // roles cleared each test (access tests)
const ADMIN_USER_ID = 'c9910000-0000-4000-8000-000000000002'; // stays admin
const SUBJECT_USER_ID = 'c9910000-0000-4000-8000-000000000003'; // the managed user

const PREFIX = 'CG91';

const { getApp } = setupIntegrationUsers(ACTING_USER_ID, ADMIN_USER_ID);
const db = getTestDb();

let seq = 0;
const freshGroupName = (label: string) => `${PREFIX} GROUP ${label} #${seq++}`;
const freshCompanyName = (label: string) => `${PREFIX} COMPANY ${label} #${seq++} LLC`;

// ── DB helpers ───────────────────────────────────────────────────────────────

async function seedGroup(name: string): Promise<string> {
    const [row] = await db
        .insert(companyGroups)
        .values({ name, createdBy: ADMIN_USER_ID })
        .returning({ id: companyGroups.id });
    return row.id;
}

async function seedCompany(name: string, groupId: string | null): Promise<string> {
    const [row] = await db
        .insert(companies)
        .values({ companyName: name, groupId })
        .returning({ id: companies.id });
    return row.id;
}

async function seedMembership(userId: string, groupId: string): Promise<void> {
    await db.insert(groupMembers).values({ userId, groupId });
}

async function groupIdsFor(userId: string): Promise<string[]> {
    const rows = await db
        .select({ groupId: groupMembers.groupId })
        .from(groupMembers)
        .where(eq(groupMembers.userId, userId));
    return rows.map((r) => r.groupId);
}

async function cleanupSuiteData() {
    await db.delete(groupMembers).where(inArray(groupMembers.userId, [SUBJECT_USER_ID]));
    await db.delete(companyGroups).where(like(companyGroups.name, `${PREFIX}%`));
    await db.delete(companies).where(like(companies.companyName, `${PREFIX}%`));
}

// ── API helpers ───────────────────────────────────────────────────────────────

const get = (path: string, actor = ADMIN_USER_ID) =>
    request(getApp()).get(path).set('x-test-user-id', actor);
const put = (path: string, actor = ADMIN_USER_ID) =>
    request(getApp()).put(path).set('x-test-user-id', actor);

beforeAll(async () => {
    await cleanupSuiteData();
    await assignRole(ADMIN_USER_ID, 'admin');
    // Delete-then-seed so a crashed prior run's leftover user doesn't collide on users_pkey.
    await deleteTestUser(SUBJECT_USER_ID);
    await seedTestUser(SUBJECT_USER_ID);
});

afterAll(async () => {
    await cleanupSuiteData();
    await deleteTestUser(SUBJECT_USER_ID);
});

beforeEach(async () => {
    // Reset the subject's memberships so each test starts from a known state.
    await db.delete(groupMembers).where(eq(groupMembers.userId, SUBJECT_USER_ID));
});

// ── GET /api/users/me/company-memberships ─────────────────────────────────────

describe('GET /api/users/me/company-memberships (integration)', () => {
    it('returns every company across the groups the user belongs to', async () => {
        const groupId = await seedGroup(freshGroupName('Reach'));
        const c1 = await seedCompany(freshCompanyName('A'), groupId);
        const c2 = await seedCompany(freshCompanyName('B'), groupId);
        await seedMembership(SUBJECT_USER_ID, groupId);

        const res = await get('/api/users/me/company-memberships', SUBJECT_USER_ID);
        expect(res.status).toBe(200);
        expect(res.body.count).toBe(2);
        const ids = res.body.data.map((r: { companyId: string }) => r.companyId);
        expect(ids).toEqual(expect.arrayContaining([c1, c2]));
        expect(res.body.data[0]).toMatchObject({ groupId, groupName: expect.any(String) });
        expect(res.body.data[0].joinedAt).toBeTruthy();
    });

    it('excludes companies in groups the user is not a member of', async () => {
        const memberGroup = await seedGroup(freshGroupName('Mine'));
        const otherGroup = await seedGroup(freshGroupName('Other'));
        const mine = await seedCompany(freshCompanyName('Mine'), memberGroup);
        await seedCompany(freshCompanyName('NotMine'), otherGroup);
        await seedMembership(SUBJECT_USER_ID, memberGroup);

        const res = await get('/api/users/me/company-memberships', SUBJECT_USER_ID);
        expect(res.status).toBe(200);
        expect(res.body.data.map((r: { companyId: string }) => r.companyId)).toEqual([mine]);
    });

    it('returns an empty list for a user in no group', async () => {
        const res = await get('/api/users/me/company-memberships', SUBJECT_USER_ID);
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ data: [], count: 0 });
    });

    it('requires authentication', async () => {
        const res = await request(getApp()).get('/api/users/me/company-memberships');
        expect(res.status).toBe(401);
    });
});

// ── GET /api/users/:userId/groups ─────────────────────────────────────────────

describe('GET /api/users/:userId/groups (integration)', () => {
    it('returns the groups the user is a member of (admin view)', async () => {
        const g1 = await seedGroup(freshGroupName('G1'));
        const g2 = await seedGroup(freshGroupName('G2'));
        await seedMembership(SUBJECT_USER_ID, g1);
        await seedMembership(SUBJECT_USER_ID, g2);

        const res = await get(`/api/users/${SUBJECT_USER_ID}/groups`);
        expect(res.status).toBe(200);
        expect(res.body.count).toBe(2);
        const ids = res.body.data.map((r: { groupId: string }) => r.groupId);
        expect(ids).toEqual(expect.arrayContaining([g1, g2]));
    });

    it('rejects a member (403) and unauthenticated (401)', async () => {
        await removeAllRoles(ACTING_USER_ID);
        await assignRole(ACTING_USER_ID, 'member');
        expect((await get(`/api/users/${SUBJECT_USER_ID}/groups`, ACTING_USER_ID)).status).toBe(403);
        expect((await request(getApp()).get(`/api/users/${SUBJECT_USER_ID}/groups`)).status).toBe(
            401,
        );
    });

    it('allows a relationship-manager (PRIVILEGED_ROLES)', async () => {
        await removeAllRoles(ACTING_USER_ID);
        await assignRole(ACTING_USER_ID, 'relationship-manager');
        const res = await get(`/api/users/${SUBJECT_USER_ID}/groups`, ACTING_USER_ID);
        expect(res.status).toBe(200);
    });

    it('returns 400 for an invalid user id', async () => {
        expect((await get('/api/users/not-a-uuid/groups')).status).toBe(400);
    });
});

// ── PUT /api/users/:userId/groups ─────────────────────────────────────────────

describe('PUT /api/users/:userId/groups (integration)', () => {
    it('replaces the user’s memberships — adds missing and removes absent', async () => {
        const keep = await seedGroup(freshGroupName('Keep'));
        const drop = await seedGroup(freshGroupName('Drop'));
        const add = await seedGroup(freshGroupName('Add'));
        await seedMembership(SUBJECT_USER_ID, keep);
        await seedMembership(SUBJECT_USER_ID, drop);

        const res = await put(`/api/users/${SUBJECT_USER_ID}/groups`).send({
            groupIds: [keep, add],
        });
        expect(res.status).toBe(200);
        expect((await groupIdsFor(SUBJECT_USER_ID)).sort()).toEqual([keep, add].sort());
    });

    it('clears all memberships when given an empty array', async () => {
        const g = await seedGroup(freshGroupName('Clear'));
        await seedMembership(SUBJECT_USER_ID, g);

        const res = await put(`/api/users/${SUBJECT_USER_ID}/groups`).send({ groupIds: [] });
        expect(res.status).toBe(200);
        expect(await groupIdsFor(SUBJECT_USER_ID)).toEqual([]);
    });

    it('returns 400 for an unknown group id and does not change memberships', async () => {
        const g = await seedGroup(freshGroupName('Unknown'));
        await seedMembership(SUBJECT_USER_ID, g);
        const missing = 'c9910000-0000-4000-8000-0000000000ff';

        const res = await put(`/api/users/${SUBJECT_USER_ID}/groups`).send({ groupIds: [missing] });
        expect(res.status).toBe(400);
        expect(await groupIdsFor(SUBJECT_USER_ID)).toEqual([g]);
    });

    it('rejects a relationship-manager (403 — ADMIN_ROLES only)', async () => {
        await removeAllRoles(ACTING_USER_ID);
        await assignRole(ACTING_USER_ID, 'relationship-manager');
        const res = await put(`/api/users/${SUBJECT_USER_ID}/groups`, ACTING_USER_ID).send({
            groupIds: [],
        });
        expect(res.status).toBe(403);
    });
});
