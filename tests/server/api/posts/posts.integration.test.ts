import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { setupIntegrationUsers } from "../../../helpers/setup";
import { assignRole, assignSubscription, getTestDb } from "../../../helpers/db";
import { posts } from "@database/schemas/vendors.schema";

// ── Test user IDs ──────────────────────────────────────────────────────────
const ACTING_USER_ID = "00000000-0000-0000-0000-000000000020";
const POST_OWNER_ID  = "00000000-0000-0000-0000-000000000021";

// Seeds both users, clears ACTING_USER_ID roles + subscription before each test.
const { getApp } = setupIntegrationUsers(ACTING_USER_ID, POST_OWNER_ID);

let seededPostId: string;

beforeAll(async () => {
    const db = getTestDb();

    // POST_OWNER_ID needs a role to pass requireSub on POST (used later).
    await assignRole(POST_OWNER_ID, "member");

    // Seed one post so PUT/DELETE permission tests have a target.
    const [post] = await db
        .insert(posts)
        .values({ userId: POST_OWNER_ID, title: "Seed post", content: "For permission tests." })
        .returning();
    seededPostId = post.id;
});

// ── GET /api/posts — public ────────────────────────────────────────────────

describe("GET /api/posts", () => {
    it("returns 200 with no authentication", async () => {
        const res = await request(getApp()).get("/api/posts");
        expect(res.status).toBe(200);
    });
});

// ── GET /api/posts/:postId — public ───────────────────────────────────────

describe("GET /api/posts/:postId", () => {
    it("returns 200 with no authentication", async () => {
        const res = await request(getApp()).get(`/api/posts/${seededPostId}`);
        expect(res.status).toBe(200);
    });
});

// ── POST /api/posts — subscription / role required ────────────────────────

describe("POST /api/posts", () => {
    it("returns 401 when unauthenticated", async () => {
        const res = await request(getApp())
            .post("/api/posts")
            .send({ title: "t", content: "c" });
        expect(res.status).toBe(401);
    });

    it("returns 403 when caller has no role or subscription", async () => {
        const res = await request(getApp())
            .post("/api/posts")
            .set("x-test-user-id", ACTING_USER_ID)
            .send({ title: "t", content: "c" });
        expect(res.status).toBe(403);
    });

    it("returns 403 when caller has basic subscription", async () => {
        await assignSubscription(ACTING_USER_ID, "basic");
        const res = await request(getApp())
            .post("/api/posts")
            .set("x-test-user-id", ACTING_USER_ID)
            .send({ title: "t", content: "c" });
        expect(res.status).toBe(403);
    });

    it("returns 201 when caller has pro subscription", async () => {
        await assignSubscription(ACTING_USER_ID, "pro");
        const res = await request(getApp())
            .post("/api/posts")
            .set("x-test-user-id", ACTING_USER_ID)
            .send({ title: "t", content: "c" });
        expect(res.status).toBe(201);
    });

    it("returns 201 when caller has member role", async () => {
        await assignRole(ACTING_USER_ID, "member");
        const res = await request(getApp())
            .post("/api/posts")
            .set("x-test-user-id", ACTING_USER_ID)
            .send({ title: "t", content: "c" });
        expect(res.status).toBe(201);
    });

    it("returns 201 when caller has admin role", async () => {
        await assignRole(ACTING_USER_ID, "admin");
        const res = await request(getApp())
            .post("/api/posts")
            .set("x-test-user-id", ACTING_USER_ID)
            .send({ title: "t", content: "c" });
        expect(res.status).toBe(201);
    });
});

// ── PUT /api/posts/:postId — must be logged in; owner or admin/owner role ──

describe("PUT /api/posts/:postId", () => {
    it("returns 401 when unauthenticated", async () => {
        const res = await request(getApp())
            .put(`/api/posts/${seededPostId}`)
            .send({ content: "x" });
        expect(res.status).toBe(401);
    });

    it("returns 403 when caller is not the owner and has no privileged role", async () => {
        const res = await request(getApp())
            .put(`/api/posts/${seededPostId}`)
            .set("x-test-user-id", ACTING_USER_ID)
            .send({ content: "x" });
        expect(res.status).toBe(403);
    });

    it("returns 200 when caller has owner role", async () => {
        await assignRole(ACTING_USER_ID, "owner");
        const res = await request(getApp())
            .put(`/api/posts/${seededPostId}`)
            .set("x-test-user-id", ACTING_USER_ID)
            .send({ content: "x" });
        expect(res.status).toBe(200);
    });

    it("returns 200 when caller is the post owner", async () => {
        const res = await request(getApp())
            .put(`/api/posts/${seededPostId}`)
            .set("x-test-user-id", POST_OWNER_ID)
            .send({ content: "x" });
        expect(res.status).toBe(200);
    });
});

// ── DELETE /api/posts/:postId — must be logged in; owner or admin/owner role

describe("DELETE /api/posts/:postId", () => {
    it("returns 401 when unauthenticated", async () => {
        const res = await request(getApp()).delete(`/api/posts/${seededPostId}`);
        expect(res.status).toBe(401);
    });

    it("returns 403 when caller is not the owner and has no privileged role", async () => {
        const res = await request(getApp())
            .delete(`/api/posts/${seededPostId}`)
            .set("x-test-user-id", ACTING_USER_ID);
        expect(res.status).toBe(403);
    });

    // Privileged delete — run last since it removes the seeded post.
    it("returns 200 when caller has owner role", async () => {
        await assignRole(ACTING_USER_ID, "owner");
        const res = await request(getApp())
            .delete(`/api/posts/${seededPostId}`)
            .set("x-test-user-id", ACTING_USER_ID);
        expect(res.status).toBe(200);
    });
});
