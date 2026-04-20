import { createApp } from "../../server/app";
import { MemoryStore } from "express-session";
import type { Express } from "express";

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
