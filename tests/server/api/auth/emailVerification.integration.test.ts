import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestApp } from '../../../helpers/setup';
import { getTestDb, deleteTestUser } from '../../../helpers/db';
import { users } from '@database/schemas/users.schema';
import { eq } from 'drizzle-orm';

// Stub the external email send; the real token write still hits the test branch so the
// consume/single-use path is exercised end-to-end.
vi.mock('server/services/postmark/linkEmail.services', () => ({
    sendLinkEmail: vi.fn().mockResolvedValue(undefined),
}));

import { createToken } from 'server/services/auth/tokens.services';

// Already-verified user (resend → alreadyVerified)
const VERIFIED_USER_ID = '00000000-0000-0000-0000-0000000000c1';
// Unverified user used for resend (verification state is unchanged by resend)
const UNVERIFIED_USER_ID = '00000000-0000-0000-0000-0000000000c2';
// Unverified user consumed by the verify-email happy-path test (becomes verified)
const CONSUME_USER_ID = '00000000-0000-0000-0000-0000000000c3';

const ALL_IDS = [VERIFIED_USER_ID, UNVERIFIED_USER_ID, CONSUME_USER_ID];

let app: Express;

beforeAll(async () => {
    app = createTestApp();
    for (const id of ALL_IDS) await deleteTestUser(id);
    await getTestDb()
        .insert(users)
        .values([
            {
                id: VERIFIED_USER_ID,
                firstName: 'Integration',
                lastName: 'Verified',
                email: `${VERIFIED_USER_ID}@integration.test.internal`,
                phone: '(555) 000-0000',
                passwordHash: 'not-a-real-hash',
                emailVerifiedAt: new Date(),
            },
            {
                id: UNVERIFIED_USER_ID,
                firstName: 'Integration',
                lastName: 'Unverified',
                email: `${UNVERIFIED_USER_ID}@integration.test.internal`,
                phone: '(555) 000-0000',
                passwordHash: 'not-a-real-hash',
            },
            {
                id: CONSUME_USER_ID,
                firstName: 'Integration',
                lastName: 'Consume',
                email: `${CONSUME_USER_ID}@integration.test.internal`,
                phone: '(555) 000-0000',
                passwordHash: 'not-a-real-hash',
            },
        ]);
});

afterAll(async () => {
    for (const id of ALL_IDS) await deleteTestUser(id);
});

describe('POST /api/auth/verify-email (integration)', () => {
    describe('input validation', () => {
        it('returns 400 when token is missing', async () => {
            const res = await request(app).post('/api/auth/verify-email').send({});
            expect(res.status).toBe(400);
        });

        it('returns 400 for an unknown / invalid token', async () => {
            const res = await request(app)
                .post('/api/auth/verify-email')
                .send({ token: 'not-a-real-token' });
            expect(res.status).toBe(400);
        });
    });

    describe('redemption', () => {
        it('returns 200 for a valid token, then 400 on reuse (single-use)', async () => {
            const rawToken = await createToken({
                type: 'email_verification',
                userId: CONSUME_USER_ID,
                ttlMs: 60_000,
            });

            const first = await request(app)
                .post('/api/auth/verify-email')
                .send({ token: rawToken });
            expect(first.status).toBe(200);

            const [user] = await getTestDb()
                .select({ emailVerifiedAt: users.emailVerifiedAt })
                .from(users)
                .where(eq(users.id, CONSUME_USER_ID));
            expect(user.emailVerifiedAt).not.toBeNull();

            const second = await request(app)
                .post('/api/auth/verify-email')
                .send({ token: rawToken });
            expect(second.status).toBe(400);
        });
    });
});

describe('POST /api/auth/resend-verification (integration)', () => {
    describe('access control', () => {
        it('returns 401 when unauthenticated', async () => {
            const res = await request(app).post('/api/auth/resend-verification');
            expect(res.status).toBe(401);
        });
    });

    describe('behavior', () => {
        it('returns 200 for an authenticated unverified user', async () => {
            const res = await request(app)
                .post('/api/auth/resend-verification')
                .set('x-test-user-id', UNVERIFIED_USER_ID);
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it('returns 200 with alreadyVerified for an already-verified user', async () => {
            const res = await request(app)
                .post('/api/auth/resend-verification')
                .set('x-test-user-id', VERIFIED_USER_ID);
            expect(res.status).toBe(200);
            expect(res.body.alreadyVerified).toBe(true);
        });
    });
});
