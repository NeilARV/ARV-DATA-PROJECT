// One-off applier for migration 0011 (drops user_msa_subscriptions, issue #118).
// db:push aborts on the market_scan_queue drift, so this applies the idempotent DDL directly.
// Targets are chosen by env-var NAME (never printed): TEST_DATABASE_URL and/or DATABASE_URL.
// Usage: tsx scripts/apply-0011.ts test|dev|both
import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';

dotenv.config(); // .env -> DATABASE_URL
dotenv.config({ path: '.env.test' }); // .env.test -> TEST_DATABASE_URL

async function applyTo(label: string, url: string | undefined): Promise<void> {
    if (!url) {
        console.error(`  ✗ ${label}: env var not set — skipped`);
        return;
    }
    const sql = neon(url);
    await sql(`DROP TABLE IF EXISTS "user_msa_subscriptions" CASCADE`);
    const [{ exists }] = (await sql(
        `SELECT EXISTS (SELECT 1 FROM information_schema.tables
         WHERE table_name = 'user_msa_subscriptions') AS exists`,
    )) as { exists: boolean }[];
    console.log(`  ${exists ? '✗' : '✓'} ${label}: table dropped = ${!exists}`);
}

async function main(): Promise<void> {
    const target = process.argv[2] ?? 'both';
    console.log(`Applying migration 0011 to: ${target}`);
    if (target === 'test' || target === 'both') {
        await applyTo('TEST_DATABASE_URL (test branch)', process.env.TEST_DATABASE_URL);
    }
    if (target === 'dev' || target === 'both') {
        await applyTo('DATABASE_URL (feature branch)', process.env.DATABASE_URL);
    }
    console.log('Done.');
}

main();
