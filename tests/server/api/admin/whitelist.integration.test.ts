import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { eq, inArray } from 'drizzle-orm';
import { createTestApp } from '../../../helpers/setup';
import { getTestDb, seedTestUser, deleteTestUser, assignRole } from '../../../helpers/db';
import { emailSubscriptionList } from '@database/schemas/users.schema';
import { msas, emailSubscriptionListCounties } from '@database/schemas/msas.schema';

// UUIDs unique to this file (TST.UNIQUE-UUID) — files run in parallel.
const ADMIN_USER = '00000134-0000-4000-8000-000000000001';
const RM_USER = '00000134-0000-4000-8000-000000000002';
const MEMBER_USER = '00000134-0000-4000-8000-000000000003';

// Emails unique to this file — whitelist rows are keyed by email, not user id.
const ENTRY_EMAIL = 'wl-00000134-entry@integration.test.internal';
const CREATED_EMAIL = 'wl-00000134-created@integration.test.internal';

const SD_MSA = 'San Diego-Chula Vista-Carlsbad, CA'; // 1:1 (single county)
const DENVER_MSA = 'Denver-Aurora-Centennial, CO'; // multi-county

const db = getTestDb();

async function ensureMsa(name: string): Promise<number> {
    // MSAs are shared reference data — never deleted in teardown; ensure-then-read repeats safely.
    await db.insert(msas).values({ name }).onConflictDoNothing();
    const [row] = await db.select({ id: msas.id }).from(msas).where(eq(msas.name, name)).limit(1);
    return row.id;
}

async function entryIdFor(email: string): Promise<number | null> {
    const [row] = await db
        .select({ id: emailSubscriptionList.id })
        .from(emailSubscriptionList)
        .where(eq(emailSubscriptionList.email, email))
        .limit(1);
    return row?.id ?? null;
}

/** entryIdFor for tests that require the entry to exist — throws instead of returning null. */
async function requireEntryIdFor(email: string): Promise<number> {
    const id = await entryIdFor(email);
    if (id === null) throw new Error(`No whitelist entry for ${email}`);
    return id;
}

async function countyRowsFor(entryId: number) {
    return db
        .select({
            county: emailSubscriptionListCounties.county,
            state: emailSubscriptionListCounties.state,
            msaId: emailSubscriptionListCounties.msaId,
        })
        .from(emailSubscriptionListCounties)
        .where(eq(emailSubscriptionListCounties.subscriptionListId, entryId));
}

async function deleteTestEntries() {
    await db
        .delete(emailSubscriptionList)
        .where(inArray(emailSubscriptionList.email, [ENTRY_EMAIL, CREATED_EMAIL]));
}

/** Seeds a whitelist entry with the given county rows directly; returns its id. */
async function seedEntry(counties: { county: string; state: string; msaId: number }[]) {
    const [created] = await db
        .insert(emailSubscriptionList)
        .values({ email: ENTRY_EMAIL })
        .returning({ id: emailSubscriptionList.id });
    if (counties.length > 0) {
        await db
            .insert(emailSubscriptionListCounties)
            .values(counties.map((c) => ({ subscriptionListId: created.id, ...c })));
    }
    return created.id;
}

let app: Express;
let sdMsaId: number;
let denverMsaId: number;

beforeAll(async () => {
    app = createTestApp();
    sdMsaId = await ensureMsa(SD_MSA);
    denverMsaId = await ensureMsa(DENVER_MSA);

    for (const id of [ADMIN_USER, RM_USER, MEMBER_USER]) {
        await deleteTestUser(id);
        await seedTestUser(id);
    }
    await assignRole(ADMIN_USER, 'admin');
    await assignRole(RM_USER, 'relationship-manager');
    await assignRole(MEMBER_USER, 'member');
});

afterAll(async () => {
    await deleteTestEntries();
    for (const id of [ADMIN_USER, RM_USER, MEMBER_USER]) {
        await deleteTestUser(id);
    }
});

beforeEach(async () => {
    await deleteTestEntries();
});

