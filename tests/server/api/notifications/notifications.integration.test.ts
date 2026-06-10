import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { setupIntegrationUsers } from '../../../helpers/setup';
import { assignRole, assignSubscription } from '../../../helpers/db';

// Role/auth tests: mock the controllers so no real DB writes happen, but let
// requireMastermind run its real DB queries against the test branch.
vi.mock('server/controllers/notifications/notifications.controllers', () => ({
    getNotificationsController: vi.fn((_req, res) =>
        res.status(200).json({ notifications: [], unreadCount: 0 }),
    ),
    markNotificationReadController: vi.fn((_req, res) => res.status(204).send()),
    markAllNotificationsReadController: vi.fn((_req, res) => res.status(200).json({ updated: 0 })),
}));

const ACTING_USER_ID = '00000000-0000-0000-0000-000000000050';
const OTHER_USER_ID = '00000000-0000-0000-0000-000000000051';
const DUMMY_NOTIFICATION_ID = '66666666-6666-6666-6666-666666666661';

const { getApp } = setupIntegrationUsers(ACTING_USER_ID, OTHER_USER_ID);

// ── GET /api/notifications — requireMastermind ─────────────────────────────────
describe('GET /api/notifications — access enforcement (integration)', () => {
    it('returns 200 for a basic subscriber', async () => {
        await assignSubscription(ACTING_USER_ID, 'basic');
        const res = await request(getApp())
            .get('/api/notifications')
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(200);
    });

    it('returns 200 for a team member with no subscription (bypass)', async () => {
        await assignRole(ACTING_USER_ID, 'member');
        const res = await request(getApp())
            .get('/api/notifications')
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(200);
    });

    it('returns 403 when caller has no role and no subscription', async () => {
        const res = await request(getApp())
            .get('/api/notifications')
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(403);
    });

    it('returns 401 when there is no session', async () => {
        const res = await request(getApp()).get('/api/notifications');
        expect(res.status).toBe(401);
    });
});

// ── PATCH /api/notifications/:id/read — requireMastermind ──────────────────────
describe('PATCH /api/notifications/:id/read — access enforcement (integration)', () => {
    it('returns 204 for a basic subscriber', async () => {
        await assignSubscription(ACTING_USER_ID, 'basic');
        const res = await request(getApp())
            .patch(`/api/notifications/${DUMMY_NOTIFICATION_ID}/read`)
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(204);
    });

    it('returns 204 for a team member with no subscription (bypass)', async () => {
        await assignRole(ACTING_USER_ID, 'member');
        const res = await request(getApp())
            .patch(`/api/notifications/${DUMMY_NOTIFICATION_ID}/read`)
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(204);
    });

    it('returns 403 when caller has no role and no subscription', async () => {
        const res = await request(getApp())
            .patch(`/api/notifications/${DUMMY_NOTIFICATION_ID}/read`)
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(403);
    });

    it('returns 401 when there is no session', async () => {
        const res = await request(getApp()).patch(
            `/api/notifications/${DUMMY_NOTIFICATION_ID}/read`,
        );
        expect(res.status).toBe(401);
    });
});

// ── PATCH /api/notifications/read-all — requireMastermind ──────────────────────
describe('PATCH /api/notifications/read-all — access enforcement (integration)', () => {
    it('returns 200 for a basic subscriber', async () => {
        await assignSubscription(ACTING_USER_ID, 'basic');
        const res = await request(getApp())
            .patch('/api/notifications/read-all')
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(200);
    });

    it('returns 200 for a team member with no subscription (bypass)', async () => {
        await assignRole(ACTING_USER_ID, 'member');
        const res = await request(getApp())
            .patch('/api/notifications/read-all')
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(200);
    });

    it('returns 403 when caller has no role and no subscription', async () => {
        const res = await request(getApp())
            .patch('/api/notifications/read-all')
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(403);
    });

    it('returns 401 when there is no session', async () => {
        const res = await request(getApp()).patch('/api/notifications/read-all');
        expect(res.status).toBe(401);
    });
});
