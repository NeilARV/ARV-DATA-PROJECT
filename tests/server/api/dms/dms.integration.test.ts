import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { setupIntegrationUsers } from '../../../helpers/setup';
import { assignRole, assignSubscription } from '../../../helpers/db';

// Role/auth tests: mock the controllers so no real DB writes happen, but let
// requireMastermind run its real DB queries against the test branch.
vi.mock('server/controllers/dms/dms.controllers', () => ({
    getDmCandidatesController: vi.fn((_req, res) => res.status(200).json({ users: [] })),
    getDirectMessagesController: vi.fn((_req, res) => res.status(200).json({ conversations: [] })),
    getDirectMessageHistoryController: vi.fn((_req, res) =>
        res.status(200).json({ messages: [], nextCursor: null, channelId: null, otherUser: null }),
    ),
    createDirectMessageController: vi.fn((_req, res) => res.status(201).json({})),
}));

const ACTING_USER_ID = '00000000-0000-0000-0000-000000000080';
const OTHER_USER_ID = '00000000-0000-0000-0000-000000000081';
const DUMMY_USER_ID = '88888888-8888-8888-8888-888888888881';

const { getApp } = setupIntegrationUsers(ACTING_USER_ID, OTHER_USER_ID);

// ── GET /api/dms — requireMastermind ─────────────────────────────────────────────
describe('GET /api/dms — access enforcement (integration)', () => {
    it('returns 200 for a basic subscriber', async () => {
        await assignSubscription(ACTING_USER_ID, 'basic');
        const res = await request(getApp()).get('/api/dms').set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(200);
    });

    // member is a bypass role with no subscription — still eligible.
    it('returns 200 for a team member with no subscription (bypass)', async () => {
        await assignRole(ACTING_USER_ID, 'member');
        const res = await request(getApp()).get('/api/dms').set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(200);
    });

    it('returns 403 when caller has no role and no subscription', async () => {
        const res = await request(getApp()).get('/api/dms').set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(403);
    });

    it('returns 401 when there is no session', async () => {
        const res = await request(getApp()).get('/api/dms');
        expect(res.status).toBe(401);
    });
});

// ── GET /api/dms/candidates — requireMastermind ──────────────────────────────────
describe('GET /api/dms/candidates — access enforcement (integration)', () => {
    it('returns 200 for a basic subscriber', async () => {
        await assignSubscription(ACTING_USER_ID, 'basic');
        const res = await request(getApp())
            .get('/api/dms/candidates')
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(200);
    });

    it('returns 200 for a team member with no subscription (bypass)', async () => {
        await assignRole(ACTING_USER_ID, 'member');
        const res = await request(getApp())
            .get('/api/dms/candidates')
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(200);
    });

    it('returns 403 when caller has no role and no subscription', async () => {
        const res = await request(getApp())
            .get('/api/dms/candidates')
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(403);
    });

    it('returns 401 when there is no session', async () => {
        const res = await request(getApp()).get('/api/dms/candidates');
        expect(res.status).toBe(401);
    });
});

// ── GET /api/dms/:userId/messages — requireMastermind ────────────────────────────
describe('GET /api/dms/:userId/messages — access enforcement (integration)', () => {
    it('returns 200 for a basic subscriber', async () => {
        await assignSubscription(ACTING_USER_ID, 'basic');
        const res = await request(getApp())
            .get(`/api/dms/${DUMMY_USER_ID}/messages`)
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(200);
    });

    it('returns 200 for a team member with no subscription (bypass)', async () => {
        await assignRole(ACTING_USER_ID, 'member');
        const res = await request(getApp())
            .get(`/api/dms/${DUMMY_USER_ID}/messages`)
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(200);
    });

    it('returns 403 when caller has no role and no subscription', async () => {
        const res = await request(getApp())
            .get(`/api/dms/${DUMMY_USER_ID}/messages`)
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(403);
    });

    it('returns 401 when there is no session', async () => {
        const res = await request(getApp()).get(`/api/dms/${DUMMY_USER_ID}/messages`);
        expect(res.status).toBe(401);
    });
});

// ── POST /api/dms/:userId/messages — requireMastermind ───────────────────────────
describe('POST /api/dms/:userId/messages — access enforcement (integration)', () => {
    it('returns 201 for a basic subscriber', async () => {
        await assignSubscription(ACTING_USER_ID, 'basic');
        const res = await request(getApp())
            .post(`/api/dms/${DUMMY_USER_ID}/messages`)
            .set('x-test-user-id', ACTING_USER_ID)
            .send({ content: '<p>hello</p>' });
        expect(res.status).toBe(201);
    });

    it('returns 201 for a team member with no subscription (bypass)', async () => {
        await assignRole(ACTING_USER_ID, 'member');
        const res = await request(getApp())
            .post(`/api/dms/${DUMMY_USER_ID}/messages`)
            .set('x-test-user-id', ACTING_USER_ID)
            .send({ content: '<p>hello</p>' });
        expect(res.status).toBe(201);
    });

    it('returns 403 when caller has no role and no subscription', async () => {
        const res = await request(getApp())
            .post(`/api/dms/${DUMMY_USER_ID}/messages`)
            .set('x-test-user-id', ACTING_USER_ID)
            .send({ content: '<p>hello</p>' });
        expect(res.status).toBe(403);
    });

    it('returns 401 when there is no session', async () => {
        const res = await request(getApp())
            .post(`/api/dms/${DUMMY_USER_ID}/messages`)
            .send({ content: '<p>hello</p>' });
        expect(res.status).toBe(401);
    });
});