describe('Admin whitelist county contract (integration)', () => {
    describe('access control', () => {
        it('GET /api/admin/whitelist — unauthenticated — returns 401', async () => {
            const res = await request(app).get('/api/admin/whitelist');
            expect(res.status).toBe(401);
        });

        it('GET /api/admin/whitelist — member — returns 403', async () => {
            const res = await request(app)
                .get('/api/admin/whitelist')
                .set('x-test-user-id', MEMBER_USER);
            expect(res.status).toBe(403);
        });

        it('POST /api/admin/whitelist — relationship manager — returns 201 (same abilities as admin)', async () => {
            const res = await request(app)
                .post('/api/admin/whitelist')
                .set('x-test-user-id', RM_USER)
                .send({ email: CREATED_EMAIL, counties: [{ county: 'San Diego', state: 'CA' }] });
            expect(res.status).toBe(201);
        });

        it('PATCH /api/admin/whitelist/:id — relationship manager — returns 200', async () => {
            const entryId = await seedEntry([{ county: 'San Diego', state: 'CA', msaId: sdMsaId }]);
            const res = await request(app)
                .patch(`/api/admin/whitelist/${entryId}`)
                .set('x-test-user-id', RM_USER)
                .send({ counties: [{ county: 'Denver', state: 'CO' }] });
            expect(res.status).toBe(200);
        });
    });

    describe('POST /api/admin/whitelist', () => {
        it('writes exactly the requested county rows, resolving each to its parent MSA', async () => {
            const res = await request(app)
                .post('/api/admin/whitelist')
                .set('x-test-user-id', ADMIN_USER)
                .send({
                    email: CREATED_EMAIL,
                    counties: [
                        { county: 'Denver', state: 'CO' },
                        { county: 'Adams', state: 'CO' },
                        { county: 'San Diego', state: 'CA' },
                    ],
                });
            expect(res.status).toBe(201);

            const entryId = await requireEntryIdFor(CREATED_EMAIL);
            const rows = await countyRowsFor(entryId);
            expect(rows).toHaveLength(3);
            expect(new Set(rows.map((r) => `${r.county}|${r.state}|${r.msaId}`))).toEqual(
                new Set([
                    `Denver|CO|${denverMsaId}`,
                    `Adams|CO|${denverMsaId}`,
                    `San Diego|CA|${sdMsaId}`,
                ]),
            );
        });

        it('drops untracked counties via server-side resolution rather than writing them', async () => {
            const res = await request(app)
                .post('/api/admin/whitelist')
                .set('x-test-user-id', ADMIN_USER)
                .send({
                    email: CREATED_EMAIL,
                    counties: [
                        { county: 'San Diego', state: 'CA' },
                        { county: 'Nowhere', state: 'ZZ' },
                    ],
                });
            expect(res.status).toBe(201);

            const entryId = await requireEntryIdFor(CREATED_EMAIL);
            const rows = await countyRowsFor(entryId);
            expect(rows).toEqual([{ county: 'San Diego', state: 'CA', msaId: sdMsaId }]);
        });

        it('rejects a list of only untracked counties with 400 — no zero-county entry is created', async () => {
            const res = await request(app)
                .post('/api/admin/whitelist')
                .set('x-test-user-id', ADMIN_USER)
                .send({
                    email: CREATED_EMAIL,
                    counties: [{ county: 'Nowhere', state: 'ZZ' }],
                });
            expect(res.status).toBe(400);
            expect(await entryIdFor(CREATED_EMAIL)).toBeNull();
        });

        it('rejects an empty counties list with 400', async () => {
            const res = await request(app)
                .post('/api/admin/whitelist')
                .set('x-test-user-id', ADMIN_USER)
                .send({ email: CREATED_EMAIL, counties: [] });
            expect(res.status).toBe(400);
            expect(res.body).toHaveProperty('message');
            expect(res.body).toHaveProperty('errors');
            expect(await entryIdFor(CREATED_EMAIL)).toBeNull();
        });

        it('rejects the retired msaName form with 400 (issue #134, strict schema)', async () => {
            const res = await request(app)
                .post('/api/admin/whitelist')
                .set('x-test-user-id', ADMIN_USER)
                .send({ email: CREATED_EMAIL, msaName: SD_MSA });
            expect(res.status).toBe(400);
        });

        it('returns 409 for an email already on the whitelist', async () => {
            await seedEntry([{ county: 'San Diego', state: 'CA', msaId: sdMsaId }]);
            const res = await request(app)
                .post('/api/admin/whitelist')
                .set('x-test-user-id', ADMIN_USER)
                .send({ email: ENTRY_EMAIL, counties: [{ county: 'San Diego', state: 'CA' }] });
            expect(res.status).toBe(409);
        });
    });

    describe('PATCH /api/admin/whitelist/:id', () => {
        it('replaces the previous county set — add and remove happen exactly', async () => {
            const entryId = await seedEntry([
                { county: 'San Diego', state: 'CA', msaId: sdMsaId },
                { county: 'Denver', state: 'CO', msaId: denverMsaId },
            ]);

            const res = await request(app)
                .patch(`/api/admin/whitelist/${entryId}`)
                .set('x-test-user-id', ADMIN_USER)
                .send({ counties: [{ county: 'Adams', state: 'CO' }] });
            expect(res.status).toBe(200);

            const rows = await countyRowsFor(entryId);
            expect(rows).toEqual([{ county: 'Adams', state: 'CO', msaId: denverMsaId }]);
        });

        it('rejects an empty counties list with 400 and leaves the rows untouched', async () => {
            const entryId = await seedEntry([{ county: 'San Diego', state: 'CA', msaId: sdMsaId }]);

            const res = await request(app)
                .patch(`/api/admin/whitelist/${entryId}`)
                .set('x-test-user-id', ADMIN_USER)
                .send({ counties: [] });
            expect(res.status).toBe(400);

            const rows = await countyRowsFor(entryId);
            expect(rows).toEqual([{ county: 'San Diego', state: 'CA', msaId: sdMsaId }]);
        });

        it('rejects a list of only untracked counties with 400 and leaves the rows untouched', async () => {
            const entryId = await seedEntry([{ county: 'San Diego', state: 'CA', msaId: sdMsaId }]);

            const res = await request(app)
                .patch(`/api/admin/whitelist/${entryId}`)
                .set('x-test-user-id', ADMIN_USER)
                .send({ counties: [{ county: 'Nowhere', state: 'ZZ' }] });
            expect(res.status).toBe(400);

            const rows = await countyRowsFor(entryId);
            expect(rows).toEqual([{ county: 'San Diego', state: 'CA', msaId: sdMsaId }]);
        });

        it('rejects a body with neither counties nor relationshipManagerId with 400', async () => {
            const entryId = await seedEntry([{ county: 'San Diego', state: 'CA', msaId: sdMsaId }]);

            const res = await request(app)
                .patch(`/api/admin/whitelist/${entryId}`)
                .set('x-test-user-id', ADMIN_USER)
                .send({});
            expect(res.status).toBe(400);
        });

        it('updates the relationship manager alone without touching county rows', async () => {
            const entryId = await seedEntry([{ county: 'San Diego', state: 'CA', msaId: sdMsaId }]);

            const res = await request(app)
                .patch(`/api/admin/whitelist/${entryId}`)
                .set('x-test-user-id', ADMIN_USER)
                .send({ relationshipManagerId: RM_USER });
            expect(res.status).toBe(200);
            expect(res.body.relationshipManagerId).toBe(RM_USER);

            const rows = await countyRowsFor(entryId);
            expect(rows).toEqual([{ county: 'San Diego', state: 'CA', msaId: sdMsaId }]);
        });

        it('returns 404 for an entry that does not exist', async () => {
            const res = await request(app)
                .patch('/api/admin/whitelist/999999999')
                .set('x-test-user-id', ADMIN_USER)
                .send({ counties: [{ county: 'San Diego', state: 'CA' }] });
            expect(res.status).toBe(404);
        });
    });

    describe('GET /api/admin/whitelist', () => {
        it('returns each entry with its counties and their MSA names', async () => {
            await seedEntry([
                { county: 'San Diego', state: 'CA', msaId: sdMsaId },
                { county: 'Denver', state: 'CO', msaId: denverMsaId },
            ]);

            const res = await request(app)
                .get('/api/admin/whitelist')
                .set('x-test-user-id', ADMIN_USER);
            expect(res.status).toBe(200);

            const entry = res.body.data.find((e: { email: string }) => e.email === ENTRY_EMAIL);
            expect(entry).toBeDefined();
            expect(entry).not.toHaveProperty('msaName');
            expect(entry.counties).toHaveLength(2);
            expect(entry.counties).toContainEqual({
                county: 'San Diego',
                state: 'CA',
                msaName: SD_MSA,
            });
            expect(entry.counties).toContainEqual({
                county: 'Denver',
                state: 'CO',
                msaName: DENVER_MSA,
            });
        });
    });

    describe('DELETE /api/admin/whitelist/:id', () => {
        it('deletes the entry and cascades its county rows', async () => {
            const entryId = await seedEntry([{ county: 'San Diego', state: 'CA', msaId: sdMsaId }]);

            const res = await request(app)
                .delete(`/api/admin/whitelist/${entryId}`)
                .set('x-test-user-id', ADMIN_USER);
            expect(res.status).toBe(200);

            expect(await entryIdFor(ENTRY_EMAIL)).toBeNull();
            expect(await countyRowsFor(entryId)).toHaveLength(0);
        });
    });
});
