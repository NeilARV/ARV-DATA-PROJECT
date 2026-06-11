import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { setupIntegrationUsers } from '../../../helpers/setup';
import { assignRole, assignSubscription } from '../../../helpers/db';

// Access tests: mock the controllers so no real DB writes happen, but let
// requireMastermind run its real DB queries against the test branch.
vi.mock('server/controllers/messages/messages.controllers', () => ({
    getChannelMessagesController: vi.fn((_req, res) =>
        res.status(200).json({ messages: [], nextCursor: null }),
    ),
    createMessageController: vi.fn((_req, res) => res.status(201).json({})),
    updateMessageController: vi.fn((_req, res) => res.status(200).json({})),
    deleteMessageController: vi.fn((_req, res) => res.status(200).json({})),
}));

const ACTING_USER_ID = '00000000-0000-0000-0000-000000000030';
const OTHER_USER_ID = '00000000-0000-0000-0000-000000000031';
const DUMMY_CHANNEL_ID = '33333333-3333-3333-3333-333333333331';
const DUMMY_MESSAGE_ID = '33333333-3333-3333-3333-333333333332';

const { getApp } = setupIntegrationUsers(ACTING_USER_ID, OTHER_USER_ID);

// ── GET /api/channels/:id/messages — requireMastermind ──────────────────────────
describe('GET /api/channels/:id/messages — access enforcement (integration)', () => {
    it('returns 200 for a basic subscriber', async () => {
        await assignSubscription(ACTING_USER_ID, 'basic');
        const res = await request(getApp())
            .get(`/api/channels/${DUMMY_CHANNEL_ID}/messages`)
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(200);
    });

    it('returns 200 for a team member with no subscription (bypass)', async () => {
        await assignRole(ACTING_USER_ID, 'member');
        const res = await request(getApp())
            .get(`/api/channels/${DUMMY_CHANNEL_ID}/messages`)
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(200);
    });

    it('returns 403 when caller has no role and no subscription', async () => {
        const res = await request(getApp())
            .get(`/api/channels/${DUMMY_CHANNEL_ID}/messages`)
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(403);
    });

    it('returns 401 when there is no session', async () => {
        const res = await request(getApp()).get(`/api/channels/${DUMMY_CHANNEL_ID}/messages`);
        expect(res.status).toBe(401);
    });
});

// ── POST /api/channels/:id/messages — requireMastermind ─────────────────────────
describe('POST /api/channels/:id/messages — access enforcement (integration)', () => {
    it('returns 201 for a basic subscriber', async () => {
        await assignSubscription(ACTING_USER_ID, 'basic');
        const res = await request(getApp())
            .post(`/api/channels/${DUMMY_CHANNEL_ID}/messages`)
            .set('x-test-user-id', ACTING_USER_ID)
            .send({ content: '<p>hello</p>' });
        expect(res.status).toBe(201);
    });

    it('returns 403 when caller has no role and no subscription', async () => {
        const res = await request(getApp())
            .post(`/api/channels/${DUMMY_CHANNEL_ID}/messages`)
            .set('x-test-user-id', ACTING_USER_ID)
            .send({ content: '<p>hello</p>' });
        expect(res.status).toBe(403);
    });

    it('returns 401 when there is no session', async () => {
        const res = await request(getApp())
            .post(`/api/channels/${DUMMY_CHANNEL_ID}/messages`)
            .send({ content: '<p>hello</p>' });
        expect(res.status).toBe(401);
    });
});

// ── PATCH /api/messages/:id — requireMastermind ─────────────────────────────────
describe('PATCH /api/messages/:id — access enforcement (integration)', () => {
    it('returns 200 for a basic subscriber', async () => {
        await assignSubscription(ACTING_USER_ID, 'basic');
        const res = await request(getApp())
            .patch(`/api/messages/${DUMMY_MESSAGE_ID}`)
            .set('x-test-user-id', ACTING_USER_ID)
            .send({ content: '<p>edited</p>' });
        expect(res.status).toBe(200);
    });

    it('returns 403 when caller has no role and no subscription', async () => {
        const res = await request(getApp())
            .patch(`/api/messages/${DUMMY_MESSAGE_ID}`)
            .set('x-test-user-id', ACTING_USER_ID)
            .send({ content: '<p>edited</p>' });
        expect(res.status).toBe(403);
    });

    it('returns 401 when there is no session', async () => {
        const res = await request(getApp())
            .patch(`/api/messages/${DUMMY_MESSAGE_ID}`)
            .send({ content: '<p>edited</p>' });
        expect(res.status).toBe(401);
    });
});

// ── DELETE /api/messages/:id — requireMastermind ────────────────────────────────
describe('DELETE /api/messages/:id — access enforcement (integration)', () => {
    it('returns 200 for a basic subscriber', async () => {
        await assignSubscription(ACTING_USER_ID, 'basic');
        const res = await request(getApp())
            .delete(`/api/messages/${DUMMY_MESSAGE_ID}`)
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(200);
    });

    it('returns 403 when caller has no role and no subscription', async () => {
        const res = await request(getApp())
            .delete(`/api/messages/${DUMMY_MESSAGE_ID}`)
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(403);
    });

    it('returns 401 when there is no session', async () => {
        const res = await request(getApp()).delete(`/api/messages/${DUMMY_MESSAGE_ID}`);
        expect(res.status).toBe(401);
    });
});
