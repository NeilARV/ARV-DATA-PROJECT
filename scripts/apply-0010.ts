// One-off applier for migration 0010 (creates user_county_subscriptions, issue #113).
// db:push aborts on the market_scan_queue drift, so this applies the additive, idempotent DDL
// directly. Targets are chosen by env-var NAME (never printed): TEST_DATABASE_URL and/or DATABASE_URL.
// Constraint names match drizzle's convention so a future db:push sees them as already-present.
// Usage: tsx scripts/apply-0010.ts test|dev|both
import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';

dotenv.config(); // .env -> DATABASE_URL
dotenv.config({ path: '.env.test' }); // .env.test -> TEST_DATABASE_URL

const STATEMENTS = [
    `CREATE TABLE IF NOT EXISTS "user_county_subscriptions" (
        "user_id" uuid NOT NULL,
        "county" text NOT NULL,
        "state" text NOT NULL,
        "msa_id" integer NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now(),
        CONSTRAINT "user_county_subscriptions_user_id_county_state_pk" PRIMARY KEY("user_id","county","state")
    )`,
    // Postgres has no IF NOT EXISTS for ADD CONSTRAINT, so guard each FK on pg_constraint.
    `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_county_subscriptions_user_id_users_id_fk') THEN
            ALTER TABLE "user_county_subscriptions" ADD CONSTRAINT "user_county_subscriptions_user_id_users_id_fk"
                FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
        END IF;
    END $$`,
    `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_county_subscriptions_msa_id_msas_id_fk') THEN
            ALTER TABLE "user_county_subscriptions" ADD CONSTRAINT "user_county_subscriptions_msa_id_msas_id_fk"
                FOREIGN KEY ("msa_id") REFERENCES "public"."msas"("id") ON DELETE cascade ON UPDATE no action;
        END IF;
    END $$`,
];

async function applyTo(label: string, url: string | undefined): Promise<void> {
    if (!url) {
        console.error(`  ✗ ${label}: env var not set — skipped`);
        return;
    }
    const sql = neon(url);
    for (const statement of STATEMENTS) {
        await sql(statement);
    }
    const [{ exists }] = (await sql(
        `SELECT EXISTS (SELECT 1 FROM information_schema.tables
         WHERE table_name = 'user_county_subscriptions') AS exists`,
    )) as Array<{ exists: boolean }>;
    console.log(`  ${exists ? '✓' : '✗'} ${label}: table present = ${exists}`);
}

async function main(): Promise<void> {
    const target = process.argv[2] ?? 'both';
    console.log(`Applying migration 0010 to: ${target}`);
    if (target === 'test' || target === 'both') {
        await applyTo('TEST_DATABASE_URL (test branch)', process.env.TEST_DATABASE_URL);
    }
    if (target === 'dev' || target === 'both') {
        await applyTo('DATABASE_URL (feature branch)', process.env.DATABASE_URL);
    }
    console.log('Done.');
}

main();
