/**
 * Code-Violation feature — local fixture teardown.
 *
 * Removes everything seed-cv-mocks.ts created, plus the cv_ rows produced by uploading the scenario
 * CSVs, from your local DATABASE_URL. Use it to reset between runs or to wipe the test data when
 * you're done (so the throwaway branch deletes cleanly).
 *
 *   npx tsx code_violation_test_docs/cleanup-cv-mocks.ts
 *
 * What it deletes:
 *  - cv_uploads / cv_violations (+ cascading cv_matches, cv_notifications_sent) for the scenario
 *    record-number prefixes and the seeded uploads.
 *  - the seeded properties (cascades addresses + transactions + cv_matches), companies, and the
 *    justin@arvfinance.com user (cascades company_members + user_roles).
 *
 * It does NOT touch any row outside the fixed test namespace / record-number prefixes.
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { eq, inArray, or, like } from 'drizzle-orm';
import { users } from '@database/schemas/users.schema';
import { companies } from '@database/schemas/companies.schema';
import { properties } from '@database/schemas/properties.schema';
import { cvUploads, cvViolations } from '@database/schemas/code-violations.schema';

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

const JUSTIN_ID = '0c0de111-0000-4000-8000-000000000001';
const COMPANY_IDS = [
    '0c0de111-0000-4000-8000-0000000000a1',
    '0c0de111-0000-4000-8000-0000000000a2',
    '0c0de111-0000-4000-8000-0000000000a3',
];
const PROPERTY_IDS = [
    '0c0de111-0000-4000-8000-0000000000b1',
    '0c0de111-0000-4000-8000-0000000000b2',
    '0c0de111-0000-4000-8000-0000000000b3',
    '0c0de111-0000-4000-8000-0000000000b4',
    '0c0de111-0000-4000-8000-0000000000b5',
    '0c0de111-0000-4000-8000-0000000000b6',
];

// Record-number prefixes used by the scenario CSVs in this folder.
const RECORD_LIKE = ['CE-1%', 'CE-2%', 'CE-3%', 'CE-4%', 'CE-5%', 'CE-9%', '##TMP-5%', '##TMP-9%'];

async function cleanup() {
    console.log('Removing code-violation test fixtures from DATABASE_URL...');

    // cv_violations: cascades cv_matches + cv_notifications_sent. Match the scenario record numbers.
    const delViolations = await db
        .delete(cvViolations)
        .where(or(...RECORD_LIKE.map((p) => like(cvViolations.recordNumber, p))))
        .returning({ id: cvViolations.id });
    console.log(`  ✓ cv_violations removed: ${delViolations.length}`);

    // cv_uploads created while testing locally (manual source, archived under uploads/).
    const delUploads = await db
        .delete(cvUploads)
        .where(eq(cvUploads.source, 'manual'))
        .returning({ id: cvUploads.id });
    console.log(`  ✓ cv_uploads (source=manual) removed: ${delUploads.length}`);

    // Seeded entities (FK cascades handle addresses, transactions, members, roles, matches).
    await db.delete(properties).where(inArray(properties.id, PROPERTY_IDS));
    await db.delete(companies).where(inArray(companies.id, COMPANY_IDS));
    await db.delete(users).where(eq(users.id, JUSTIN_ID));
    console.log('  ✓ properties / companies / justin user removed');

    console.log('\nCleanup complete.');
}

cleanup()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Cleanup failed:', err);
        process.exit(1);
    });
