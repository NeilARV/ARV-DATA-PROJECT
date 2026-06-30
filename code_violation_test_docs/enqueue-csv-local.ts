/**
 * Code-Violation feature — local CSV enqueue (Supabase-free).
 *
 * The real ingest endpoint archives the raw CSV to the `code-violations-dev` Supabase Storage bucket
 * BEFORE enqueuing — so if that bucket isn't set up in your local Supabase, an admin-panel upload
 * fails before any violation is enqueued. This script reproduces the ENQUEUE step (using the REAL
 * parser — parseCodeViolationCsv / parseAccelaDate from the service) WITHOUT the Supabase archive,
 * so you can exercise the consumer + notify path locally regardless.
 *
 *   npx tsx code_violation_test_docs/enqueue-csv-local.ts code_violation_test_docs/06-all-scenarios.csv
 *
 * Then drain it:  npx tsx code_violation_test_docs/run-cv-consumer.ts
 *
 * Prefer the admin panel when your dev Supabase bucket exists — that exercises the full Chunk B/E
 * upload UI. This is the fallback when it doesn't.
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { eq, sql } from 'drizzle-orm';
import { cvUploads, cvViolations } from '@database/schemas/code-violations.schema';
import { CV_UPLOAD_STATUS } from '@database/validation/code-violations.validation';
import {
    parseCodeViolationCsv,
    parseAccelaDate,
} from 'server/services/code-violations/code-violations.services';

const db = drizzle(neon(process.env.DATABASE_URL!));

async function main() {
    const filePath = process.argv[2];
    if (!filePath) {
        console.error('Usage: npx tsx code_violation_test_docs/enqueue-csv-local.ts <path-to-csv>');
        process.exit(1);
    }

    const buffer = readFileSync(filePath);
    const fileName = filePath.split(/[\\/]/).pop() ?? 'upload.csv';

    const { rows, skipped } = parseCodeViolationCsv(buffer);
    console.log(`Parsed ${rows.length} valid row(s), ${skipped} skipped (failed row schema).`);

    // Open the audit row (no rawRef — we deliberately skip the Supabase archive).
    const [upload] = await db
        .insert(cvUploads)
        .values({ source: 'manual', fileName, status: CV_UPLOAD_STATUS.ENQUEUED })
        .returning({ id: cvUploads.id });

    // Dedup within the file (keep first occurrence), then upsert as `pending` — mirrors the service.
    const byRecordNumber = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
        if (!byRecordNumber.has(row.recordNumber)) byRecordNumber.set(row.recordNumber, row);
    }
    const uniqueRows = Array.from(byRecordNumber.values());

    let violationsNew = 0;
    if (uniqueRows.length > 0) {
        const written = await db
            .insert(cvViolations)
            .values(
                uniqueRows.map((r) => ({
                    recordNumber: r.recordNumber,
                    recordType: r.recordType,
                    applicationName: r.applicationName,
                    statusText: r.statusText,
                    description: r.description,
                    violationDate: parseAccelaDate(r.violationDate),
                    rawAddress: r.rawAddress,
                    firstSeenUploadId: upload.id,
                })),
            )
            .onConflictDoUpdate({
                target: cvViolations.recordNumber,
                set: {
                    statusText: sql`excluded.status_text`,
                    description: sql`excluded.description`,
                    rawAddress: sql`excluded.raw_address`,
                    normalizedAddress: sql`null`,
                    updatedAt: sql`now()`,
                },
            })
            .returning({ isNew: sql<boolean>`(xmax = 0)` });
        violationsNew = written.filter((r) => r.isNew).length;
    }

    await db
        .update(cvUploads)
        .set({ rowsTotal: rows.length, violationsNew })
        .where(eq(cvUploads.id, upload.id));

    if (violationsNew === 0) {
        await db
            .update(cvUploads)
            .set({ status: CV_UPLOAD_STATUS.COMPLETED, finishedAt: sql`now()` })
            .where(eq(cvUploads.id, upload.id));
    }

    console.log(
        `Enqueued upload ${upload.id}: ${violationsNew} new pending violation(s) ` +
            `(${rows.length - violationsNew} already-seen duplicate(s) refreshed, not re-queued).`,
    );
    console.log('Now run: npx tsx code_violation_test_docs/run-cv-consumer.ts');
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Enqueue failed:', err);
        process.exit(1);
    });
