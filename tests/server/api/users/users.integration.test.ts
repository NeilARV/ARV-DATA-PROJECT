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
        listAccountTypesHandler: vi.fn((_req, res) => res.status(200).json([])),
        assignRoleHandler: vi.fn((_req, res) => res.status(201).json({})),
        removeRoleHandler: vi.fn((_req, res) => res.status(204).send()),
        patchUserHandler: vi.fn((_req, res) => res.status(200).json({})),
        deleteUserHandler: vi.fn((_req, res) => res.status(204).send()),
    },
}));

// ── Test user IDs ──────────────────────────────────────────────────────────
const ACTING_USER_ID = "00000000-0000-0000-0000-000000000001";
const TARGET_USER_ID = "00000000-0000-0000-0000-000000000002";

const { getApp } = setupIntegrationUsers(ACTING_USER_ID, TARGET_USER_ID);

// ── Helpers ────────────────────────────────────────────────────────────────
function listUsers() {
    return request(getApp())
        .get("/api/users")
        .set("x-test-user-id", ACTING_USER_ID);
}

function listRelationshipManagers() {
    return request(getApp())
        .get("/api/users/relationship-managers")
        .set("x-test-user-id", ACTING_USER_ID);
}

function listRoles() {
    return request(getApp())
        .get("/api/users/roles")
        .set("x-test-user-id", ACTING_USER_ID);
}

function patchUser() {
    return request(getApp())
        .patch(`/api/users/${TARGET_USER_ID}`)
        .set("x-test-user-id", ACTING_USER_ID);
}

function deleteUser() {
    return request(getApp())
        .delete(`/api/users/${TARGET_USER_ID}`)
        .set("x-test-user-id", ACTING_USER_ID);
}

// ── Tests ──────────────────────────────────────────────────────────────────
describe("GET /api/users — role enforcement (integration)", () => {
    describe("allowed roles", () => {
        it("returns 200 when caller has admin role", async () => {
            await assignRole(ACTING_USER_ID, "admin");
            expect((await listUsers()).status).toBe(200);
        });

        it("returns 200 when caller has owner role", async () => {
            await assignRole(ACTING_USER_ID, "owner");
            expect((await listUsers()).status).toBe(200);
        });

        it("returns 200 when caller has relationship-manager role", async () => {
            await assignRole(ACTING_USER_ID, "relationship-manager");
            expect((await listUsers()).status).toBe(200);
        });

        it("returns 200 when caller has member role", async () => {
            await assignRole(ACTING_USER_ID, "member");
            expect((await listUsers()).status).toBe(200);
        });
    });

    describe("blocked roles", () => {
        it("returns 403 when caller has no roles", async () => {
            expect((await listUsers()).status).toBe(403);
        });
    });

    describe("unauthenticated", () => {
        it("returns 401 when there is no session", async () => {
            const res = await request(getApp()).get("/api/users");
            expect(res.status).toBe(401);
        });
    });
});

describe("GET /api/users/relationship-managers — role enforcement (integration)", () => {
    describe("allowed roles", () => {
        it("returns 200 when caller has admin role", async () => {
            await assignRole(ACTING_USER_ID, "admin");
            expect((await listRelationshipManagers()).status).toBe(200);
        });

        it("returns 200 when caller has owner role", async () => {
            await assignRole(ACTING_USER_ID, "owner");
            expect((await listRelationshipManagers()).status).toBe(200);
        });

        it("returns 200 when caller has relationship-manager role", async () => {
            await assignRole(ACTING_USER_ID, "relationship-manager");
            expect((await listRelationshipManagers()).status).toBe(200);
        });

        it("returns 200 when caller has member role", async () => {
            await assignRole(ACTING_USER_ID, "member");
            expect((await listRelationshipManagers()).status).toBe(200);
        });
    });

    describe("blocked roles", () => {
        it("returns 403 when caller has no roles", async () => {
            expect((await listRelationshipManagers()).status).toBe(403);
        });
    });

    describe("unauthenticated", () => {
        it("returns 401 when there is no session", async () => {
            const res = await request(getApp()).get("/api/users/relationship-managers");
            expect(res.status).toBe(401);
        });
    });
});

describe("GET /api/users/roles — role enforcement (integration)", () => {
    describe("allowed roles", () => {
        it("returns 200 when caller has admin role", async () => {
            await assignRole(ACTING_USER_ID, "admin");
            expect((await listRoles()).status).toBe(200);
        });

        it("returns 200 when caller has owner role", async () => {
            await assignRole(ACTING_USER_ID, "owner");
            expect((await listRoles()).status).toBe(200);
        });
    });

    describe("blocked roles", () => {
        it("returns 403 when caller has relationship-manager role", async () => {
            await assignRole(ACTING_USER_ID, "relationship-manager");
            expect((await listRoles()).status).toBe(403);
        });

        it("returns 403 when caller has member role", async () => {
            await assignRole(ACTING_USER_ID, "member");
            expect((await listRoles()).status).toBe(403);
        });

        it("returns 403 when caller has no roles", async () => {
            expect((await listRoles()).status).toBe(403);
        });
    });

    describe("unauthenticated", () => {
        it("returns 401 when there is no session", async () => {
            const res = await request(getApp()).get("/api/users/roles");
            expect(res.status).toBe(401);
        });
    });
});

describe("PATCH /api/users/:userId — role enforcement (integration)", () => {
    describe("allowed roles", () => {
        it("returns 200 when caller has admin role", async () => {
            await assignRole(ACTING_USER_ID, "admin");
            expect((await patchUser()).status).toBe(200);
        });

        it("returns 200 when caller has owner role", async () => {
            await assignRole(ACTING_USER_ID, "owner");
            expect((await patchUser()).status).toBe(200);
        });
    });

    describe("blocked roles", () => {
        it("returns 403 when caller has relationship-manager role", async () => {
            await assignRole(ACTING_USER_ID, "relationship-manager");
            expect((await patchUser()).status).toBe(403);
        });

        it("returns 403 when caller has member role", async () => {
            await assignRole(ACTING_USER_ID, "member");
            expect((await patchUser()).status).toBe(403);
        });

        it("returns 403 when caller has no roles", async () => {
            expect((await patchUser()).status).toBe(403);
        });
    });

    describe("unauthenticated", () => {
        it("returns 401 when there is no session", async () => {
            const res = await request(getApp()).patch(`/api/users/${TARGET_USER_ID}`);
            expect(res.status).toBe(401);
        });
    });
});

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
            const res = await request(getApp()).delete(`/api/users/${TARGET_USER_ID}`);
            expect(res.status).toBe(401);
        });
    });
});
