# Testing Guide for Claude Code

## When this file applies
Read this before writing, editing, or generating any test. When you create a
new API route, the "Mandatory baseline" section is NOT optional.

---

## Default behavior (IMPORTANT)
- Write ONLY the tests described in "Mandatory baseline" by default.
- Do NOT write business-logic, edge-case, or error-path tests unless I
  explicitly ask. Wait for me to request them by name.
- After writing the baseline, list which additional test categories are
  available (see "On-request test menu") so I can pick.

---

## Mandatory baseline: new API routes
Every new API route MUST get integration tests covering:
1. **Role enforcement** — who is allowed vs. blocked
2. **Input validation** — bad-request (400) cases for the request body/params

### Role dimensions
Roles (applied via `requireRole` middleware):
- `none` — no role assigned (authenticated but no role)
- `member`
- `relationship-manager`
- `admin`
- `owner`

Subscription tiers (applied via `requireSub` middleware) — only test if the
route uses `requireSub`:
- `none` — no subscription
- `basic`
- `pro`
- `premium`

### What to assert for role tests
For each new route, ask me which roles/tiers are allowed. Then test:
- Each **allowed** role/tier → expect `2xx` success
- The **boundary roles just below** the allowed threshold → expect `403`
- One **unauthenticated** case (no `x-test-user-id` header) → expect `401`

Do not blindly test all role combinations. Test the allowed roles, the
boundary blocked roles, and one unauthenticated case.

If I haven't told you the access rules for the route, **ASK before generating**.

### What to assert for validation tests
For each field in the request body/params that is validated:
- Missing required field → expect `400`
- Wrong type (e.g. string where number expected) → expect `400`
- Out-of-range value if the schema enforces min/max → expect `400`

---

## On-request test menu
Only write these when I explicitly ask:
- `business` — business-logic / state-change correctness
- `edge`     — empty, null, boundary, large-input cases
- `errors`   — downstream failures, DB errors, external API timeouts
- `unit`     — pure function unit tests (no HTTP layer)

---

## How to run tests
```
npm run test                  # unit tests only (excludes *.integration.test.ts)
npm run test:watch            # unit tests in watch mode
npm run test:integration      # integration tests only (requires .env.test)
npm run test:all              # unit + integration sequentially
```

Run a single file:
```
npx vitest run tests/server/api/users/users.integration.test.ts
```

Integration tests require a `.env.test` file with `TEST_DATABASE_URL` pointing
to your Neon test branch. The app reads this file automatically via
`vitest.integration.config.ts`.

---

## Conventions

### Framework & location
- **Vitest** — `describe` / `it` / `expect`
- **Supertest** — HTTP assertions
- Unit tests: `tests/server/**/*.test.ts` (anything not ending in `.integration.test.ts`)
- Integration tests: `tests/server/**/*.integration.test.ts`
- Follow the folder structure under `tests/server/api/<resource>/`:
  - `<resource>.integration.test.ts` — routes at `/api/<resource>` and `/api/<resource>/:id`
  - `<sub-resource>.integration.test.ts` — routes nested deeper (e.g. `/api/<resource>/:id/sub`)

### Folder Structure
```
tests/
├── client/                        # Frontend tests (structure reserved; not yet populated)
└── server/
    └── api/                       # API route tests, grouped by resource
        ├── auth/
        ├── admin/
        ├── users/
        │   ├── users.test.ts          # Routes directly under /api/users (e.g. GET /api/users, DELETE /api/users/:userId)
        │   └── subscriptions.test.ts  # Sub-resource routes (e.g. GET /api/users/:userId/subscription-tier)
        ├── properties/
        ├── companies/
        ├── geocoding/
        ├── deals/
        └── contact/
```

### Test naming
```
METHOD /route — <role/tier> — <expected outcome>
```
Examples:
```
GET /api/users — admin role — returns 200
GET /api/users — no role — returns 403
GET /api/users — unauthenticated — returns 401
POST /api/deals — missing required field "type" — returns 400
```

### Auth setup pattern
Use `setupIntegrationUsers` from `tests/helpers/setup.ts`. Each integration
test file must use **unique UUIDs** to avoid conflicts when files run in parallel.

```ts
import { setupIntegrationUsers } from "../../../helpers/setup";
import { assignRole, assignSubscription } from "../../../helpers/db";

const ACTING_USER_ID = "00000000-0000-0000-0000-<unique-suffix>";
const TARGET_USER_ID = "00000000-0000-0000-0000-<unique-suffix>";

const { getApp } = setupIntegrationUsers(ACTING_USER_ID, TARGET_USER_ID);
```

`setupIntegrationUsers` automatically:
- Seeds both users in `beforeAll`
- Removes `ACTING_USER_ID`'s roles and subscription before each test
- Deletes both users in `afterAll`

To simulate a logged-in user, set the `x-test-user-id` header — no real login
flow is needed:
```ts
request(getApp())
    .get("/api/users")
    .set("x-test-user-id", ACTING_USER_ID);
```

### Available db helpers (`tests/helpers/db.ts`)
```ts
seedTestUser(id)                     // insert a bare user row
deleteTestUser(id)                   // delete user + cascade
assignRole(userId, roleName)         // grant a role (e.g. "admin", "owner", "member")
removeAllRoles(userId)               // strip all roles
assignSubscription(userId, tierName) // set subscription (e.g. "basic", "pro")
removeSubscription(userId)           // clear subscription
getTestDb()                          // raw Drizzle instance for seeding related data
```

### Mocking controllers vs. real DB
- **Role/auth tests**: mock the route's controller with `vi.mock(...)` so tests
  never perform real destructive operations, but let `requireRole` run real DB
  queries against the test branch. This ensures that changing the middleware
  will correctly break the test.
- **Business/ownership tests** (e.g. deals): seed real data via `getTestDb()`
  and let the service logic run; mock only external API calls or utilities that
  have external side-effects (e.g. `resolveMsaId`).

### Example: role enforcement file skeleton
```ts
import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { setupIntegrationUsers } from "../../../helpers/setup";
import { assignRole } from "../../../helpers/db";

vi.mock("server/controllers/<resource>", () => ({
    <Resource>Controller: {
        <handler>: vi.fn((_req, res) => res.status(200).json({})),
    },
}));

const ACTING_USER_ID = "00000000-0000-0000-0000-<unique>";
const TARGET_USER_ID = "00000000-0000-0000-0000-<unique>";
const { getApp } = setupIntegrationUsers(ACTING_USER_ID, TARGET_USER_ID);

describe("GET /api/<resource> — role enforcement (integration)", () => {
    describe("allowed roles", () => {
        it("returns 200 when caller has admin role", async () => {
            await assignRole(ACTING_USER_ID, "admin");
            const res = await request(getApp())
                .get("/api/<resource>")
                .set("x-test-user-id", ACTING_USER_ID);
            expect(res.status).toBe(200);
        });
    });

    describe("blocked roles", () => {
        it("returns 403 when caller has no roles", async () => {
            const res = await request(getApp())
                .get("/api/<resource>")
                .set("x-test-user-id", ACTING_USER_ID);
            expect(res.status).toBe(403);
        });
    });

    describe("unauthenticated", () => {
        it("returns 401 when there is no session", async () => {
            const res = await request(getApp()).get("/api/<resource>");
            expect(res.status).toBe(401);
        });
    });
});
```
