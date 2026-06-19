---
description: Detect drift between the codebase (schema, routes, filenames) and the .claude docs
argument-hint: ""
allowed-tools: Bash(grep:*), Bash(ls:*), Bash(git:*), Read, Grep, Glob
---

# /doc-drift — Documentation drift check

You verify that the `.claude/docs` reference files still match the actual code. Source code is
the source of truth; docs are stale if they disagree. Do NOT edit anything — report only.

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
echo "===== ACTUAL AGENT FILES ====="
ls -1 .claude/agents/ 2>/dev/null
'`

## Step 2 — Cross-check against the docs

Read `.claude/docs/database.md`, `api.md`, `access-control.md`, `apps.md`, `agent-updater.md`,
and `CLAUDE.md`. Compare against Step 1 and report any mismatch in these categories:

1. **Enums** — every enum value in the schema (Step 1) must match `database.md` Enums table AND
   every place the enum is listed in `api.md` / `apps.md`. Flag missing or extra values.
   Known canonical sets to confirm: `deal_type` = wholesale/agent/sold/reo;
   `notification_type` = mention/channel_mention/announcement/deal_bid;
   reaction emoji = 👍 👎 😀 😢 😂 ✅ (no ❤️).
2. **Route auth** — the middleware on each route in `server/routes` (Step 1) must match that
   route's row in `access-control.md` AND its `Auth` line in `api.md`. `access-control.md` is
   canonical; if `api.md` disagrees, `api.md` is the one to fix.
3. **Filenames** — every doc/agent path referenced in `agent-updater.md`'s registry and in
   `CLAUDE.md`'s References must exist in Step 1's file listing. Flag references to missing files
   (e.g. `optimizer.md`, `data.md`/`deals.md`/`vendors.md`,
   `mastermind.md`, `features/email-settings.md`) and any real file not in the registry.

## Step 3 — Report

Emit exactly:

````markdown
# Doc Drift Report
## Enum drift
- <doc> — <enum>: <discrepancy>   (or "none")
## Route auth drift
- <route> — <doc> says X, code says Y
## Filename drift
- <reference in doc> → file does not exist   /   <real file> → not in registry
## Summary
<one line: clean, or N drifts found — which docs to fix>
````

If everything matches, say "No drift detected." Do not edit files.