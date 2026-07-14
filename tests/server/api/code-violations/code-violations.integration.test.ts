import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { setupIntegrationUsers } from '../../../helpers/setup';
import { assignRole } from '../../../helpers/db';

// Access tests: mock the controller so no real ingest/DB writes happen, but let the real
// requireRole(ADMIN_ROLES) run its DB queries against the test branch. A change to the gate
// (e.g. swapping to PRIVILEGED_ROLES) must break these tests — see access-control.md §5.9a.
vi.mock('server/controllers/code-violations/code-violations.controllers', () => ({
    uploadCodeViolationCsv: vi.fn((_req, res) => res.status(201).json({})),
    listCodeViolationUploads: vi.fn((_req, res) => res.status(200).json({ uploads: [] })),
    getCodeViolationUpload: vi.fn((_req, res) => res.status(200).json({ upload: {} })),
}));

const ACTING_USER_ID = '00000000-0000-0000-0000-0000000000f1';
const OTHER_USER_ID = '00000000-0000-0000-0000-0000000000f2';
const DUMMY_UPLOAD_ID = '11111111-1111-1111-1111-1111111111c1';

const { getApp } = setupIntegrationUsers(ACTING_USER_ID, OTHER_USER_ID);

// ── POST /api/code-violations/uploads — requireRole(['admin','owner']) ──────────
describe('POST /api/code-violations/uploads — access enforcement (integration)', () => {
    it('POST /api/code-violations/uploads — admin role — returns 201', async () => {
        await assignRole(ACTING_USER_ID, 'admin');
        const res = await request(getApp())
            .post('/api/code-violations/uploads')
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(201);
    });

    it('POST /api/code-violations/uploads — owner role — returns 201', async () => {
        await assignRole(ACTING_USER_ID, 'owner');
        const res = await request(getApp())
            .post('/api/code-violations/uploads')
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(201);
    });

    // RM is excluded here (ADMIN_ROLES, not PRIVILEGED_ROLES) — the key distinction.
    it('POST /api/code-violations/uploads — relationship-manager — returns 403', async () => {
        await assignRole(ACTING_USER_ID, 'relationship-manager');
        const res = await request(getApp())
            .post('/api/code-violations/uploads')
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(403);
    });

    it('POST /api/code-violations/uploads — member role — returns 403', async () => {
        await assignRole(ACTING_USER_ID, 'member');
        const res = await request(getApp())
            .post('/api/code-violations/uploads')
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(403);
    });

    it('POST /api/code-violations/uploads — no session — returns 401', async () => {
        const res = await request(getApp()).post('/api/code-violations/uploads');
        expect(res.status).toBe(401);
    });
});

// ── GET /api/code-violations/uploads — requireRole(['admin','owner']) ───────────
describe('GET /api/code-violations/uploads — access enforcement (integration)', () => {
    it('GET /api/code-violations/uploads — owner role — returns 200', async () => {
        await assignRole(ACTING_USER_ID, 'owner');
        const res = await request(getApp())
            .get('/api/code-violations/uploads')
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(200);
    });

    it('GET /api/code-violations/uploads — relationship-manager — returns 403', async () => {
        await assignRole(ACTING_USER_ID, 'relationship-manager');
        const res = await request(getApp())
            .get('/api/code-violations/uploads')
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(403);
    });

    it('GET /api/code-violations/uploads — member role — returns 403', async () => {
        await assignRole(ACTING_USER_ID, 'member');
        const res = await request(getApp())
            .get('/api/code-violations/uploads')
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(403);
    });

    it('GET /api/code-violations/uploads — no session — returns 401', async () => {
        const res = await request(getApp()).get('/api/code-violations/uploads');
        expect(res.status).toBe(401);
    });
});

// ── GET /api/code-violations/uploads/:id — requireRole(['admin','owner']) ───────
describe('GET /api/code-violations/uploads/:id — access enforcement (integration)', () => {
    it('GET /api/code-violations/uploads/:id — admin role — returns 200', async () => {
        await assignRole(ACTING_USER_ID, 'admin');
        const res = await request(getApp())
            .get(`/api/code-violations/uploads/${DUMMY_UPLOAD_ID}`)
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(200);
    });

    it('GET /api/code-violations/uploads/:id — member role — returns 403', async () => {
        await assignRole(ACTING_USER_ID, 'member');
        const res = await request(getApp())
            .get(`/api/code-violations/uploads/${DUMMY_UPLOAD_ID}`)
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(403);
    });

    it('GET /api/code-violations/uploads/:id — no session — returns 401', async () => {
        const res = await request(getApp()).get(`/api/code-violations/uploads/${DUMMY_UPLOAD_ID}`);
        expect(res.status).toBe(401);
    });
});
