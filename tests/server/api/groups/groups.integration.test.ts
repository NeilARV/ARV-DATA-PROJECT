import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { eq, like } from 'drizzle-orm';
import { companies, companyGroups, groupMembers } from '@database/schemas/companies.schema';
import type { CompanyGroup, GroupMember } from '@database/types/companies';
import { setupIntegrationUsers } from '../../../helpers/setup';
import { assignRole, getTestDb, seedTestUser, deleteTestUser } from '../../../helpers/db';

// UUIDs / names unique to this file (TST.UNIQUE-UUID) — integration files run in parallel.
const ACTING_USER_ID = 'c9880000-0000-4000-8000-000000000001'; // roles cleared each test (access tests)
const ADMIN_USER_ID = 'c9880000-0000-4000-8000-000000000002'; // stays admin (functional tests)
const MEMBER_A_ID = 'c9880000-0000-4000-8000-000000000003';
const MEMBER_B_ID = 'c9880000-0000-4000-8000-000000000004';

// Every group/company this suite creates is prefixed so teardown can prefix-delete leftovers, and
// name collisions with other suites (e.g. the CG87 backfill fixtures) can't happen.
const PREFIX = 'CG88';

const { getApp } = setupIntegrationUsers(ACTING_USER_ID, ADMIN_USER_ID);
const db = getTestDb();

let seq = 0;
const freshGroupName = (label: string) => `${PREFIX} GROUP ${label} #${seq++}`;
const freshCompanyName = (label: string) => `${PREFIX} COMPANY ${label} #${seq++} LLC`;

// ── DB helpers ───────────────────────────────────────────────────────────────

async function seedCompany(companyName: string): Promise<string> {
    const [row] = await db.insert(companies).values({ companyName }).returning({ id: companies.id });
    return row.id;
}

async function getCompany(id: string) {
    const [row] = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
    return row;
}

async function getGroupById(id: string): Promise<CompanyGroup | undefined> {
    const [row] = await db.select().from(companyGroups).where(eq(companyGroups.id, id)).limit(1);
    return row;
}

async function membersOf(groupId: string): Promise<GroupMember[]> {
    return db.select().from(groupMembers).where(eq(groupMembers.groupId, groupId));
}

// Direct group_members insert — the members API can't set is_primary, which the merge collision
// tests need to assert stays untouched on the target (B) row.
async function seedMembership(
    groupId: string,
    userId: string,
    opts: { role?: 'owner' | 'member' | null; isPrimary?: boolean } = {},
): Promise<void> {
    await db
        .insert(groupMembers)
        .values({ groupId, userId, role: opts.role ?? null, isPrimary: opts.isPrimary ?? false });
}

async function cleanupSuiteData() {
    // Delete groups first: cascades group_members and SET NULLs companies.group_id; then companies.
    await db.delete(companyGroups).where(like(companyGroups.name, `${PREFIX}%`));
    await db.delete(companies).where(like(companies.companyName, `${PREFIX}%`));
}

// ── API helpers (as the admin unless overridden) ─────────────────────────────

const get = (path: string, actor = ADMIN_USER_ID) =>
    request(getApp()).get(path).set('x-test-user-id', actor);
const post = (path: string, actor = ADMIN_USER_ID) =>
    request(getApp()).post(path).set('x-test-user-id', actor);
const patch = (path: string, actor = ADMIN_USER_ID) =>
    request(getApp()).patch(path).set('x-test-user-id', actor);
const del = (path: string, actor = ADMIN_USER_ID) =>
    request(getApp()).delete(path).set('x-test-user-id', actor);

/** Creates a group via the API as the admin and returns its row. */
async function createGroup(label = 'Base'): Promise<CompanyGroup> {
    const res = await post('/api/groups').send({ name: freshGroupName(label) });
    expect(res.status).toBe(201);
    return res.body.group;
}

