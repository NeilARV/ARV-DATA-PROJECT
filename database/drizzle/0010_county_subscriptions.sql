-- County-grained subscriptions (issue #113) — additive migration, added alongside the still-live
-- user_msa_subscriptions. Apply directly (scripts/apply-0010.ts); do NOT db:push (push wants to
-- truncate market_scan_queue — known unrelated drift). Idempotent (IF NOT EXISTS + guarded FKs) so
-- it is safe to re-run. msa_id is denormalized (derivable from county via COUNTY_TO_MSA) so per-MSA
-- email queries stay a single-column filter.

CREATE TABLE IF NOT EXISTS "user_county_subscriptions" (
	"user_id" uuid NOT NULL,
	"county" text NOT NULL,
	"state" text NOT NULL,
	"msa_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "user_county_subscriptions_user_id_county_state_pk" PRIMARY KEY("user_id","county","state")
);
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_county_subscriptions_user_id_users_id_fk') THEN
		ALTER TABLE "user_county_subscriptions" ADD CONSTRAINT "user_county_subscriptions_user_id_users_id_fk"
			FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_county_subscriptions_msa_id_msas_id_fk') THEN
		ALTER TABLE "user_county_subscriptions" ADD CONSTRAINT "user_county_subscriptions_msa_id_msas_id_fk"
			FOREIGN KEY ("msa_id") REFERENCES "public"."msas"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
