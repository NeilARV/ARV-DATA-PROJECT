import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { eq } from 'drizzle-orm';
import { createTestApp } from '../../../helpers/setup';
import { getTestDb, seedTestUser, deleteTestUser } from '../../../helpers/db';
import { users } from '@database/schemas/users.schema';
import { msas, userCountySubscriptions } from '@database/schemas/msas.schema';

// The verification email that signup / profile fire is a real Postmark send — stub it so these
// tests never leave the process, and so a send failure can't affect the assertions below.
vi.mock('server/services/postmark/linkEmail.services', () => ({
    sendLinkEmail: vi.fn().mockResolvedValue(undefined),
}));

// UUIDs unique to this file (TST.UNIQUE-UUID) — files run in parallel.
const SUB_USER = '00000114-0000-4000-8000-000000000001';
const SIGNUP_SD_EMAIL = '00000114-signup-sd@integration.test.internal';
const SIGNUP_DENVER_EMAIL = '00000114-signup-denver@integration.test.internal';

const SD_MSA = 'San Diego-Chula Vista-Carlsbad, CA'; // 1:1 (single county)
const DENVER_MSA = 'Denver-Aurora-Centennial, CO'; // multi-county

const db = getTestDb();

async function ensureMsa(name: string): Promise<number> {
    // MSAs are shared reference data — never deleted in teardown; ensure-then-read repeats safely.
    await db.insert(msas).values({ name }).onConflictDoNothing();
    const [row] = await db.select({ id: msas.id }).from(msas).where(eq(msas.name, name));
    return row.id;
}

async function countyRowsFor(userId: string) {
    return db
        .select({
            county: userCountySubscriptions.county,
            state: userCountySubscriptions.state,
            msaId: userCountySubscriptions.msaId,
        })
        .from(userCountySubscriptions)
        .where(eq(userCountySubscriptions.userId, userId));
}

async function userIdByEmail(email: string): Promise<string | null> {
    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    return row?.id ?? null;
}

let app: Express;
let sdMsaId: number;
let denverMsaId: number;

beforeAll(async () => {
    app = createTestApp();
    sdMsaId = await ensureMsa(SD_MSA);
    denverMsaId = await ensureMsa(DENVER_MSA);

    await deleteTestUser(SUB_USER);
    await seedTestUser(SUB_USER);
});

afterAll(async () => {
    // county-subscription rows cascade with the user delete
    await deleteTestUser(SUB_USER);
    for (const email of [SIGNUP_SD_EMAIL, SIGNUP_DENVER_EMAIL]) {
        const id = await userIdByEmail(email);
        if (id) await deleteTestUser(id);
    }
});

