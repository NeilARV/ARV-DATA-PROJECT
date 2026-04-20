import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createTestApp } from "../../../helpers/setup";
import { seedTestUser, deleteTestUser, assignRole, removeAllRoles } from "../../../helpers/db";

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
// Fixed UUIDs that are clearly test data and won't conflict with real users.
const ACTING_USER_ID = "00000000-0000-0000-0000-000000000001";
const TARGET_USER_ID = "00000000-0000-0000-0000-000000000002";

let app: Express;

beforeAll(async () => {
    app = createTestApp();
    // Clean up any leftover data from a previous failed run, then seed fresh.
    await deleteTestUser(ACTING_USER_ID);
    await deleteTestUser(TARGET_USER_ID);
    await seedTestUser(ACTING_USER_ID);
    await seedTestUser(TARGET_USER_ID);
});

afterAll(async () => {
    await deleteTestUser(ACTING_USER_ID);
    await deleteTestUser(TARGET_USER_ID);
});

// Reset roles before each test so every test starts from a clean slate.
beforeEach(async () => {
    await removeAllRoles(ACTING_USER_ID);
});

// ── Helpers ────────────────────────────────────────────────────────────────
function deleteUser() {
    return request(app)
        .delete(`/api/users/${TARGET_USER_ID}`)
        .set("x-test-user-id", ACTING_USER_ID);
}

function deleteSubscriptionTier() {
    return request(app)
        .delete(`/api/users/${TARGET_USER_ID}/subscription-tier`)
        .set("x-test-user-id", ACTING_USER_ID);
}

// ── Tests ──────────────────────────────────────────────────────────────────
describe("DELETE /api/users/:userId — role enforcement (integration)", () => {
    describe("allowed roles", () => {
        it("returns 204 when caller has admin role", async () => {
            await assignRole(ACTING_USER_ID, "admin");
            expect((await deleteUser()).status).toBe(204);
        });

        it("returns 204 when caller has owner role", async () => {
            await assignRole(ACTING_USER_ID, "owner");
            expect((await deleteUser()).status).toBe(204);
        });
    });

    describe("blocked roles", () => {
        it("returns 403 when caller has relationship-manager role", async () => {
            await assignRole(ACTING_USER_ID, "relationship-manager");
            expect((await deleteUser()).status).toBe(403);
        });

        it("returns 403 when caller has member role", async () => {
            await assignRole(ACTING_USER_ID, "member");
            expect((await deleteUser()).status).toBe(403);
        });

        it("returns 403 when caller has no roles", async () => {
            expect((await deleteUser()).status).toBe(403);
        });
    });

    describe("unauthenticated", () => {
        it("returns 401 when there is no session", async () => {
            const res = await request(app).delete(`/api/users/${TARGET_USER_ID}`);
            expect(res.status).toBe(401);
        });
    });
});

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
            const res = await request(app).delete(`/api/users/${TARGET_USER_ID}/subscription-tier`);
            expect(res.status).toBe(401);
        });
    });
});
