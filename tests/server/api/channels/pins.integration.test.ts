import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { setupIntegrationUsers } from '../../../helpers/setup';
import { assignRole, assignSubscription } from '../../../helpers/db';

// Access tests: mock the pin controllers so no real DB writes happen, but let
// requireMastermind / requireRole run their real DB queries against the test branch.
vi.mock('server/controllers/channels/pins.controllers', () => ({
    getChannelPinController: vi.fn((_req, res) => res.status(200).json({ pinned: null })),
    setChannelPinController: vi.fn((_req, res) => res.status(200).json({ pinned: null })),
    removeChannelPinController: vi.fn((_req, res) => res.status(200).json({ pinned: null })),
}));

const ACTING_USER_ID = '00000000-0000-0000-0000-000000000044';
const OTHER_USER_ID = '00000000-0000-0000-0000-000000000045';
const DUMMY_CHANNEL_ID = '77777777-7777-7777-7777-777777777771';
const DUMMY_MESSAGE_ID = '77777777-7777-7777-7777-777777777772';

const { getApp } = setupIntegrationUsers(ACTING_USER_ID, OTHER_USER_ID);

// ── GET /api/channels/:id/pin — requireMastermind ───────────────────────────────
describe('GET /api/channels/:id/pin — access enforcement (integration)', () => {
    it('returns 200 for a basic subscriber', async () => {
        await assignSubscription(ACTING_USER_ID, 'basic');
        const res = await request(getApp())
            .get(`/api/channels/${DUMMY_CHANNEL_ID}/pin`)
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(200);
    });

    it('returns 403 when caller has no role and no subscription', async () => {
        const res = await request(getApp())
            .get(`/api/channels/${DUMMY_CHANNEL_ID}/pin`)
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(403);
    });

    it('returns 401 when there is no session', async () => {
        const res = await request(getApp()).get(`/api/channels/${DUMMY_CHANNEL_ID}/pin`);
        expect(res.status).toBe(401);
    });
});

// ── POST /api/channels/:id/pin — requireRole(['admin','owner']) ─────────────────
describe('POST /api/channels/:id/pin — admin/owner enforcement (integration)', () => {
    it('returns 200 when caller has admin role', async () => {
        await assignRole(ACTING_USER_ID, 'admin');
        const res = await request(getApp())
            .post(`/api/channels/${DUMMY_CHANNEL_ID}/pin`)
            .set('x-test-user-id', ACTING_USER_ID)
            .send({ messageId: DUMMY_MESSAGE_ID });
        expect(res.status).toBe(200);
    });

    it('returns 403 when caller has only member role', async () => {
        await assignRole(ACTING_USER_ID, 'member');
        const res = await request(getApp())
            .post(`/api/channels/${DUMMY_CHANNEL_ID}/pin`)
            .set('x-test-user-id', ACTING_USER_ID)
            .send({ messageId: DUMMY_MESSAGE_ID });
        expect(res.status).toBe(403);
    });

    it('returns 401 when there is no session', async () => {
        const res = await request(getApp())
            .post(`/api/channels/${DUMMY_CHANNEL_ID}/pin`)
            .send({ messageId: DUMMY_MESSAGE_ID });
        expect(res.status).toBe(401);
    });
});

// ── DELETE /api/channels/:id/pin — requireRole(['admin','owner']) ───────────────
describe('DELETE /api/channels/:id/pin — admin/owner enforcement (integration)', () => {
    it('returns 200 when caller has owner role', async () => {
        await assignRole(ACTING_USER_ID, 'owner');
        const res = await request(getApp())
            .delete(`/api/channels/${DUMMY_CHANNEL_ID}/pin`)
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(200);
    });

    it('returns 403 when caller has only member role', async () => {
        await assignRole(ACTING_USER_ID, 'member');
        const res = await request(getApp())
            .delete(`/api/channels/${DUMMY_CHANNEL_ID}/pin`)
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(403);
    });

    it('returns 401 when there is no session', async () => {
        const res = await request(getApp()).delete(`/api/channels/${DUMMY_CHANNEL_ID}/pin`);
        expect(res.status).toBe(401);
    });
});
