import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { setupIntegrationUsers } from '../../../helpers/setup';
import { assignRole, assignSubscription } from '../../../helpers/db';

// Access tests: mock the controllers so no real DB writes happen, but let
// requireMastermind run its real DB queries against the test branch.
vi.mock('server/controllers/messages/reactions.controllers', () => ({
    addReactionController: vi.fn((_req, res) => res.status(201).json({ success: true })),
    removeReactionController: vi.fn((_req, res) => res.status(200).json({ success: true })),
}));

const ACTING_USER_ID = '00000000-0000-0000-0000-000000000040';
const OTHER_USER_ID = '00000000-0000-0000-0000-000000000041';
const DUMMY_MESSAGE_ID = '55555555-5555-5555-5555-555555555551';

const { getApp } = setupIntegrationUsers(ACTING_USER_ID, OTHER_USER_ID);

// ── POST /api/messages/:id/reactions — requireMastermind ────────────────────────
describe('POST /api/messages/:id/reactions — access enforcement (integration)', () => {
    it('returns 201 for a basic subscriber', async () => {
        await assignSubscription(ACTING_USER_ID, 'basic');
        const res = await request(getApp())
            .post(`/api/messages/${DUMMY_MESSAGE_ID}/reactions`)
            .set('x-test-user-id', ACTING_USER_ID)
            .send({ emoji: '👍' });
        expect(res.status).toBe(201);
    });

    it('returns 201 for a team member with no subscription (bypass)', async () => {
        await assignRole(ACTING_USER_ID, 'member');
        const res = await request(getApp())
            .post(`/api/messages/${DUMMY_MESSAGE_ID}/reactions`)
            .set('x-test-user-id', ACTING_USER_ID)
            .send({ emoji: '👍' });
        expect(res.status).toBe(201);
    });

    it('returns 403 when caller has no role and no subscription', async () => {
        const res = await request(getApp())
            .post(`/api/messages/${DUMMY_MESSAGE_ID}/reactions`)
            .set('x-test-user-id', ACTING_USER_ID)
            .send({ emoji: '👍' });
        expect(res.status).toBe(403);
    });

    it('returns 401 when there is no session', async () => {
        const res = await request(getApp())
            .post(`/api/messages/${DUMMY_MESSAGE_ID}/reactions`)
            .send({ emoji: '👍' });
        expect(res.status).toBe(401);
    });
});

// ── DELETE /api/messages/:id/reactions — requireMastermind ──────────────────────
describe('DELETE /api/messages/:id/reactions — access enforcement (integration)', () => {
    it('returns 200 for a basic subscriber', async () => {
        await assignSubscription(ACTING_USER_ID, 'basic');
        const res = await request(getApp())
            .delete(`/api/messages/${DUMMY_MESSAGE_ID}/reactions`)
            .set('x-test-user-id', ACTING_USER_ID)
            .send({ emoji: '👍' });
        expect(res.status).toBe(200);
    });

    it('returns 403 when caller has no role and no subscription', async () => {
        const res = await request(getApp())
            .delete(`/api/messages/${DUMMY_MESSAGE_ID}/reactions`)
            .set('x-test-user-id', ACTING_USER_ID)
            .send({ emoji: '👍' });
        expect(res.status).toBe(403);
    });

    it('returns 401 when there is no session', async () => {
        const res = await request(getApp())
            .delete(`/api/messages/${DUMMY_MESSAGE_ID}/reactions`)
            .send({ emoji: '👍' });
        expect(res.status).toBe(401);
    });
});
