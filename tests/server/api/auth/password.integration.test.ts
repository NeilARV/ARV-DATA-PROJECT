import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import type { Express } from 'express';
import { createTestApp } from '../../../helpers/setup';
import { getTestDb, deleteTestUser } from '../../../helpers/db';
import { users } from '@database/schemas/users.schema';

// These routes run their real controllers against the Neon test branch.
// PATCH /api/auth/me/password verifies the current password with bcrypt before
// writing; POST /api/auth/forgot-password is public and always returns 200.

const TEST_USER_ID = '00000000-0000-0000-0000-0000000000b1';
const TEST_EMAIL = `${TEST_USER_ID}@integration.test.internal`;
const CURRENT_PASSWORD = 'current-correct-password';

// Separate user that has must_reset_password = true, for the complete-reset route.
const RESET_USER_ID = '00000000-0000-0000-0000-0000000000b3';
const RESET_EMAIL = `${RESET_USER_ID}@integration.test.internal`;
// User authenticated but WITHOUT a pending reset, to prove complete-reset is flag-gated.
const NO_RESET_USER_ID = '00000000-0000-0000-0000-0000000000b4';
const NO_RESET_EMAIL = `${NO_RESET_USER_ID}@integration.test.internal`;

let app: Express;

beforeAll(async () => {
    app = createTestApp();
    await deleteTestUser(TEST_USER_ID);
    await deleteTestUser(RESET_USER_ID);
    await deleteTestUser(NO_RESET_USER_ID);
    const passwordHash = await bcrypt.hash(CURRENT_PASSWORD, 10);
    await getTestDb().insert(users).values([
        {
            id: TEST_USER_ID,
            firstName: 'Integration',
            lastName: 'Password',
            email: TEST_EMAIL,
            phone: '(555) 000-0000',
            passwordHash,
        },
        {
            id: RESET_USER_ID,
            firstName: 'Integration',
            lastName: 'Reset',
            email: RESET_EMAIL,
            phone: '(555) 000-0000',
            passwordHash,
            mustResetPassword: true,
        },
        {
            id: NO_RESET_USER_ID,
            firstName: 'Integration',
            lastName: 'NoReset',
            email: NO_RESET_EMAIL,
            phone: '(555) 000-0000',
            passwordHash,
        },
    ]);
});

afterAll(async () => {
    await deleteTestUser(TEST_USER_ID);
    await deleteTestUser(RESET_USER_ID);
    await deleteTestUser(NO_RESET_USER_ID);
});

describe('PATCH /api/auth/me/password — change password (integration)', () => {
    describe('access control', () => {
        it('returns 401 when unauthenticated', async () => {
            const res = await request(app)
                .patch('/api/auth/me/password')
                .send({ currentPassword: CURRENT_PASSWORD, newPassword: 'a-new-password' });
            expect(res.status).toBe(401);
        });
    });

    describe('input validation', () => {
        it('returns 400 when currentPassword is missing', async () => {
            const res = await request(app)
                .patch('/api/auth/me/password')
                .set('x-test-user-id', TEST_USER_ID)
                .send({ newPassword: 'a-new-password' });
            expect(res.status).toBe(400);
        });

        it('returns 400 when newPassword is missing', async () => {
            const res = await request(app)
                .patch('/api/auth/me/password')
                .set('x-test-user-id', TEST_USER_ID)
                .send({ currentPassword: CURRENT_PASSWORD });
            expect(res.status).toBe(400);
        });

        it('returns 400 when newPassword is shorter than 6 characters', async () => {
            const res = await request(app)
                .patch('/api/auth/me/password')
                .set('x-test-user-id', TEST_USER_ID)
                .send({ currentPassword: CURRENT_PASSWORD, newPassword: 'abc' });
            expect(res.status).toBe(400);
        });
    });

    describe('current password check', () => {
        it('returns 400 when the current password is incorrect', async () => {
            const res = await request(app)
                .patch('/api/auth/me/password')
                .set('x-test-user-id', TEST_USER_ID)
                .send({ currentPassword: 'wrong-password', newPassword: 'a-new-password' });
            expect(res.status).toBe(400);
        });
    });

    // Mutates the seeded user's password — keep last.
    it('returns 200 and updates the password for the authenticated user', async () => {
        const res = await request(app)
            .patch('/api/auth/me/password')
            .set('x-test-user-id', TEST_USER_ID)
            .send({ currentPassword: CURRENT_PASSWORD, newPassword: 'a-brand-new-password' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});

describe('POST /api/auth/forgot-password — request temp password (integration)', () => {
    describe('input validation', () => {
        it('returns 400 when email is missing', async () => {
            const res = await request(app).post('/api/auth/forgot-password').send({});
            expect(res.status).toBe(400);
        });

        it('returns 400 when email is not a valid address', async () => {
            const res = await request(app)
                .post('/api/auth/forgot-password')
                .send({ email: 'not-an-email' });
            expect(res.status).toBe(400);
        });
    });

    describe('public access', () => {
        // Unknown email: public route, generic 200, no user touched and no email sent.
        it('returns 200 (generic) for an email with no account, without auth', async () => {
            const res = await request(app)
                .post('/api/auth/forgot-password')
                .send({ email: '00000000-0000-0000-0000-0000000000b2@integration.test.internal' });
            expect(res.status).toBe(200);
            expect(res.body.message).toBeTruthy();
        });
    });
});

describe('POST /api/auth/me/complete-reset — finish forced reset (integration)', () => {
    describe('access control', () => {
        it('returns 401 when unauthenticated', async () => {
            const res = await request(app)
                .post('/api/auth/me/complete-reset')
                .send({ newPassword: 'a-new-password' });
            expect(res.status).toBe(401);
        });

        it('returns 409 when the caller has no pending reset', async () => {
            const res = await request(app)
                .post('/api/auth/me/complete-reset')
                .set('x-test-user-id', NO_RESET_USER_ID)
                .send({ newPassword: 'a-new-password' });
            expect(res.status).toBe(409);
        });
    });

    describe('input validation', () => {
        it('returns 400 when newPassword is missing', async () => {
            const res = await request(app)
                .post('/api/auth/me/complete-reset')
                .set('x-test-user-id', RESET_USER_ID)
                .send({});
            expect(res.status).toBe(400);
        });

        it('returns 400 when newPassword is shorter than 6 characters', async () => {
            const res = await request(app)
                .post('/api/auth/me/complete-reset')
                .set('x-test-user-id', RESET_USER_ID)
                .send({ newPassword: 'abc' });
            expect(res.status).toBe(400);
        });
    });

    // Clears the pending reset for RESET_USER_ID — keep last.
    it('returns 200 and completes the reset for a flagged user', async () => {
        const res = await request(app)
            .post('/api/auth/me/complete-reset')
            .set('x-test-user-id', RESET_USER_ID)
            .send({ newPassword: 'a-brand-new-password' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});
