import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { setupIntegrationUsers } from '../../../helpers/setup';
import { assignRole, assignSubscription } from '../../../helpers/db';

// Role/auth tests: mock the controller so no real DB queries happen, but let
// requireMastermind run its real DB queries against the test branch.
vi.mock('server/controllers/channels/channels.controllers', () => ({
    getChannelsController: vi.fn((_req, res) => res.status(200).json({ channels: [] })),
    markChannelReadController: vi.fn((_req, res) => res.status(204).send()),
    createChannelController: vi.fn((_req, res) => res.status(201).json({})),
    updateChannelController: vi.fn((_req, res) => res.status(200).json({})),
    archiveChannelController: vi.fn((_req, res) => res.status(200).json({})),
    deleteChannelController: vi.fn((_req, res) => res.status(200).json({})),
    getChannelMembersController: vi.fn((_req, res) => res.status(200).json({ users: [] })),
}));

const ACTING_USER_ID = '00000000-0000-0000-0000-000000000054';
const OTHER_USER_ID = '00000000-0000-0000-0000-000000000055';
const DUMMY_CHANNEL_ID = '55555555-5555-5555-5555-555555555551';

const { getApp } = setupIntegrationUsers(ACTING_USER_ID, OTHER_USER_ID);

// ── GET /api/channels/:id/members — requireMastermind ─────────────────────────
describe('GET /api/channels/:id/members — access enforcement (integration)', () => {
    it('returns 200 for a basic subscriber', async () => {
        await assignSubscription(ACTING_USER_ID, 'basic');
        const res = await request(getApp())
            .get(`/api/channels/${DUMMY_CHANNEL_ID}/members`)
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(200);
    });

    it('returns 200 for a team member with no subscription (bypass)', async () => {
        await assignRole(ACTING_USER_ID, 'member');
        const res = await request(getApp())
            .get(`/api/channels/${DUMMY_CHANNEL_ID}/members`)
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(200);
    });

    it('returns 403 when caller has no role and no subscription', async () => {
        const res = await request(getApp())
            .get(`/api/channels/${DUMMY_CHANNEL_ID}/members`)
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(403);
    });

    it('returns 401 when there is no session', async () => {
        const res = await request(getApp()).get(`/api/channels/${DUMMY_CHANNEL_ID}/members`);
        expect(res.status).toBe(401);
    });
});

