-- County-grained whitelist subscriptions (issue #131) — expand half of an expand–contract:
-- email_subscription_list_counties mirrors user_county_subscriptions keyed by whitelist entry,
-- and the parent's msa column stays live until every consumer migrates (the contract ticket
-- drops it). Apply directly (scripts/apply-0012.ts); do NOT db:push (push wants to truncate
-- market_scan_queue — known unrelated drift). Idempotent (IF NOT EXISTS + guarded FKs +
-- ON CONFLICT DO NOTHING) so it is safe to re-run. msa_id is denormalized (derivable from
-- county via COUNTY_TO_MSA) so per-MSA email queries stay a single-column filter. PK/parent-FK
-- constraint names are explicit because the drizzle-generated ones exceed Postgres's 63-char
-- identifier limit.

CREATE TABLE IF NOT EXISTS "email_subscription_list_counties" (
	"subscription_list_id" bigint NOT NULL,
	"county" text NOT NULL,
	"state" text NOT NULL,
	"msa_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "email_subscription_list_counties_list_id_county_state_pk" PRIMARY KEY("subscription_list_id","county","state")
);
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_subscription_list_counties_list_id_fk') THEN
		ALTER TABLE "email_subscription_list_counties" ADD CONSTRAINT "email_subscription_list_counties_list_id_fk"
			FOREIGN KEY ("subscription_list_id") REFERENCES "public"."email_subscription_list"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_subscription_list_counties_msa_id_msas_id_fk') THEN
		ALTER TABLE "email_subscription_list_counties" ADD CONSTRAINT "email_subscription_list_counties_msa_id_msas_id_fk"
			FOREIGN KEY ("msa_id") REFERENCES "public"."msas"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
-- Backfill: expand every existing MSA-level entry into one child row per county of its MSA —
-- zero coverage loss, identical semantics to the #113 user-subscription backfill. The VALUES
-- list is the COUNTY_TO_MSA map (shared/constants/countyToMsa.ts) as of this migration;
-- scripts/apply-0012.ts derives it from the canonical map at run time.
INSERT INTO "email_subscription_list_counties" ("subscription_list_id", "county", "state", "msa_id")
SELECT esl."id", v.county, v.state, esl."msa"
FROM "email_subscription_list" esl
JOIN "msas" m ON m."id" = esl."msa"
JOIN (VALUES
	('San Diego', 'CA', 'San Diego-Chula Vista-Carlsbad, CA'),
	('Los Angeles', 'CA', 'Los Angeles-Long Beach-Anaheim, CA'),
	('Orange', 'CA', 'Los Angeles-Long Beach-Anaheim, CA'),
	('Riverside', 'CA', 'Riverside-San Bernardino-Ontario, CA'),
	('San Bernardino', 'CA', 'Riverside-San Bernardino-Ontario, CA'),
	('Denver', 'CO', 'Denver-Aurora-Centennial, CO'),
	('Adams', 'CO', 'Denver-Aurora-Centennial, CO'),
	('Arapahoe', 'CO', 'Denver-Aurora-Centennial, CO'),
	('Broomfield', 'CO', 'Denver-Aurora-Centennial, CO'),
	('Jefferson', 'CO', 'Denver-Aurora-Centennial, CO'),
	('Douglas', 'CO', 'Denver-Aurora-Centennial, CO'),
	('Clear Creek', 'CO', 'Denver-Aurora-Centennial, CO'),
	('Gilpin', 'CO', 'Denver-Aurora-Centennial, CO'),
	('Elbert', 'CO', 'Denver-Aurora-Centennial, CO'),
	('Park', 'CO', 'Denver-Aurora-Centennial, CO'),
	('San Francisco', 'CA', 'San Francisco-Oakland-Fremont, CA'),
	('Alameda', 'CA', 'San Francisco-Oakland-Fremont, CA'),
	('Contra Costa', 'CA', 'San Francisco-Oakland-Fremont, CA'),
	('Marin', 'CA', 'San Francisco-Oakland-Fremont, CA'),
	('San Mateo', 'CA', 'San Francisco-Oakland-Fremont, CA'),
	('Miami-Dade', 'FL', 'Miami-Fort Lauderdale-West Palm Beach, FL'),
	('Broward', 'FL', 'Miami-Fort Lauderdale-West Palm Beach, FL'),
	('Palm Beach', 'FL', 'Miami-Fort Lauderdale-West Palm Beach, FL'),
	('St. Lucie', 'FL', 'Port St. Lucie, FL'),
	('Martin', 'FL', 'Port St. Lucie, FL'),
	('King', 'WA', 'Seattle-Tacoma-Bellevue, WA'),
	('Pierce', 'WA', 'Seattle-Tacoma-Bellevue, WA'),
	('Snohomish', 'WA', 'Seattle-Tacoma-Bellevue, WA'),
	('Hillsborough', 'FL', 'Tampa-St. Petersburg-Clearwater, FL'),
	('Pinellas', 'FL', 'Tampa-St. Petersburg-Clearwater, FL'),
	('Pasco', 'FL', 'Tampa-St. Petersburg-Clearwater, FL'),
	('Hernando', 'FL', 'Tampa-St. Petersburg-Clearwater, FL')
) AS v(county, state, msa_name) ON v.msa_name = m."name"
ON CONFLICT DO NOTHING;
