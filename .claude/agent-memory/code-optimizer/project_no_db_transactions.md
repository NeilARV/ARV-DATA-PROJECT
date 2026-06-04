---
name: no-db-transactions
description: As of 2026-06-04 no server service uses db.transaction; multi-write flows are non-atomic
metadata:
  type: project
---

No service under `server/` uses `db.transaction(...)` — a grep across the server directory returned zero matches as of 2026-06-04. Multi-statement write flows (e.g. the company-claiming `reviewClaim` approve/dispute path that deletes all `company_members` then inserts a new owner) run as separate untransacted statements.

**Why:** Observed during review of the company-claiming feature. The dispute-approval delete-then-insert is a data-loss path under concurrency or partial failure precisely because nothing wraps it in a transaction.

**How to apply:** When recommending `db.transaction` for a new multi-write flow, note that it is a NEW pattern for this repo, not an existing convention — so the author may need a helper/example. When reviewing any read-check-then-write or destructive delete+insert sequence here, flag the missing transaction as a real risk rather than assuming an ambient one exists. Related: [[testing-setup]].
