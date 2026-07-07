import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestApp } from '../../../helpers/setup';
import { getTestDb, deleteTestUser } from '../../../helpers/db';
import { users } from '@database/schemas/users.schema';
import { authTokens } from '@database/schemas/authTokens.schema';
import { and, eq } from 'drizzle-orm';

// Stub the external email send; the token write still hits the test branch so the
// re-verification side effect can be asserted from its persisted result.
vi.mock('server/services/postmark/linkEmail.services', () => ({
    sendLinkEmail: vi.fn().mockResolvedValue(undefined),
}));

import { sendLinkEmail } from 'server/services/postmark/linkEmail.services';

// Verified user whose email is changed (stamp cleared + verification re-issued)
const CHANGE_USER_ID = '00000000-0000-0000-0000-0000000000e1';
// Verified user who rewrites their email with different casing only (stamp kept)
const CASE_USER_ID = '00000000-0000-0000-0000-0000000000e2';
// Verified user whose verification email send fails (response must stay 200)
const FAIL_USER_ID = '00000000-0000-0000-0000-0000000000e3';
// Existing user whose email the conflict test collides with
const CONFLICT_TARGET_ID = '00000000-0000-0000-0000-0000000000e4';
// Verified user for non-email updates (stamp untouched) and the conflict attempt
const PLAIN_USER_ID = '00000000-0000-0000-0000-0000000000e5';

const ALL_IDS = [CHANGE_USER_ID, CASE_USER_ID, FAIL_USER_ID, CONFLICT_TARGET_ID, PLAIN_USER_ID];

const emailFor = (id: string): string => `${id}@integration.test.internal`;

async function getEmailVerifiedAt(userId: string): Promise<Date | null> {
    const [row] = await getTestDb()
        .select({ emailVerifiedAt: users.emailVerifiedAt })
        .from(users)
        .where(eq(users.id, userId));
    return row.emailVerifiedAt;
}

async function countVerificationTokens(userId: string): Promise<number> {
    const rows = await getTestDb()
        .select({ id: authTokens.id })
        .from(authTokens)
        .where(and(eq(authTokens.userId, userId), eq(authTokens.type, 'email_verification')));
    return rows.length;
}

let app: Express;

beforeAll(async () => {
    app = createTestApp();
    for (const id of ALL_IDS) await deleteTestUser(id);
    await getTestDb()
        .insert(users)
        .values(
            ALL_IDS.map((id) => ({
                id,
                firstName: 'Integration',
                lastName: 'Profile',
                email: emailFor(id),
                phone: '(555) 000-0000',
                passwordHash: 'not-a-real-hash',
                emailVerifiedAt: new Date(),
            })),
        );
});

afterAll(async () => {
    // auth_tokens rows cascade with the user delete
    for (const id of ALL_IDS) await deleteTestUser(id);
});

describe('PATCH /api/auth/me (integration)', () => {
    describe('access control', () => {
        it('returns 401 when unauthenticated', async () => {
            const res = await request(app).patch('/api/auth/me').send({ firstName: 'X' });
            expect(res.status).toBe(401);
        });
    });

    describe('input validation', () => {
        it('returns 400 with { message, errors } for an invalid email', async () => {
            const res = await request(app)
                .patch('/api/auth/me')
                .set('x-test-user-id', PLAIN_USER_ID)
                .send({ email: 'not-an-email' });
            expect(res.status).toBe(400);
            expect(res.body).toHaveProperty('message');
            expect(res.body).toHaveProperty('errors');
        });

        it('returns 400 for an unknown field (strict schema)', async () => {
            const res = await request(app)
                .patch('/api/auth/me')
                .set('x-test-user-id', PLAIN_USER_ID)
                .send({ role: 'owner' });
            expect(res.status).toBe(400);
        });
    });

    describe('email change → re-verification', () => {
        it('clears emailVerifiedAt and issues a new verification token', async () => {
            const newEmail = `${CHANGE_USER_ID}-changed@integration.test.internal`;

            const res = await request(app)
                .patch('/api/auth/me')
                .set('x-test-user-id', CHANGE_USER_ID)
                .send({ email: newEmail });
            expect(res.status).toBe(200);
            expect(res.body.user.email).toBe(newEmail);

            // State persisted, not just echoed back
            expect(await getEmailVerifiedAt(CHANGE_USER_ID)).toBeNull();

            // The verification email is fire-and-forget after the response — wait for
            // its persisted result (the minted token row), not the send itself.
            await vi.waitFor(
                async () => {
                    expect(await countVerificationTokens(CHANGE_USER_ID)).toBeGreaterThan(0);
                },
                { timeout: 5000, interval: 100 },
            );
        });

        it('keeps emailVerifiedAt and issues no token for a case-only rewrite', async () => {
            const res = await request(app)
                .patch('/api/auth/me')
                .set('x-test-user-id', CASE_USER_ID)
                .send({ email: emailFor(CASE_USER_ID).toUpperCase() });
            expect(res.status).toBe(200);

            expect(await getEmailVerifiedAt(CASE_USER_ID)).not.toBeNull();

            // Nothing async was queued for an unchanged mailbox; one flush is enough
            await new Promise((resolve) => setImmediate(resolve));
            expect(await countVerificationTokens(CASE_USER_ID)).toBe(0);
        });

        it('keeps emailVerifiedAt when the email field is not sent', async () => {
            const res = await request(app)
                .patch('/api/auth/me')
                .set('x-test-user-id', PLAIN_USER_ID)
                .send({ firstName: 'Renamed' });
            expect(res.status).toBe(200);
            expect(res.body.user.firstName).toBe('Renamed');

            expect(await getEmailVerifiedAt(PLAIN_USER_ID)).not.toBeNull();
        });

        it('still returns 200 when the verification email send fails', async () => {
            vi.mocked(sendLinkEmail).mockRejectedValueOnce(new Error('postmark down'));
            const newEmail = `${FAIL_USER_ID}-changed@integration.test.internal`;

            const res = await request(app)
                .patch('/api/auth/me')
                .set('x-test-user-id', FAIL_USER_ID)
                .send({ email: newEmail });
            expect(res.status).toBe(200);

            // The state transition still happened; only the send failed
            expect(await getEmailVerifiedAt(FAIL_USER_ID)).toBeNull();
        });
    });

    describe('conflicts', () => {
        it('returns 409 when the new email belongs to another user (case-insensitive)', async () => {
            const res = await request(app)
                .patch('/api/auth/me')
                .set('x-test-user-id', PLAIN_USER_ID)
                .send({ email: emailFor(CONFLICT_TARGET_ID).toUpperCase() });
            expect(res.status).toBe(409);
        });
    });
});
