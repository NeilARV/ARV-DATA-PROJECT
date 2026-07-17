// One-off applier for migration 0012 (creates email_subscription_list_counties + backfills one
// row per county of each entry's MSA, issue #131). db:push aborts on the market_scan_queue drift,
// so this applies the additive, idempotent DDL + backfill directly. The backfill VALUES are
// derived from the canonical COUNTY_TO_MSA map at run time; the .sql file records the snapshot.
// Targets are chosen by env-var NAME (never printed): TEST_DATABASE_URL and/or DATABASE_URL.
// Constraint names match the explicit names in msas.schema.ts so a future db:push sees them
// as already-present. Usage: tsx scripts/apply-0012.ts test|dev|both
import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { getTrackedCounties } from '@shared/constants/countyToMsa';

dotenv.config(); // .env -> DATABASE_URL
dotenv.config({ path: '.env.test' }); // .env.test -> TEST_DATABASE_URL

const quote = (value: string): string => `'${value.replace(/'/g, "''")}'`;

const COUNTY_VALUES = getTrackedCounties()
    .map(({ county, state, msaName }) => `(${quote(county)}, ${quote(state)}, ${quote(msaName)})`)
    .join(',\n        ');

const STATEMENTS = [
    `CREATE TABLE IF NOT EXISTS "email_subscription_list_counties" (
        "subscription_list_id" bigint NOT NULL,
        "county" text NOT NULL,
        "state" text NOT NULL,
        "msa_id" integer NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now(),
        CONSTRAINT "email_subscription_list_counties_list_id_county_state_pk" PRIMARY KEY("subscription_list_id","county","state")
    )`,
    // Postgres has no IF NOT EXISTS for ADD CONSTRAINT, so guard each FK on pg_constraint.
    `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_subscription_list_counties_list_id_fk') THEN
            ALTER TABLE "email_subscription_list_counties" ADD CONSTRAINT "email_subscription_list_counties_list_id_fk"
                FOREIGN KEY ("subscription_list_id") REFERENCES "public"."email_subscription_list"("id") ON DELETE cascade ON UPDATE no action;
        END IF;
    END $$`,
    `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_subscription_list_counties_msa_id_msas_id_fk') THEN
            ALTER TABLE "email_subscription_list_counties" ADD CONSTRAINT "email_subscription_list_counties_msa_id_msas_id_fk"
                FOREIGN KEY ("msa_id") REFERENCES "public"."msas"("id") ON DELETE cascade ON UPDATE no action;
        END IF;
    END $$`,
    `INSERT INTO "email_subscription_list_counties" ("subscription_list_id", "county", "state", "msa_id")
    SELECT esl."id", v.county, v.state, esl."msa"
    FROM "email_subscription_list" esl
    JOIN "msas" m ON m."id" = esl."msa"
    JOIN (VALUES
        ${COUNTY_VALUES}
    ) AS v(county, state, msa_name) ON v.msa_name = m."name"
    ON CONFLICT DO NOTHING`,
];

const countsByMsa = new Map<string, number>();
for (const { msaName } of getTrackedCounties()) {
    countsByMsa.set(msaName, (countsByMsa.get(msaName) ?? 0) + 1);
}
const EXPECTED_COUNT_VALUES = Array.from(countsByMsa)
    .map(([msaName, expected]) => `(${quote(msaName)}, ${expected})`)
    .join(',\n        ');

// Verifies the acceptance criterion: every entry with an MSA has exactly the full county set
// of that MSA (per the canonical map) in the child table.
const VERIFY_SQL = `
    SELECT
        count(*)::int AS entries_with_msa,
        count(*) FILTER (
            WHERE (SELECT count(*) FROM "email_subscription_list_counties" c
                   WHERE c."subscription_list_id" = esl."id") = e.expected
        )::int AS entries_fully_seeded
    FROM "email_subscription_list" esl
    JOIN "msas" m ON m."id" = esl."msa"
    JOIN (VALUES
        ${EXPECTED_COUNT_VALUES}
    ) AS e(msa_name, expected) ON e.msa_name = m."name"
`;

async function applyTo(label: string, url: string | undefined): Promise<void> {
    if (!url) {
        console.error(`  ✗ ${label}: env var not set — skipped`);
        return;
    }
    const sql = neon(url);
    for (const statement of STATEMENTS) {
        await sql(statement);
    }
    const [{ entries_with_msa, entries_fully_seeded }] = (await sql(VERIFY_SQL)) as {
        entries_with_msa: number;
        entries_fully_seeded: number;
    }[];
    const ok = entries_fully_seeded === entries_with_msa;
    console.log(
        `  ${ok ? '✓' : '✗'} ${label}: ${entries_fully_seeded}/${entries_with_msa} MSA entries carry their full county set`,
    );
}

async function main(): Promise<void> {
    const target = process.argv[2] ?? 'both';
    console.log(`Applying migration 0012 to: ${target}`);
    if (target === 'test' || target === 'both') {
        await applyTo('TEST_DATABASE_URL (test branch)', process.env.TEST_DATABASE_URL);
    }
    if (target === 'dev' || target === 'both') {
        await applyTo('DATABASE_URL (feature branch)', process.env.DATABASE_URL);
    }
    console.log('Done.');
}

main();
