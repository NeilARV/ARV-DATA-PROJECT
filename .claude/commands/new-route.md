---
description: Scaffold a new API route across all docs and tests (the full ceremony)
argument-hint: "<resource> <METHOD> <path>   e.g. deals POST /api/deals/:id/favorite"
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(grep:*)
---

# /new-route — Add an API route end to end

Arguments: `$ARGUMENTS` (resource, HTTP method, path).

Follow the maintenance rule in `access-control.md` §7: **docs first, then code, then tests.**
Do each step in order; pause for my confirmation of the access rule before writing tests.

## Step 1 — Confirm the access rule
State the proposed middleware (`requireAuth` / `requireRole([...])` / `requireSub([...], {bypassRoles})` /
`requireMastermind`) and the expected status codes. **Ask me to confirm before continuing** —
the access rule drives everything downstream.

## Step 2 — access-control.md (canonical, first)
Add the route to the correct §5.x permission table with the per-role/tier outcome columns.
If it's a new resource, add a new sub-section.

## Step 3 — api.md
Add the full route entry: method, path, **Auth** summary line (matching Step 2),
request body/params, response shape(s), and error codes. Follow the formatting of neighboring
routes in the same section.

## Step 4 — apps.md
Add the route to the relevant app's API Surface table and, if it changes behavior, the
Access Control table.

## Step 5 — Tests (per testing.md mandatory baseline)
Read `testing.md`. Generate the integration test file under `tests/server/api/<resource>/`
with: each allowed role/tier → 2xx; a blocked role → 403; unauthenticated → 401; for
`requireSub`, a bypass-role-no-subscription → 2xx; plus 400 validation cases for each validated
field. Use `setupIntegrationUsers`, unique UUIDs, and the `x-test-user-id` header.

## Step 6 — Summary
List every file you created/edited and what was added. Remind me to run `npm run check`.
Do NOT write the controller/service/route implementation unless I ask — this command owns the
docs + tests scaffold.