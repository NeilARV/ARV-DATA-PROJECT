// One-off, idempotent migration: create the cv_ code-violation tables and add the
// 'code_violation' value to the notification_type enum. Targeted DDL (not db:push) so
// unrelated drift (e.g. market_scan_queue) is never touched. Safe to re-run.
//
// Usage: npm run migrate:code-violation
import { db } from '../server/storage';
import { sql } from 'drizzle-orm';

async function main(): Promise<void> {
    // cv_uploads — one row per CSV upload (audit + raw file + status the UI polls)
    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS cv_uploads (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
            file_name varchar(255),
            raw_csv text,
            row_count integer,
            matched_count integer,
            status varchar(20) NOT NULL DEFAULT 'pending',
            error text,
            created_at timestamp DEFAULT now(),
            processed_at timestamp
        )
    `);

    // cv_violations — one row per complaint, idempotent on record_number; matched
    // property is a direct nullable FK (NULL = unmatched).
    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS cv_violations (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            record_number varchar(40) NOT NULL UNIQUE,
            record_type varchar(50),
            source varchar(30) NOT NULL DEFAULT 'sandiego_accela',
            raw_address text,
            normalized_address text,
            street_number varchar(20),
            street_name varchar(120),
            unit varchar(20),
            city varchar(100),
            state varchar(2),
            zip varchar(10),
            application_name text,
            status varchar(60),
            description text,
            violation_date date,
            property_id uuid REFERENCES properties(id) ON DELETE SET NULL,
            match_method varchar(20),
            match_confidence numeric(4, 3),
            review_status varchar(20) NOT NULL DEFAULT 'pending',
            first_seen_at timestamp DEFAULT now(),
            last_seen_at timestamp DEFAULT now(),
            source_upload_id uuid REFERENCES cv_uploads(id) ON DELETE SET NULL
        )
    `);
    await db.execute(
        sql`CREATE INDEX IF NOT EXISTS idx_cv_violations_property ON cv_violations (property_id)`,
    );
    await db.execute(
        sql`CREATE INDEX IF NOT EXISTS idx_cv_violations_norm_addr ON cv_violations (normalized_address)`,
    );

    // cv_notifications_sent — idempotency ledger (one row per violation × user × channel)
    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS cv_notifications_sent (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            cv_violation_id uuid NOT NULL REFERENCES cv_violations(id) ON DELETE CASCADE,
            property_id uuid NOT NULL,
            user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            channel varchar(10) NOT NULL,
            sent_at timestamp DEFAULT now(),
            CONSTRAINT cv_notifications_sent_violation_user_channel_unique
                UNIQUE (cv_violation_id, user_id, channel)
        )
    `);

    // Bell notification type for code violations (system alert — no human actor).
    await db.execute(sql`ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'code_violation'`);

    // ── verify ──
    const tables = await db.execute(
        sql`SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name IN ('cv_uploads', 'cv_violations', 'cv_notifications_sent')
            ORDER BY table_name`,
    );
    const enumValues = await db.execute(
        sql`SELECT e.enumlabel AS label
            FROM pg_enum e
            JOIN pg_type t ON t.oid = e.enumtypid
            WHERE t.typname = 'notification_type'
            ORDER BY e.enumsortorder`,
    );
    const tableRows = Array.isArray(tables) ? tables : (tables as { rows?: unknown[] }).rows;
    const enumRows = Array.isArray(enumValues)
        ? enumValues
        : (enumValues as { rows?: unknown[] }).rows;
    console.log('cv_ tables present:', JSON.stringify(tableRows));
    console.log('notification_type values:', JSON.stringify(enumRows));
    console.log('Done.');
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Code-violation migration failed:', err);
        process.exit(1);
    });
