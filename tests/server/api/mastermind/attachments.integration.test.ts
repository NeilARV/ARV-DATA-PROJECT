import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { setupIntegrationUsers } from '../../../helpers/setup';
import { assignRole, assignSubscription } from '../../../helpers/db';

// Access tests: mock the controller so no real upload happens, but let requireMastermind run
// its real DB queries against the test branch.
vi.mock('server/controllers/messages/attachments.controllers', () => ({
    uploadAttachmentController: vi.fn((_req, res) => res.status(201).json({ attachment: {} })),
}));

const ACTING_USER_ID = '00000000-0000-0000-0000-000000000048';
const OTHER_USER_ID = '00000000-0000-0000-0000-000000000049';

const { getApp } = setupIntegrationUsers(ACTING_USER_ID, OTHER_USER_ID);

// ── POST /api/mastermind/attachments — requireMastermind ────────────────────────
describe('POST /api/mastermind/attachments — access enforcement (integration)', () => {
    it('returns 201 for a basic subscriber', async () => {
        await assignSubscription(ACTING_USER_ID, 'basic');
        const res = await request(getApp())
            .post('/api/mastermind/attachments')
            .set('x-test-user-id', ACTING_USER_ID)
            .attach('file', Buffer.from('hello'), 'note.txt');
        expect(res.status).toBe(201);
    });

    it('returns 201 for a team member with no subscription (bypass)', async () => {
        await assignRole(ACTING_USER_ID, 'member');
        const res = await request(getApp())
            .post('/api/mastermind/attachments')
            .set('x-test-user-id', ACTING_USER_ID)
            .attach('file', Buffer.from('hello'), 'note.txt');
        expect(res.status).toBe(201);
    });

    it('returns 403 when caller has no role and no subscription', async () => {
        const res = await request(getApp())
            .post('/api/mastermind/attachments')
            .set('x-test-user-id', ACTING_USER_ID)
            .attach('file', Buffer.from('hello'), 'note.txt');
        expect(res.status).toBe(403);
    });

    it('returns 401 when there is no session', async () => {
        const res = await request(getApp())
            .post('/api/mastermind/attachments')
            .attach('file', Buffer.from('hello'), 'note.txt');
        expect(res.status).toBe(401);
    });
});
