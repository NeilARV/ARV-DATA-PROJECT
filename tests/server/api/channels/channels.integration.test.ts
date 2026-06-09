import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { setupIntegrationUsers } from '../../../helpers/setup';
import { assignRole, assignSubscription } from '../../../helpers/db';

// Role/auth tests: mock the controller so no real DB writes happen, but let
// requireMastermind / requireRole run their real DB queries against the test branch.
vi.mock('server/controllers/channels/channels.controllers', () => ({
    getChannelsController: vi.fn((_req, res) => res.status(200).json({ channels: [] })),
    createChannelController: vi.fn((_req, res) => res.status(201).json({})),
    updateChannelController: vi.fn((_req, res) => res.status(200).json({})),
    archiveChannelController: vi.fn((_req, res) => res.status(200).json({})),
    deleteChannelController: vi.fn((_req, res) => res.status(200).json({})),
}));

const ACTING_USER_ID = '00000000-0000-0000-0000-000000000024';
const OTHER_USER_ID = '00000000-0000-0000-0000-000000000025';
const DUMMY_CHANNEL_ID = '11111111-1111-1111-1111-111111111111';

const { getApp } = setupIntegrationUsers(ACTING_USER_ID, OTHER_USER_ID);

// ── GET /api/channels — requireMastermind ──────────────────────────────────────
describe('GET /api/channels — access enforcement (integration)', () => {
    it('returns 200 for a basic subscriber', async () => {
        await assignSubscription(ACTING_USER_ID, 'basic');
        const res = await request(getApp())
            .get('/api/channels')
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(200);
    });

    // member is a bypass role with no subscription — still eligible.
    it('returns 200 for a team member with no subscription', async () => {
        await assignRole(ACTING_USER_ID, 'member');
        const res = await request(getApp())
            .get('/api/channels')
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(200);
    });

    it('returns 403 when caller has no role and no subscription', async () => {
        const res = await request(getApp())
            .get('/api/channels')
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(403);
    });

    it('returns 401 when there is no session', async () => {
        const res = await request(getApp()).get('/api/channels');
        expect(res.status).toBe(401);
    });
});

// ── Channel management — requireRole(['admin','owner']) ─────────────────────────
describe('Channel management — admin/owner enforcement (integration)', () => {
    describe('POST /api/channels', () => {
        it('returns 201 when caller has admin role', async () => {
            await assignRole(ACTING_USER_ID, 'admin');
            const res = await request(getApp())
                .post('/api/channels')
                .set('x-test-user-id', ACTING_USER_ID)
                .send({ name: 'integration-test' });
            expect(res.status).toBe(201);
        });

        it('returns 403 when caller has only member role', async () => {
            await assignRole(ACTING_USER_ID, 'member');
            const res = await request(getApp())
                .post('/api/channels')
                .set('x-test-user-id', ACTING_USER_ID)
                .send({ name: 'integration-test' });
            expect(res.status).toBe(403);
        });

        it('returns 401 when there is no session', async () => {
            const res = await request(getApp()).post('/api/channels').send({ name: 'x' });
            expect(res.status).toBe(401);
        });
    });

    describe('PATCH /api/channels/:id', () => {
        it('returns 200 when caller has owner role', async () => {
            await assignRole(ACTING_USER_ID, 'owner');
            const res = await request(getApp())
                .patch(`/api/channels/${DUMMY_CHANNEL_ID}`)
                .set('x-test-user-id', ACTING_USER_ID)
                .send({ description: 'updated' });
            expect(res.status).toBe(200);
        });

        it('returns 403 when caller has only member role', async () => {
            await assignRole(ACTING_USER_ID, 'member');
            const res = await request(getApp())
                .patch(`/api/channels/${DUMMY_CHANNEL_ID}`)
                .set('x-test-user-id', ACTING_USER_ID)
                .send({ description: 'updated' });
            expect(res.status).toBe(403);
        });

        it('returns 401 when there is no session', async () => {
            const res = await request(getApp())
                .patch(`/api/channels/${DUMMY_CHANNEL_ID}`)
                .send({ description: 'updated' });
            expect(res.status).toBe(401);
        });
    });

    describe('POST /api/channels/:id/archive', () => {
        it('returns 200 when caller has admin role', async () => {
            await assignRole(ACTING_USER_ID, 'admin');
            const res = await request(getApp())
                .post(`/api/channels/${DUMMY_CHANNEL_ID}/archive`)
                .set('x-test-user-id', ACTING_USER_ID);
            expect(res.status).toBe(200);
        });

        it('returns 403 when caller has only member role', async () => {
            await assignRole(ACTING_USER_ID, 'member');
            const res = await request(getApp())
                .post(`/api/channels/${DUMMY_CHANNEL_ID}/archive`)
                .set('x-test-user-id', ACTING_USER_ID);
            expect(res.status).toBe(403);
        });

        it('returns 401 when there is no session', async () => {
            const res = await request(getApp()).post(
                `/api/channels/${DUMMY_CHANNEL_ID}/archive`,
            );
            expect(res.status).toBe(401);
        });
    });

    describe('DELETE /api/channels/:id', () => {
        it('returns 200 when caller has admin role', async () => {
            await assignRole(ACTING_USER_ID, 'admin');
            const res = await request(getApp())
                .delete(`/api/channels/${DUMMY_CHANNEL_ID}`)
                .set('x-test-user-id', ACTING_USER_ID);
            expect(res.status).toBe(200);
        });

        it('returns 403 when caller has only member role', async () => {
            await assignRole(ACTING_USER_ID, 'member');
            const res = await request(getApp())
                .delete(`/api/channels/${DUMMY_CHANNEL_ID}`)
                .set('x-test-user-id', ACTING_USER_ID);
            expect(res.status).toBe(403);
        });

        it('returns 401 when there is no session', async () => {
            const res = await request(getApp()).delete(`/api/channels/${DUMMY_CHANNEL_ID}`);
            expect(res.status).toBe(401);
        });
    });
});