describe('County subscriptions on /api/auth/me (integration)', () => {
    beforeEach(async () => {
        // Each test owns the acting user's subscription set from a clean slate.
        await db
            .delete(userCountySubscriptions)
            .where(eq(userCountySubscriptions.userId, SUB_USER));
    });

    describe('access control', () => {
        it('returns 401 when unauthenticated', async () => {
            const res = await request(app)
                .patch('/api/auth/me')
                .send({ countySubscriptions: [{ county: 'San Diego', state: 'CA' }] });
            expect(res.status).toBe(401);
        });
    });

    describe('PATCH replace-list', () => {
        it('adds exactly the rows in the list, resolving each county to its parent MSA', async () => {
            const res = await request(app)
                .patch('/api/auth/me')
                .set('x-test-user-id', SUB_USER)
                .send({
                    countySubscriptions: [
                        { county: 'Denver', state: 'CO' },
                        { county: 'Adams', state: 'CO' },
                    ],
                });
            expect(res.status).toBe(200);

            const rows = await countyRowsFor(SUB_USER);
            expect(rows).toHaveLength(2);
            expect(new Set(rows.map((r) => r.county))).toEqual(new Set(['Denver', 'Adams']));
            for (const row of rows) {
                expect(row.state).toBe('CO');
                expect(row.msaId).toBe(denverMsaId);
            }
        });

        it('replaces the previous set — add and remove happen exactly', async () => {
            await request(app)
                .patch('/api/auth/me')
                .set('x-test-user-id', SUB_USER)
                .send({
                    countySubscriptions: [
                        { county: 'Denver', state: 'CO' },
                        { county: 'Adams', state: 'CO' },
                    ],
                });

            const res = await request(app)
                .patch('/api/auth/me')
                .set('x-test-user-id', SUB_USER)
                .send({ countySubscriptions: [{ county: 'San Diego', state: 'CA' }] });
            expect(res.status).toBe(200);

            const rows = await countyRowsFor(SUB_USER);
            expect(rows).toEqual([{ county: 'San Diego', state: 'CA', msaId: sdMsaId }]);
        });

        it('clears all rows on an empty list', async () => {
            await request(app)
                .patch('/api/auth/me')
                .set('x-test-user-id', SUB_USER)
                .send({ countySubscriptions: [{ county: 'San Diego', state: 'CA' }] });

            const res = await request(app)
                .patch('/api/auth/me')
                .set('x-test-user-id', SUB_USER)
                .send({ countySubscriptions: [] });
            expect(res.status).toBe(200);

            expect(await countyRowsFor(SUB_USER)).toHaveLength(0);
        });

        it('drops counties outside the tracked universe rather than writing them', async () => {
            const res = await request(app)
                .patch('/api/auth/me')
                .set('x-test-user-id', SUB_USER)
                .send({
                    countySubscriptions: [
                        { county: 'San Diego', state: 'CA' },
                        { county: 'Nowhere', state: 'ZZ' },
                    ],
                });
            expect(res.status).toBe(200);

            const rows = await countyRowsFor(SUB_USER);
            expect(rows).toEqual([{ county: 'San Diego', state: 'CA', msaId: sdMsaId }]);
        });

        it('rejects the retired msaSubscriptions form (issue #118) via the strict schema', async () => {
            const res = await request(app)
                .patch('/api/auth/me')
                .set('x-test-user-id', SUB_USER)
                .send({ msaSubscriptions: [DENVER_MSA] });
            expect(res.status).toBe(400);

            expect(await countyRowsFor(SUB_USER)).toHaveLength(0);
        });
    });

    describe('GET /api/auth/me', () => {
        it('returns the county subscriptions with their parent MSA, grouped-derivable', async () => {
            await request(app)
                .patch('/api/auth/me')
                .set('x-test-user-id', SUB_USER)
                .send({
                    countySubscriptions: [
                        { county: 'Denver', state: 'CO' },
                        { county: 'San Diego', state: 'CA' },
                    ],
                });

            const res = await request(app).get('/api/auth/me').set('x-test-user-id', SUB_USER);
            expect(res.status).toBe(200);

            const county = res.body.user.countySubscriptions;
            expect(county).toHaveLength(2);
            expect(county).toContainEqual({
                county: 'Denver',
                state: 'CO',
                msaId: denverMsaId,
                msaName: DENVER_MSA,
            });
            expect(county).toContainEqual({
                county: 'San Diego',
                state: 'CA',
                msaId: sdMsaId,
                msaName: SD_MSA,
            });

            // The retired legacy field must be gone from the response shape (issue #118).
            expect(res.body.user).not.toHaveProperty('msaSubscriptions');
        });
    });
});

describe('Signup county seeding (integration)', () => {
    const signupBody = (email: string, county: string, state: string) => ({
        firstName: 'Integration',
        lastName: 'Signup',
        phone: '(555) 000-0000',
        email,
        password: 'correct-horse-battery-staple',
        county,
        state,
    });

    it('seeds exactly one row — the home county — for a 1:1 MSA', async () => {
        const res = await request(app)
            .post('/api/auth/signup')
            .send(signupBody(SIGNUP_SD_EMAIL, 'San Diego', 'CA'));
        expect(res.status).toBe(201);

        const userId = res.body.user.id;
        expect(await countyRowsFor(userId)).toEqual([
            { county: 'San Diego', state: 'CA', msaId: sdMsaId },
        ]);
    });

    it('seeds only the home county for a multi-county MSA — no auto-flood', async () => {
        const res = await request(app)
            .post('/api/auth/signup')
            .send(signupBody(SIGNUP_DENVER_EMAIL, 'Denver', 'CO'));
        expect(res.status).toBe(201);

        const userId = res.body.user.id;
        // Denver's MSA has many counties; the signup must seed exactly the one the user chose.
        expect(await countyRowsFor(userId)).toEqual([
            { county: 'Denver', state: 'CO', msaId: denverMsaId },
        ]);
    });
});