beforeAll(async () => {
    await cleanupSuiteData(); // clear any leftovers from a crashed prior run
    await assignRole(ADMIN_USER_ID, 'admin'); // ADMIN keeps this across tests (not the acting user)
    // Delete-then-seed so a crashed prior run's leftover users don't collide on users_pkey.
    await deleteTestUser(MEMBER_A_ID);
    await deleteTestUser(MEMBER_B_ID);
    await seedTestUser(MEMBER_A_ID);
    await seedTestUser(MEMBER_B_ID);
});

afterAll(async () => {
    await cleanupSuiteData();
    await deleteTestUser(MEMBER_A_ID);
    await deleteTestUser(MEMBER_B_ID);
});

// ── CRUD ─────────────────────────────────────────────────────────────────────

describe('Groups API — CRUD (integration)', () => {
    it('POST /api/groups — valid body — returns 201 and persists the group', async () => {
        const name = freshGroupName('Created');
        const res = await post('/api/groups').send({ name, description: 'An operator' });
        expect(res.status).toBe(201);
        expect(res.body.group.name).toBe(name);

        const persisted = await getGroupById(res.body.group.id);
        expect(persisted?.name).toBe(name);
        expect(persisted?.description).toBe('An operator');
        expect(persisted?.createdBy).toBe(ADMIN_USER_ID);
    });

    it('POST /api/groups — duplicate name — returns 409', async () => {
        const name = freshGroupName('Dup');
        expect((await post('/api/groups').send({ name })).status).toBe(201);
        expect((await post('/api/groups').send({ name })).status).toBe(409);
    });

    it('PATCH /api/groups/:id — rename — returns 200 and persists the new name', async () => {
        const group = await createGroup('Rename');
        const newName = freshGroupName('Renamed');
        const res = await patch(`/api/groups/${group.id}`).send({ name: newName });
        expect(res.status).toBe(200);
        expect((await getGroupById(group.id))?.name).toBe(newName);
    });

    it('PATCH /api/groups/:id — edit description — returns 200 and persists', async () => {
        const group = await createGroup('Desc');
        const res = await patch(`/api/groups/${group.id}`).send({ description: 'Updated desc' });
        expect(res.status).toBe(200);
        expect((await getGroupById(group.id))?.description).toBe('Updated desc');
    });

    it('PATCH /api/groups/:id — rename onto an existing name — returns 409', async () => {
        const taken = await createGroup('Taken');
        const group = await createGroup('Mover');
        const res = await patch(`/api/groups/${group.id}`).send({ name: taken.name });
        expect(res.status).toBe(409);
    });

    it('PATCH /api/groups/:id — unknown group — returns 404', async () => {
        const res = await patch(`/api/groups/${MEMBER_A_ID}`).send({ name: freshGroupName('X') });
        expect(res.status).toBe(404);
    });

    it('DELETE /api/groups/:id — disband — returns 200 and removes the group', async () => {
        const group = await createGroup('Disband');
        const res = await del(`/api/groups/${group.id}`);
        expect(res.status).toBe(200);
        expect(await getGroupById(group.id)).toBeUndefined();
    });

    it('DELETE /api/groups/:id — unknown group — returns 404', async () => {
        expect((await del(`/api/groups/${MEMBER_A_ID}`)).status).toBe(404);
    });
});

// ── Companies ─────────────────────────────────────────────────────────────────

