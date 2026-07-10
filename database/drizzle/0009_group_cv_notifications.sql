-- Per-group code-violation notification approval gate — additive migration. Apply directly;
-- do NOT db:push (push wants to truncate market_scan_queue — known unrelated drift). Idempotent
-- (IF NOT EXISTS) so it is safe to re-run. Default false; see features/cv.md §6.3 for the gate.

ALTER TABLE "company_groups"
	ADD COLUMN IF NOT EXISTS "code_violation_notifications_enabled" boolean DEFAULT false NOT NULL;
