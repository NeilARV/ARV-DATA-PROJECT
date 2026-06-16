/**
 * One-off grandfather backfill (Phase 0): stamps every existing user as email-verified.
 *
 * Run ONCE at rollout, AFTER `npm run db:push` has created the users.email_verified_at
 * column. db:push only syncs structure — it cannot backfill data, which is the one thing
 * this script does. Must run before the signup flow starts minting verification tokens,
 * otherwise a genuinely-unverified user would be wrongly stamped as verified.
 *
 * Usage: npx tsx scripts/grandfather-email-verified.ts
 */

import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from 'server/storage';

async function main() {
    console.log('[grandfather-email-verified] Stamping existing users as verified ...');
    await db.execute(sql`UPDATE users SET email_verified_at = now() WHERE email_verified_at IS NULL`);
    console.log('[grandfather-email-verified] Done.');
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('[grandfather-email-verified] Fatal error:', err);
        process.exit(1);
    });
