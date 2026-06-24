---
description: Detect drift between the codebase (schema, routes, filenames, rule-ID registry) and the .claude docs
argument-hint: ""
allowed-tools: Bash(grep:*), Bash(ls:*), Bash(git:*), Read, Grep, Glob
---

# /doc-drift — Documentation drift check

You verify that the `.claude` reference files still match the actual code. Source code is the
source of truth; docs are stale if they disagree. Do NOT edit anything — report only.

## Step 1 — Collect ground truth from source

!`bash -c '
echo "===== ENUMS (database/schemas) ====="
grep -rEn "pgEnum\(" database/schemas/ || echo "(no pgEnum found)"
echo
echo "===== ROUTE MIDDLEWARE (server/routes) ====="
grep -rEn "router\.(get|post|put|patch|delete)\(|requireAuth|requireRole|requireSub|requireMastermind" server/routes/ || true
echo
echo "===== ACTUAL DOC FILES ====="
ls -1 .claude/docs/ .claude/docs/features/ 2>/dev/null
echo
echo "===== ACTUAL STANDARDS FILES ====="
ls -1 .claude/docs/standards/ 2>/dev/null
echo
echo "===== ACTUAL COMMAND FILES ====="
ls -1 .claude/commands/ 2>/dev/null
echo
echo "===== ACTUAL AGENT FILES ====="
ls -1 .claude/agents/ 2>/dev/null
'`

## Step 2 — Cross-check against the docs

Read `.claude/docs/database.md`, `api.md`, `access-control.md`, `apps.md`, `agent-updater.md`,
`CLAUDE.md`, the standards files under `.claude/docs/standards/`, and the command files under
`.claude/commands/`. Compare against Step 1 and report any mismatch in these categories:

1. **Enums** — every enum value in the schema (Step 1) must match `database.md` Enums table AND
   every place the enum is listed in `api.md` / `apps.md`. Flag missing or extra values.
   Known canonical sets to confirm: `deal_type` = wholesale/agent/sold/reo;
   `notification_type` = mention/channel_mention/announcement/deal_bid;
   reaction emoji = 👍 👎 😀 😢 😂 ✅ (no ❤️).

2. **Route auth** — the middleware on each route in `server/routes` (Step 1) must match that
   route's row in `access-control.md` AND its `Auth` line in `api.md`. `access-control.md` is
   canonical; if `api.md` disagrees, `api.md` is the one to fix.

3. **Filenames** — every doc / standard / command / agent path referenced anywhere (CLAUDE.md
   References + Requirements, `agent-updater.md`'s registry, and each command file's
   `@`-references and `allowed-tools` script paths) must exist in Step 1's listing. Flag a
   reference to a missing file, and any real file referenced nowhere. Known drift to confirm is
   resolved:
   - `.claude/docs/code-standards.md` — **deleted** (split into
     `standards/typescript.md` + `react.md` + `express.md`). CLAUDE.md Requirement #5 and any
     other reference to it are stale.
   - `.claude/docs/testing.md` — **moved** to `.claude/docs/standards/testing.md`. CLAUDE.md's
     References list and Requirement #8 must point to the `standards/` path, not `docs/`.
   - Any reference to old per-app docs (`data.md` / `deals.md` / `vendors.md`) or `optimizer.md`.

4. **Rule-ID registry** — every standards file that owns a rule-ID prefix must be registered in
   both places that consume it. Confirm each of `TS.*` (typescript.md), `RX.*` (react.md),
   `EX.*`/`DB.*` (express.md), and `TST.*` (testing.md) is:
   (a) listed in `CLAUDE.md`'s **Coding Style** section, and
   (b) present in `/smell`'s **Step 4 stack catalog**.
   Flag any standard that owns IDs but is missing from either — e.g. `testing.md`/`TST.*` absent
   from Coding Style or from the smell catalog means `/smell` will never cite a testing rule.

## Step 3 — Report

Emit exactly:

````markdown
# Doc Drift Report
## Enum drift
- <doc> — <enum>: <discrepancy>   (or "none")
## Route auth drift
- <route> — <doc> says X, code says Y   (or "none")
## Filename drift
- <reference in doc> → file does not exist   /   <real file> → referenced nowhere   (or "none")
## Rule-ID registry drift
- <standard / prefix> → missing from <CLAUDE.md Coding Style | /smell catalog>   (or "none")
## Summary
<one line: clean, or N drifts found — which docs to fix>
````

If everything matches, say "No drift detected." Do not edit files.