describe('Groups API — companies (integration)', () => {
    it('POST /api/groups/:id/companies — ungrouped company — links it to the group', async () => {
        const group = await createGroup('AddCo');
        const companyId = await seedCompany(freshCompanyName('AddCo'));
        const res = await post(`/api/groups/${group.id}/companies`).send({ companyId });
        expect(res.status).toBe(200);
        expect((await getCompany(companyId))?.groupId).toBe(group.id);
    });

    it('POST /api/groups/:id/companies — already-grouped company — moves it (one group per company)', async () => {
        const group1 = await createGroup('Move1');
        const group2 = await createGroup('Move2');
        const companyId = await seedCompany(freshCompanyName('Move'));

        await post(`/api/groups/${group1.id}/companies`).send({ companyId });
        const res = await post(`/api/groups/${group2.id}/companies`).send({ companyId });
        expect(res.status).toBe(200);

        // Moved, not duplicated: now in group2, and group1 no longer holds it.
        expect((await getCompany(companyId))?.groupId).toBe(group2.id);
        const inGroup1 = await db
            .select({ id: companies.id })
            .from(companies)
            .where(eq(companies.groupId, group1.id));
        expect(inGroup1).toHaveLength(0);
    });

    it('POST /api/groups/:id/companies — re-add to the same group — idempotent 200', async () => {
        const group = await createGroup('Reidem');
        const companyId = await seedCompany(freshCompanyName('Reidem'));
        await post(`/api/groups/${group.id}/companies`).send({ companyId });
        const res = await post(`/api/groups/${group.id}/companies`).send({ companyId });
        expect(res.status).toBe(200);
        expect((await getCompany(companyId))?.groupId).toBe(group.id);
    });

    it('POST /api/groups/:id/companies — unknown company — returns 404', async () => {
        const group = await createGroup('NoCo');
        const res = await post(`/api/groups/${group.id}/companies`).send({ companyId: MEMBER_A_ID });
        expect(res.status).toBe(404);
    });

    it('POST /api/groups/:id/companies — unknown group — returns 404', async () => {
        const companyId = await seedCompany(freshCompanyName('Orphan'));
        const res = await post(`/api/groups/${MEMBER_A_ID}/companies`).send({ companyId });
        expect(res.status).toBe(404);
    });

    it('DELETE /api/groups/:id/companies/:companyId — reverts the company to ungrouped', async () => {
        const group = await createGroup('RmCo');
        const companyId = await seedCompany(freshCompanyName('RmCo'));
        await post(`/api/groups/${group.id}/companies`).send({ companyId });

        const res = await del(`/api/groups/${group.id}/companies/${companyId}`);
        expect(res.status).toBe(200);
        expect((await getCompany(companyId))?.groupId).toBeNull();
    });

    it('DELETE /api/groups/:id/companies/:companyId — company not in that group — returns 404', async () => {
        const group = await createGroup('RmMiss');
        const companyId = await seedCompany(freshCompanyName('RmMiss')); // ungrouped
        const res = await del(`/api/groups/${group.id}/companies/${companyId}`);
        expect(res.status).toBe(404);
    });
});

// ── Members ────────────────────────────────────────────────────────────────────

