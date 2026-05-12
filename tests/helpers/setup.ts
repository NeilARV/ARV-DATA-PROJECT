import { createApp } from "../../server/app";
import { MemoryStore } from "express-session";
import { beforeAll, afterAll, beforeEach } from "vitest";
import type { Express } from "express";
import { seedTestUser, deleteTestUser, removeAllRoles, removeSubscription } from "./db";

// Returns a fully configured Express app for use in tests.
// Uses an in-memory session store and a test middleware that reads the
// x-test-user-id request header to inject a session userId, simulating
// a logged-in user without a real login flow.
export function createTestApp(): Express {
    return createApp({
        sessionStore: new MemoryStore(),
        testMiddleware: (req, _res, next) => {
            const userId = req.headers["x-test-user-id"] as string | undefined;
            if (userId) req.session.userId = userId;
            next();
        },
    });
}

// Registers beforeAll/afterAll/beforeEach hooks for integration test files
// that need two seeded users. Each file should pass unique UUIDs to avoid
// conflicts when test files run concurrently.
//
// Returns getApp() so the test file can access the Express instance after
// beforeAll has run.
export function setupIntegrationUsers(actingUserId: string, targetUserId: string) {
    let app: Express;

    beforeAll(async () => {
        app = createTestApp();
        await deleteTestUser(actingUserId);
        await deleteTestUser(targetUserId);
        await seedTestUser(actingUserId);
        await seedTestUser(targetUserId);
    });

    afterAll(async () => {
        await deleteTestUser(actingUserId);
        await deleteTestUser(targetUserId);
    });

    beforeEach(async () => {
        await removeAllRoles(actingUserId);
        await removeSubscription(actingUserId);
    });

    return { getApp: () => app };
}
