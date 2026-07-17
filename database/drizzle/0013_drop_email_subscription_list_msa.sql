-- Contract cleanup (issue #136) — drops email_subscription_list.msa now that county rows
-- (email_subscription_list_counties, issues #131–#135) own every consumer. Apply directly
-- (scripts/apply-0013.ts); do NOT db:push (push wants to truncate market_scan_queue — known
-- unrelated drift). Idempotent (IF EXISTS) so it is safe to re-run.

ALTER TABLE "email_subscription_list" DROP COLUMN IF EXISTS "msa";