describe('Groups API — members (integration)', () => {
    it('POST /api/groups/:id/members — valid user — returns 201 and persists the membership', async () => {
        const group = await createGroup('AddMem');
        const res = await post(`/api/groups/${group.id}/members`).send({ userId: MEMBER_A_ID });
        expect(res.status).toBe(201);

        const rows = await membersOf(group.id);
        expect(rows).toHaveLength(1);
        expect(rows[0].userId).toBe(MEMBER_A_ID);
        expect(rows[0].role).toBeNull(); // role omitted → null (member_role is nullable)
    });

    it('POST /api/groups/:id/members — with role — persists the role', async () => {
        const group = await createGroup('AddMemRole');
        const res = await post(`/api/groups/${group.id}/members`).send({
            userId: MEMBER_A_ID,
            role: 'owner',
        });
        expect(res.status).toBe(201);
        expect((await membersOf(group.id))[0].role).toBe('owner');
    });

    it('POST /api/groups/:id/members — already a member — returns 409', async () => {
        const group = await createGroup('DupMem');
        await post(`/api/groups/${group.id}/members`).send({ userId: MEMBER_A_ID });
        const res = await post(`/api/groups/${group.id}/members`).send({ userId: MEMBER_A_ID });
        expect(res.status).toBe(409);
    });

    it('POST /api/groups/:id/members — unknown group — returns 404', async () => {
        const res = await post(`/api/groups/${MEMBER_B_ID}/members`).send({ userId: MEMBER_A_ID });
        expect(res.status).toBe(404);
    });

    it('POST /api/groups/:id/members — unknown user — returns 404', async () => {
        const group = await createGroup('NoUser');
        // A well-formed uuid that is not a seeded user.
        const res = await post(`/api/groups/${group.id}/members`).send({
            userId: 'c9880000-0000-4000-8000-0000000000ff',
        });
        expect(res.status).toBe(404);
    });

    it('DELETE /api/groups/:id/members/:userId — existing member — returns 200 and removes it', async () => {
        const group = await createGroup('RmMem');
        await post(`/api/groups/${group.id}/members`).send({ userId: MEMBER_A_ID });
        const res = await del(`/api/groups/${group.id}/members/${MEMBER_A_ID}`);
        expect(res.status).toBe(200);
        expect(await membersOf(group.id)).toHaveLength(0);
    });

    it('DELETE /api/groups/:id/members/:userId — not a member — returns 404', async () => {
        const group = await createGroup('RmMemMiss');
        const res = await del(`/api/groups/${group.id}/members/${MEMBER_A_ID}`);
        expect(res.status).toBe(404);
    });

    it('PATCH /api/groups/:id/members/:userId — sets the role', async () => {
        const group = await createGroup('SetRole');
        await post(`/api/groups/${group.id}/members`).send({ userId: MEMBER_A_ID, role: 'member' });
        const res = await patch(`/api/groups/${group.id}/members/${MEMBER_A_ID}`).send({
            role: 'owner',
        });
        expect(res.status).toBe(200);
        expect((await membersOf(group.id))[0].role).toBe('owner');
    });

    it('PATCH /api/groups/:id/members/:userId — not a member — returns 404', async () => {
        const group = await createGroup('SetRoleMiss');
        const res = await patch(`/api/groups/${group.id}/members/${MEMBER_A_ID}`).send({
            role: 'owner',
        });
        expect(res.status).toBe(404);
    });
});

// ── Auto-singleton (company-scoped member add) ──────────────────────────────────

describe('Groups API — auto-singleton (integration)', () => {
    it('POST /api/groups/companies/:companyId/members — ungrouped company — auto-creates a singleton named after the raw company name', async () => {
        const companyName = freshCompanyName('Singleton');
        const companyId = await seedCompany(companyName);

        const res = await post(`/api/groups/companies/${companyId}/members`).send({
            userId: MEMBER_A_ID,
        });
        expect(res.status).toBe(201);
        expect(res.body.group.name).toBe(companyName); // named after the RAW company name

        // Company is linked to the new singleton and the member landed in it.
        const company = await getCompany(companyId);
        expect(company?.groupId).toBe(res.body.group.id);
        const rows = await membersOf(res.body.group.id);
        expect(rows).toHaveLength(1);
        expect(rows[0].userId).toBe(MEMBER_A_ID);
    });

    it('POST /api/groups/companies/:companyId/members — already-grouped company — adds to the existing group, no new group', async () => {
        const group = await createGroup('ExistingForCo');
        const companyId = await seedCompany(freshCompanyName('ExistingForCo'));
        await post(`/api/groups/${group.id}/companies`).send({ companyId });

        const res = await post(`/api/groups/companies/${companyId}/members`).send({
            userId: MEMBER_A_ID,
        });
        expect(res.status).toBe(201);
        expect(res.body.group.id).toBe(group.id); // reused the company's existing group
        expect((await getCompany(companyId))?.groupId).toBe(group.id);
    });

    it('POST /api/groups/companies/:companyId/members — already a member — returns 409', async () => {
        const companyId = await seedCompany(freshCompanyName('DupSingleton'));
        await post(`/api/groups/companies/${companyId}/members`).send({ userId: MEMBER_A_ID });
        const res = await post(`/api/groups/companies/${companyId}/members`).send({
            userId: MEMBER_A_ID,
        });
        expect(res.status).toBe(409);
    });

    it('POST /api/groups/companies/:companyId/members — unknown company — returns 404', async () => {
        const res = await post(`/api/groups/companies/${MEMBER_B_ID}/members`).send({
            userId: MEMBER_A_ID,
        });
        expect(res.status).toBe(404);
    });
});

