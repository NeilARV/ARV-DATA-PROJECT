---
description: Generate the tests a change needs to meet the testing standard (unit, integration, component), scoped to the current diff
argument-hint: "[target-branch | path]"
allowed-tools: Bash(npm run test:*), Bash(npm run test:integration:*), Bash(npx vitest:*), Read, Write, Edit, Glob, Grep
---

# /test — Test generation

You are generating the tests a change needs to satisfy `@.claude/docs/standards/testing.md`. Work the steps **in order**. Do not skip any. Generate tests **against the standard** and against `@.claude/docs/access-control.md` (the canonical permission source) — never invent access policy. Cite `TST.*` IDs verbatim. Write real, runnable tests only; never an assertion-free test (`TST.ASSERT-OUTCOME`).

This command is the procedural counterpart to the testing standard: the standard holds the rules, this command applies them to whatever was just built.

---

## Step 1 — Scope

The change surface has already been collected below (committed changes vs the target branch, plus the working tree). `$ARGUMENTS` is an optional target branch (default `main`) **or** a path to scope to.

!`bash -c 'target="${ARGUMENTS:-main}"; mb=$(git merge-base HEAD "$target" 2>/dev/null || echo HEAD); echo "### Changed vs $target (committed)"; git diff --name-status "$mb"...HEAD 2>/dev/null; echo; echo "### Working tree (staged + unstaged)"; git status --short'`

Read the **actual changed source files** before planning — do not infer their contents from the filenames. If the surface is empty, say so and stop.

---

## Step 2 — Classify by layer

For each changed **source** file (ignore test files, docs, config), assign exactly one layer bucket and state it in one line. The bucket determines which `TST.*` categories apply:

| Bucket (file shape) | Required categories |
|---|---|
| `*.routes.ts` + its controller | `TST.INT-ACCESS`, `TST.INT-VALIDATION` (+ ownership/state/error/side-effect if the service has them) |
| `*.services.ts` | `TST.INT-OWNERSHIP` / `TST.INT-STATE` / `TST.INT-ERROR` / `TST.INT-SIDE-EFFECT` (or `TST.UNIT-SERVICE` if it runs without a DB) |
| `server/middleware/*` | `TST.UNIT-MIDDLEWARE` |
| `database/validation/*`, inserts/updates schemas | `TST.UNIT-ZOD` |
| `shared/utils/*`, `server/utils/*`, `client/src/lib/*` | `TST.UNIT-PURE` / `TST.UNIT-FORMATTER` |
| `server/websocket/*` | `TST.WEBSOCKET` |
| `client/**/*.tsx` component | `TST.COMPONENT` |
| `client/**/use-*.ts(x)` hook | `TST.HOOK` |

State, in one sentence, whether the overall change is a **new feature**, a **change to existing behavior**, or a **presentational/refactor** change — this sets how much `TST.WHEN-APPLICABLE` applies.

---

## Step 3 — Inventory existing tests

Glob the test tree for files already covering the touched resources, so you **augment** rather than duplicate:

- `tests/server/api/<resource>/**` for routes/services
- `tests/server/{middleware,services,utils,validation}/**` for units
- `tests/client/**` for components/hooks

List, per changed unit: the existing test file (if any) and which categories it already covers. New tests go into the existing file when one exists for that resource.

---

## Step 4 — Plan (get approval before writing)

Produce a plan table. For each changed unit, list the tests you will add, split into:

- **Mandatory** (`TST.MANDATORY`) — Zod accept/reject, new-util unit, new-guard unit, new-route access+validation baseline. Always included when applicable.
- **When-applicable** (`TST.WHEN-APPLICABLE`) — ownership/state, error-path, component/hook — included **only** if the code carries that risk. Justify each inclusion or exclusion in a few words (e.g. "plain CRUD, no ownership → INT-OWNERSHIP N/A").

Each row cites its `TST.*` ID and names the concrete assertions. Pull each route's allowed/blocked roles from its row in `access-control.md` (§6 recipe for `TST.INT-ACCESS`).

**Hard stops — ask, don't guess:**
- A new route whose access rules are **not** in `access-control.md` → stop and ask (`TST.ASK-IF-UNKNOWN`).
- A category that needs **uninstalled tooling** (component/hook needs the jsdom project + RTL; any E2E needs Playwright) → list the exact deps/config and ask before proceeding; do not silently add dependencies.
- **E2E is never auto-generated** (`TST.E2E-THIN`) — only mention candidate smoke flows if asked.

Present the plan and wait for go-ahead before Step 5.

---

## Step 5 — Generate

Write the tests following the standard's conventions exactly:
- correct location mirroring the source tree (`TST.LOCATION`); integration files end `.integration.test.ts`
- unique per-file UUID suffixes (`TST.UNIQUE-UUID`)
- `setupIntegrationUsers` + `x-test-user-id`, `assignRole`/`assignSubscription` (`TST.SETUP-HELPER`)
- mock only the edge, never the unit under test; mock the controller but run the real guard for access tests (`TST.MOCK-THE-EDGE`, `TST.REAL-GATE`)
- naming `METHOD /route — <condition> — <outcome>` (`TST.NAME`)
- every test asserts an outcome (`TST.ASSERT-OUTCOME`)

Augment existing files in place; create new files only where none exists for the resource. Follow the model files named in the standard (`requireRole.test.ts`, `orderTransactions.test.ts`, the `tests/server/api/**` integration files) for structure.

---

## Step 6 — Run & verify

Run only the affected layer(s):
- units → `npm run test`
- routes/services → `npm run test:integration` (or a single file: `npx vitest run <path>`)
- both → `npm run test:all`

Fix failures and re-run. **Never weaken an assertion to make a test pass** — if the test is right and the code is wrong, report it as a found bug. Cap at ~3 fix iterations; if still red after that, stop and report the failure rather than thrashing.

---

## Step 7 — Report

Emit exactly this structure:

````markdown
# Test Report
**Scope:** `<target branch / path>` · **Change type:** `<feature|behavior-change|presentational>`

## Added
- `tests/.../X.integration.test.ts` — N tests (`TST.INT-ACCESS`, `TST.INT-VALIDATION`, …)

## Augmented
- `tests/.../Y.test.ts` — +M tests (`TST.UNIT-ZOD`)

## Skipped (with reason)
- `INT-OWNERSHIP` on `/api/foo` — plain CRUD, no ownership logic
- `COMPONENT` — presentational tweak only

## Needs your decision
- Access policy for `POST /api/bar` is not in access-control.md — cannot generate access tests
- Component tests require jsdom + RTL (not installed): `<deps>`

## Run result
- `npm run test:integration` — <pass/fail summary>
````

If nothing needs testing (e.g. docs-only diff), emit the structure with empty sections and one line: "No testable change in scope."

Begin now with Step 2.