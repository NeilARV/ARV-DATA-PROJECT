import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { setupIntegrationUsers } from '../../../helpers/setup';
import { assignRole } from '../../../helpers/db';

// server/storage is NOT mocked — requireRole runs real DB queries against the
// Neon test branch. This means removing a role from requireRole() on the route
// will correctly cause the corresponding test to fail.

// ── Mock server/controllers/users ──────────────────────────────────────────
// Still stubbed so tests never perform real destructive operations.
vi.mock('server/controllers/users', () => ({
    UsersController: {
        listUsersHandler: vi.fn((_req, res) => res.status(200).json([])),
        listRelationshipManagersHandler: vi.fn((_req, res) => res.status(200).json([])),
        listRolesHandler: vi.fn((_req, res) => res.status(200).json([])),
        listAccountTypesHandler: vi.fn((_req, res) => res.status(200).json([])),
        assignRoleHandler: vi.fn((_req, res) => res.status(201).json({})),
        removeRoleHandler: vi.fn((_req, res) => res.status(204).send()),
        patchUserHandler: vi.fn((_req, res) => res.status(200).json({})),
        deleteUserHandler: vi.fn((_req, res) => res.status(204).send()),
    },
}));

// ── Test user IDs ──────────────────────────────────────────────────────────
const ACTING_USER_ID = '00000000-0000-0000-0000-000000000005';
const TARGET_USER_ID = '00000000-0000-0000-0000-000000000006';

const { getApp } = setupIntegrationUsers(ACTING_USER_ID, TARGET_USER_ID);

// ── Helpers ────────────────────────────────────────────────────────────────
function assignUserRole() {
    return request(getApp())
        .post(`/api/users/${TARGET_USER_ID}/roles`)
        .set('x-test-user-id', ACTING_USER_ID);
}

function removeUserRole() {
    return request(getApp())
        .delete(`/api/users/${TARGET_USER_ID}/roles/member`)
        .set('x-test-user-id', ACTING_USER_ID);
}

// ── Tests ──────────────────────────────────────────────────────────────────
describe('POST /api/users/:userId/roles — role enforcement (integration)', () => {
    describe('allowed roles', () => {
        it('returns 201 when caller has admin role', async () => {
            await assignRole(ACTING_USER_ID, 'admin');
            expect((await assignUserRole()).status).toBe(201);
        });

        it('returns 201 when caller has owner role', async () => {
            await assignRole(ACTING_USER_ID, 'owner');
            expect((await assignUserRole()).status).toBe(201);
        });
    });

    describe('blocked roles', () => {
        it('returns 403 when caller has relationship-manager role', async () => {
            await assignRole(ACTING_USER_ID, 'relationship-manager');
            expect((await assignUserRole()).status).toBe(403);
        });

        it('returns 403 when caller has member role', async () => {
            await assignRole(ACTING_USER_ID, 'member');
            expect((await assignUserRole()).status).toBe(403);
        });

        it('returns 403 when caller has no roles', async () => {
            expect((await assignUserRole()).status).toBe(403);
        });
    });

    describe('unauthenticated', () => {
        it('returns 401 when there is no session', async () => {
            const res = await request(getApp()).post(`/api/users/${TARGET_USER_ID}/roles`);
            expect(res.status).toBe(401);
        });
    });
});

describe('DELETE /api/users/:userId/roles/:role — role enforcement (integration)', () => {
    describe('allowed roles', () => {
        it('returns 204 when caller has admin role', async () => {
            await assignRole(ACTING_USER_ID, 'admin');
            expect((await removeUserRole()).status).toBe(204);
        });

        it('returns 204 when caller has owner role', async () => {
            await assignRole(ACTING_USER_ID, 'owner');
            expect((await removeUserRole()).status).toBe(204);
        });
    });

    describe('blocked roles', () => {
        it('returns 403 when caller has relationship-manager role', async () => {
            await assignRole(ACTING_USER_ID, 'relationship-manager');
            expect((await removeUserRole()).status).toBe(403);
        });

        it('returns 403 when caller has member role', async () => {
            await assignRole(ACTING_USER_ID, 'member');
            expect((await removeUserRole()).status).toBe(403);
        });

        it('returns 403 when caller has no roles', async () => {
            expect((await removeUserRole()).status).toBe(403);
        });
    });

    describe('unauthenticated', () => {
        it('returns 401 when there is no session', async () => {
            const res = await request(getApp()).delete(`/api/users/${TARGET_USER_ID}/roles/member`);
            expect(res.status).toBe(401);
        });
    });
});
