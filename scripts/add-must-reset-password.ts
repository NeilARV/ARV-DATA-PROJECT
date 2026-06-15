/**
 * One-off additive migration: adds users.must_reset_password.
 *
 * Run instead of `db:push` to avoid the unrelated market_scan_queue drift prompt.
 * Safe to run repeatedly (IF NOT EXISTS).
 *
 * Usage: npx tsx scripts/add-must-reset-password.ts
 */

import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from 'server/storage';

async function main() {
    console.log('[add-must-reset-password] Adding users.must_reset_password ...');
    await db.execute(
        sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS must_reset_password boolean NOT NULL DEFAULT false`,
    );
    console.log('[add-must-reset-password] Done.');
}

main()
    .catch((err) => {
        console.error('[add-must-reset-password] Fatal error:', err);
        process.exit(1);
    })
    .finally(() => process.exit(0));
