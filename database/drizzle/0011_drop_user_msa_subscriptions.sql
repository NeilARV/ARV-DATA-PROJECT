-- Contract cleanup (issue #118) — drops user_msa_subscriptions now that county subscriptions
-- (user_county_subscriptions, issues #113–#117) own every consumer. Apply directly
-- (scripts/apply-0011.ts); do NOT db:push (push wants to truncate market_scan_queue — known
-- unrelated drift). Idempotent (IF EXISTS) so it is safe to re-run.

DROP TABLE IF EXISTS "user_msa_subscriptions" CASCADE;