// ── Disband semantics ───────────────────────────────────────────────────────────

describe('Groups API — disband semantics (integration)', () => {
    it('DELETE /api/groups/:id — reverts companies to ungrouped (SET NULL) and ends memberships (cascade)', async () => {
        const group = await createGroup('DisbandFull');
        const companyA = await seedCompany(freshCompanyName('DisbandA'));
        const companyB = await seedCompany(freshCompanyName('DisbandB'));
        await post(`/api/groups/${group.id}/companies`).send({ companyId: companyA });
        await post(`/api/groups/${group.id}/companies`).send({ companyId: companyB });
        await post(`/api/groups/${group.id}/members`).send({ userId: MEMBER_A_ID });
        await post(`/api/groups/${group.id}/members`).send({ userId: MEMBER_B_ID });

        expect((await del(`/api/groups/${group.id}`)).status).toBe(200);

        // Companies survive but revert to ungrouped (non-destructive grouping).
        expect((await getCompany(companyA))?.groupId).toBeNull();
        expect((await getCompany(companyB))?.groupId).toBeNull();
        // Memberships are gone (cascade).
        expect(await membersOf(group.id)).toHaveLength(0);
    });
});

// ── Merge A→B ────────────────────────────────────────────────────────────────

describe('Groups API — merge (integration)', () => {
    it('POST /api/groups/:id/merge — unions A’s companies into B without deleting any company', async () => {
        const a = await createGroup('MergeCoA');
        const b = await createGroup('MergeCoB');
        const c1 = await seedCompany(freshCompanyName('MergeCo1'));
        const c2 = await seedCompany(freshCompanyName('MergeCo2'));
        const c3 = await seedCompany(freshCompanyName('MergeCo3'));
        await post(`/api/groups/${a.id}/companies`).send({ companyId: c1 });
        await post(`/api/groups/${a.id}/companies`).send({ companyId: c2 });
        await post(`/api/groups/${b.id}/companies`).send({ companyId: c3 });

        const res = await post(`/api/groups/${a.id}/merge`).send({ targetGroupId: b.id });
        expect(res.status).toBe(200);
        expect(res.body.group.id).toBe(b.id);
        expect(res.body.companiesMoved).toBe(2);

        // All three companies now point at B — and none was deleted (non-destructive).
        for (const id of [c1, c2, c3]) {
            const company = await getCompany(id);
            expect(company).toBeDefined();
            expect(company?.groupId).toBe(b.id);
        }
    });

    it('POST /api/groups/:id/merge — unions A’s roster into B', async () => {
        const a = await createGroup('MergeRosterA');
        const b = await createGroup('MergeRosterB');
        await seedMembership(a.id, MEMBER_A_ID, { role: 'member' });
        await seedMembership(a.id, MEMBER_B_ID, { role: 'owner' });

        const res = await post(`/api/groups/${a.id}/merge`).send({ targetGroupId: b.id });
        expect(res.status).toBe(200);
        expect(res.body.membersMoved).toBe(2);

        const rows = await membersOf(b.id);
        expect(rows.map((r) => r.userId).sort()).toEqual([MEMBER_A_ID, MEMBER_B_ID].sort());
        expect(rows.find((r) => r.userId === MEMBER_B_ID)?.role).toBe('owner'); // role carried over
    });

    it('POST /api/groups/:id/merge — (user_id, group_id) collision keeps the target (B) row unchanged', async () => {
        const a = await createGroup('MergeCollideA');
        const b = await createGroup('MergeCollideB');
        // MEMBER_A is in both (collision); MEMBER_B is only in A (migrates).
        await seedMembership(b.id, MEMBER_A_ID, { role: 'owner', isPrimary: true });
        await seedMembership(a.id, MEMBER_A_ID, { role: 'member', isPrimary: false });
        await seedMembership(a.id, MEMBER_B_ID, { role: 'member', isPrimary: true });

        const res = await post(`/api/groups/${a.id}/merge`).send({ targetGroupId: b.id });
        expect(res.status).toBe(200);
        expect(res.body.membersMoved).toBe(1); // only MEMBER_B is newly added to B

        const rows = await membersOf(b.id);
        const collided = rows.find((r) => r.userId === MEMBER_A_ID);
        expect(collided?.role).toBe('owner'); // B's row untouched — not overwritten by A's 'member'
        expect(collided?.isPrimary).toBe(true);
        const migrated = rows.find((r) => r.userId === MEMBER_B_ID);
        expect(migrated?.role).toBe('member');
        expect(migrated?.isPrimary).toBe(true);
    });

    it('POST /api/groups/:id/merge — deletes the source group A', async () => {
        const a = await createGroup('MergeDelA');
        const b = await createGroup('MergeDelB');
        const res = await post(`/api/groups/${a.id}/merge`).send({ targetGroupId: b.id });
        expect(res.status).toBe(200);
        expect(await getGroupById(a.id)).toBeUndefined();
        expect(await getGroupById(b.id)).toBeDefined(); // B survives
    });

    it('POST /api/groups/:id/merge — merging a group into itself — returns 400', async () => {
        const a = await createGroup('MergeSelf');
        const res = await post(`/api/groups/${a.id}/merge`).send({ targetGroupId: a.id });
        expect(res.status).toBe(400);
        expect(await getGroupById(a.id)).toBeDefined(); // untouched
    });

    it('POST /api/groups/:id/merge — unknown source group — returns 404', async () => {
        const b = await createGroup('MergeNoSource');
        const res = await post(`/api/groups/${MEMBER_A_ID}/merge`).send({ targetGroupId: b.id });
        expect(res.status).toBe(404);
    });

    it('POST /api/groups/:id/merge — unknown target group — returns 404', async () => {
        const a = await createGroup('MergeNoTarget');
        const res = await post(`/api/groups/${a.id}/merge`).send({ targetGroupId: MEMBER_B_ID });
        expect(res.status).toBe(404);
        expect(await getGroupById(a.id)).toBeDefined(); // source untouched when target is missing
    });

    it('POST /api/groups/:id/merge — member — returns 403', async () => {
        await assignRole(ACTING_USER_ID, 'member');
        const res = await post(`/api/groups/${MEMBER_A_ID}/merge`, ACTING_USER_ID).send({
            targetGroupId: MEMBER_B_ID,
        });
        expect(res.status).toBe(403);
    });

    it('POST /api/groups/:id/merge — unauthenticated — returns 401', async () => {
        const res = await request(getApp())
            .post(`/api/groups/${MEMBER_A_ID}/merge`)
            .send({ targetGroupId: MEMBER_B_ID });
        expect(res.status).toBe(401);
    });
});

