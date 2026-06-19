---
description: Generate the mandatory baseline integration tests for an existing route
argument-hint: "<METHOD> <path>   e.g. PATCH /api/deals/:id"
allowed-tools: Read, Grep, Glob, Edit, Write
---

# /test-route — Baseline tests for a route

Argument: `$ARGUMENTS` (method + path).

## Step 1 — Look up the rule
Find the route's row in `access-control.md` (§5.x). Read its middleware chain and the
allowed/blocked columns. If the route isn't in the table, STOP and tell me — the table must be
updated first (per the maintenance rule).

## Step 2 — Read the conventions
Read `testing.md`: folder layout, `setupIntegrationUsers`, db helpers, the `x-test-user-id`
header pattern, naming (`METHOD /route — <role/tier> — <expected outcome>`), and the
mock-controller-but-real-middleware approach for role tests.

## Step 3 — Generate
Create or extend `tests/server/api/<resource>/<resource>.integration.test.ts` with:
- one test per **allowed** role/tier → `2xx`
- one **blocked** role → `403` (a role not in the allowed set; roles are membership-based, not
  hierarchical — pick the closest plausible one)
- one **unauthenticated** → `401`
- for `requireSub` routes: a **bypass-role user with no subscription** → `2xx`
- for ownership routes: a **non-owner authenticated** caller → `403`
- 400 validation cases for each validated body/param field (missing, wrong type, out of range)

Use unique UUIDs, `setupIntegrationUsers`, and the db helpers. Mock the controller for pure
role tests so middleware changes correctly break the test.

## Step 4 — Summary
Show the file path and list the test names generated. Remind me to run
`npm run test:integration`.