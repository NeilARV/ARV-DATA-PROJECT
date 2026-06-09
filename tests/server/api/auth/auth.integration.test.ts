import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import type { Express } from 'express';
import { createTestApp } from '../../../helpers/setup';
import { getTestDb, deleteTestUser } from '../../../helpers/db';
import { users } from '@database/schemas/users.schema';

// server/storage is NOT mocked — POST /api/auth/login runs the real Session.login
// controller, which looks the user up by email and verifies the password with
// bcrypt against the Neon test branch. This is the behavior we are locking in:
// a regression in the password check (e.g. dropping the `await` on
// SessionServices.isValidPassword) must make these tests fail.

const TEST_USER_ID = '00000000-0000-0000-0000-0000000000a1';
const TEST_EMAIL = `${TEST_USER_ID}@integration.test.internal`;
const CORRECT_PASSWORD = 'correct-horse-battery-staple';
const WRONG_PASSWORD = 'definitely-not-the-password';

let app: Express;

beforeAll(async () => {
    app = createTestApp();
    await deleteTestUser(TEST_USER_ID);
    const passwordHash = await bcrypt.hash(CORRECT_PASSWORD, 10);
    await getTestDb().insert(users).values({
        id: TEST_USER_ID,
        firstName: 'Integration',
        lastName: 'Login',
        email: TEST_EMAIL,
        phone: '(555) 000-0000',
        passwordHash,
    });
});

afterAll(async () => {
    await deleteTestUser(TEST_USER_ID);
});

function login(email: string, password: string) {
    return request(app).post('/api/auth/login').send({ email, password });
}

describe('POST /api/auth/login — password verification (integration)', () => {
    it('returns 200 and the user when the password is correct', async () => {
        const res = await login(TEST_EMAIL, CORRECT_PASSWORD);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.user?.id).toBe(TEST_USER_ID);
        // The password hash must never be returned to the client.
        expect(res.body.user?.passwordHash).toBeUndefined();
    });

    // ── Regression guard for the auth-bypass bug ────────────────────────────
    // Previously SessionServices.isValidPassword was called without `await`, so
    // the controller compared a (truthy) Promise instead of a boolean and let
    // ANY password through. This case must return 401, never 200.
    it('returns 401 when the password is wrong for a real account', async () => {
        const res = await login(TEST_EMAIL, WRONG_PASSWORD);
        expect(res.status).toBe(401);
        expect(res.body.success).toBeUndefined();
        expect(res.body.user).toBeUndefined();
    });

    it('returns 401 for an email that has no account', async () => {
        const res = await login(
            '00000000-0000-0000-0000-0000000000a2@integration.test.internal',
            CORRECT_PASSWORD,
        );
        expect(res.status).toBe(401);
        expect(res.body.user).toBeUndefined();
    });
});