// ── Read (list + detail) ────────────────────────────────────────────────────────

describe('Groups API — read (integration)', () => {
    it('GET /api/groups — lists groups with company + member counts', async () => {
        const group = await createGroup('ListCounts');
        const companyA = await seedCompany(freshCompanyName('ListA'));
        const companyB = await seedCompany(freshCompanyName('ListB'));
        await post(`/api/groups/${group.id}/companies`).send({ companyId: companyA });
        await post(`/api/groups/${group.id}/companies`).send({ companyId: companyB });
        await post(`/api/groups/${group.id}/members`).send({ userId: MEMBER_A_ID });

        const res = await get('/api/groups');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.data)).toBe(true);

        const found = res.body.data.find((g: { id: string }) => g.id === group.id);
        expect(found).toBeDefined();
        expect(found.name).toBe(group.name);
        expect(found.companyCount).toBe(2);
        expect(found.memberCount).toBe(1);
    });

    it('GET /api/groups — a group with no companies/members reports zero counts', async () => {
        const group = await createGroup('ListEmpty');
        const res = await get('/api/groups');
        const found = res.body.data.find((g: { id: string }) => g.id === group.id);
        expect(found).toBeDefined();
        expect(found.companyCount).toBe(0);
        expect(found.memberCount).toBe(0);
    });

    it('GET /api/groups/:id — returns the group with its companies and members', async () => {
        const group = await createGroup('Detail');
        const companyName = freshCompanyName('DetailCo');
        const companyId = await seedCompany(companyName);
        await post(`/api/groups/${group.id}/companies`).send({ companyId });
        await post(`/api/groups/${group.id}/members`).send({ userId: MEMBER_A_ID, role: 'owner' });

        const res = await get(`/api/groups/${group.id}`);
        expect(res.status).toBe(200);
        expect(res.body.group.id).toBe(group.id);

        expect(res.body.companies).toHaveLength(1);
        expect(res.body.companies[0]).toMatchObject({ id: companyId, companyName });

        expect(res.body.members).toHaveLength(1);
        expect(res.body.members[0]).toMatchObject({
            userId: MEMBER_A_ID,
            role: 'owner',
            isPrimary: false,
        });
        // The member carries the user's identity for display.
        expect(typeof res.body.members[0].email).toBe('string');
    });

    it('GET /api/groups/:id — unknown group — returns 404', async () => {
        expect((await get(`/api/groups/${MEMBER_A_ID}`)).status).toBe(404);
    });

    it('GET /api/groups/:id — malformed id — returns 400', async () => {
        expect((await get('/api/groups/not-a-uuid')).status).toBe(400);
    });

    it('GET /api/groups — member — returns 403', async () => {
        await assignRole(ACTING_USER_ID, 'member');
        expect((await get('/api/groups', ACTING_USER_ID)).status).toBe(403);
    });

    it('GET /api/groups — unauthenticated — returns 401', async () => {
        expect((await request(getApp()).get('/api/groups')).status).toBe(401);
    });
});

