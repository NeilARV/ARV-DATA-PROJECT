// One-off applier for migration 0009 (adds company_groups.code_violation_notifications_enabled).
// db:push aborts on the market_scan_queue drift, so this applies the additive, idempotent ALTER
// directly. Targets are chosen by env-var NAME (never printed): TEST_DATABASE_URL and/or DATABASE_URL.
// Usage: tsx scripts/apply-0009.ts test|dev|both
import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';

dotenv.config(); // .env -> DATABASE_URL
dotenv.config({ path: '.env.test' }); // .env.test -> TEST_DATABASE_URL

const DDL =
    'ALTER TABLE "company_groups" ADD COLUMN IF NOT EXISTS ' +
    '"code_violation_notifications_enabled" boolean DEFAULT false NOT NULL';

async function applyTo(label: string, url: string | undefined): Promise<void> {
    if (!url) {
        console.error(`  ✗ ${label}: env var not set — skipped`);
        return;
    }
    const sql = neon(url);
    await sql(DDL);
    const [{ exists }] = (await sql(
        `SELECT EXISTS (SELECT 1 FROM information_schema.columns
         WHERE table_name = 'company_groups'
           AND column_name = 'code_violation_notifications_enabled') AS exists`,
    )) as Array<{ exists: boolean }>;
    console.log(`  ${exists ? '✓' : '✗'} ${label}: column present = ${exists}`);
}

async function main(): Promise<void> {
    const target = process.argv[2] ?? 'both';
    console.log(`Applying migration 0009 to: ${target}`);
    if (target === 'test' || target === 'both') {
        await applyTo('TEST_DATABASE_URL (test branch)', process.env.TEST_DATABASE_URL);
    }
    if (target === 'dev' || target === 'both') {
        await applyTo('DATABASE_URL (feature branch)', process.env.DATABASE_URL);
    }
    console.log('Done.');
}

main();
