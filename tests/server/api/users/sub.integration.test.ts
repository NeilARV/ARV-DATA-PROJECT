import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { setupIntegrationUsers } from "../../../helpers/setup";
import { assignRole } from "../../../helpers/db";

// server/storage is NOT mocked — requireRole runs real DB queries against the
// Neon test branch. This means removing a role from requireRole() on the route
// will correctly cause the corresponding test to fail.

// ── Mock server/controllers/users ──────────────────────────────────────────
// Still stubbed so tests never perform real destructive operations.
vi.mock("server/controllers/users", () => ({
    UsersController: {
        listUsersHandler: vi.fn((_req, res) => res.status(200).json([])),
        listRelationshipManagersHandler: vi.fn((_req, res) => res.status(200).json([])),
        listRolesHandler: vi.fn((_req, res) => res.status(200).json([])),
        assignRelationshipManagerHandler: vi.fn((_req, res) => res.status(201).json({})),
        removeRelationshipManagerHandler: vi.fn((_req, res) => res.status(204).send()),
        assignRoleHandler: vi.fn((_req, res) => res.status(201).json({})),
        removeRoleHandler: vi.fn((_req, res) => res.status(204).send()),
        assignUserTierRoleHandler: vi.fn((_req, res) => res.status(201).json({})),
        updateUserTierRoleHandler: vi.fn((_req, res) => res.status(200).json({})),
        removeUserTierRoleHandler: vi.fn((_req, res) => res.status(204).send()),
        deleteUserHandler: vi.fn((_req, res) => res.status(204).send()),
    },
}));

// ── Test user IDs ──────────────────────────────────────────────────────────
const ACTING_USER_ID = "00000000-0000-0000-0000-000000000003";
const TARGET_USER_ID = "00000000-0000-0000-0000-000000000004";

const { getApp } = setupIntegrationUsers(ACTING_USER_ID, TARGET_USER_ID);

// ── Helpers ────────────────────────────────────────────────────────────────
function deleteSubscriptionTier() {
    return request(getApp())
        .delete(`/api/users/${TARGET_USER_ID}/subscription-tier`)
        .set("x-test-user-id", ACTING_USER_ID);
}

// ── Tests ──────────────────────────────────────────────────────────────────
describe("DELETE /api/users/:userId/subscription-tier — role enforcement (integration)", () => {
    describe("allowed roles", () => {
        it("returns 204 when caller has admin role", async () => {
            await assignRole(ACTING_USER_ID, "admin");
            expect((await deleteSubscriptionTier()).status).toBe(204);
        });

        it("returns 204 when caller has owner role", async () => {
            await assignRole(ACTING_USER_ID, "owner");
            expect((await deleteSubscriptionTier()).status).toBe(204);
        });

        it("returns 204 when caller has relationship-manager role", async () => {
            await assignRole(ACTING_USER_ID, "relationship-manager");
            expect((await deleteSubscriptionTier()).status).toBe(204);
        });
    });

    describe("blocked roles", () => {
        it("returns 403 when caller has member role", async () => {
            await assignRole(ACTING_USER_ID, "member");
            expect((await deleteSubscriptionTier()).status).toBe(403);
        });

        it("returns 403 when caller has no roles", async () => {
            expect((await deleteSubscriptionTier()).status).toBe(403);
        });
    });

    describe("unauthenticated", () => {
        it("returns 401 when there is no session", async () => {
            const res = await request(getApp()).delete(`/api/users/${TARGET_USER_ID}/subscription-tier`);
            expect(res.status).toBe(401);
        });
    });
});