// ── Access control (POST /api/groups is representative of the requireRole(ADMIN_ROLES) gate) ──

describe('Groups API — access control (integration)', () => {
    const create = (actor?: string) => {
        const req = request(getApp()).post('/api/groups');
        if (actor) req.set('x-test-user-id', actor);
        return req.send({ name: freshGroupName('Access') });
    };

    it('POST /api/groups — owner — returns 201', async () => {
        await assignRole(ACTING_USER_ID, 'owner');
        expect((await create(ACTING_USER_ID)).status).toBe(201);
    });

    it('POST /api/groups — admin — returns 201', async () => {
        await assignRole(ACTING_USER_ID, 'admin');
        expect((await create(ACTING_USER_ID)).status).toBe(201);
    });

    it('POST /api/groups — relationship-manager — returns 403', async () => {
        await assignRole(ACTING_USER_ID, 'relationship-manager');
        expect((await create(ACTING_USER_ID)).status).toBe(403);
    });

    it('POST /api/groups — member — returns 403', async () => {
        await assignRole(ACTING_USER_ID, 'member');
        expect((await create(ACTING_USER_ID)).status).toBe(403);
    });

    it('POST /api/groups — authenticated with no role — returns 403', async () => {
        expect((await create(ACTING_USER_ID)).status).toBe(403);
    });

    it('POST /api/groups — unauthenticated — returns 401', async () => {
        expect((await create()).status).toBe(401);
    });
});
