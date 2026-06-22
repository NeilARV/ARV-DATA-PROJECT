// One-off, idempotent migration: add the 'direct_message' value to the notification_type enum.
// Targeted ALTER (not db:push) so unrelated drift is never touched. Safe to re-run.
import { db } from '../server/storage';
import { sql } from 'drizzle-orm';

async function main(): Promise<void> {
    await db.execute(sql`ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'direct_message'`);
    const result = await db.execute(
        sql`SELECT e.enumlabel AS label
            FROM pg_enum e
            JOIN pg_type t ON t.oid = e.enumtypid
            WHERE t.typname = 'notification_type'
            ORDER BY e.enumsortorder`,
    );
    const rows = Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows;
    console.log('notification_type values:', JSON.stringify(rows));
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Enum migration failed:', err);
        process.exit(1);
    });
