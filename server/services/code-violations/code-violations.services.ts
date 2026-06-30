import crypto from 'crypto';
import Papa from 'papaparse';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from 'server/storage';
import { cvUploads, cvViolations } from '@database/schemas/code-violations.schema';
import {
    cvParsedRowSchema,
    type CvParsedRow,
} from '@database/validation/code-violations.validation';
import type { CvUpload, CvUploadSource } from '@database/types/code-violations';
import { getSupabase, codeViolationStorageBucket } from 'server/lib/supabase';

// The Accela export header, in order. The trailing comma in the real file yields an 8th,
// empty-named column that papaparse exposes as a "" field — we ignore it. These are the
// columns the parser requires; a file missing any of them is rejected before ENQUEUE.
const REQUIRED_CSV_HEADERS = [
    'Date',
    'Record Number',
    'Record Type',
    'Address',
    'Application Name',
    'Status',
    'Description',
] as const;

/** A raw CSV row keyed by the Accela header names. */
type RawCsvRow = Record<string, string | undefined>;

/** Outcome of parsing a CSV buffer: the rows worth enqueuing plus a count of junk rows skipped. */
export interface ParsedCsvResult {
    rows: CvParsedRow[];
    skipped: number;
}

/** Result of an ingest run, returned to the controller for the immediate response. */
export interface IngestCsvResult {
    uploadId: string;
    rowsTotal: number;
    violationsNew: number;
    skipped: number;
}

interface IngestCsvParams {
    buffer: Buffer;
    fileName: string;
    mimetype: string;
    uploadedBy: string;
    source?: CvUploadSource;
}

/** Thrown when the uploaded file isn't a parseable Accela export (bad header or corrupt body). */
export class InvalidCsvError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidCsvError';
    }
}

/**
 * Parse an Accela `MM/DD/YYYY` date cell into a `YYYY-MM-DD` calendar string.
 *
 * Done with a regex rather than `new Date(value)` on purpose: `new Date("03/01/2026")` parses as
 * local midnight and `toISOString()` re-serializes in UTC, which shifts the date back a day on
 * UTC-positive servers. Pulling the fields out directly keeps the calendar date exactly as the
 * export wrote it, regardless of the server timezone.
 *
 * @param value the raw date cell (may be empty or a non-date string)
 * @returns the `YYYY-MM-DD` string, or null when absent/unparseable
 */
export function parseAccelaDate(value: string): string | null {
    const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return null;
    const [, mm, dd, yyyy] = match;
    const month = Number(mm);
    const day = Number(dd);
    // Reject impossible month/day values rather than store e.g. 13/40.
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

/**
 * Parse an Accela code-enforcement CSV export into validated rows.
 *
 * Uses papaparse (real CSV parsing) because descriptions contain embedded quotes and
 * newlines that a line-split would mangle. Validates the header and rejects a structurally
 * corrupt body (unterminated quote / unguessable delimiter) by throwing {@link InvalidCsvError},
 * so the caller never enqueues garbage or silently drops every row of a truncated file. Rows
 * missing a record number or address (e.g. a bare `United States` junk line) fail the row schema
 * and are skipped, not enqueued.
 *
 * @param buffer the raw uploaded file
 * @returns the valid parsed rows and the number of junk rows skipped
 * @throws {InvalidCsvError} when the header is wrong or the body can't be parsed
 */
export function parseCodeViolationCsv(buffer: Buffer): ParsedCsvResult {
    const parsed = Papa.parse<RawCsvRow>(buffer.toString('utf8'), {
        header: true,
        skipEmptyLines: true,
    });

    const fields = parsed.meta.fields ?? [];
    const missing = REQUIRED_CSV_HEADERS.filter((h) => !fields.includes(h));
    if (missing.length > 0) {
        throw new InvalidCsvError(`Unexpected CSV header — missing columns: ${missing.join(', ')}`);
    }

    // Ragged rows (FieldMismatch) are benign — the Accela export's trailing comma and short junk
    // lines produce them, and such rows just fail the row schema below and get skipped. A 'Quotes'
    // or 'Delimiter' error means the body is structurally corrupt (e.g. truncated mid-quote), which
    // would otherwise yield a partial/empty parse that looks like a successful ingest — reject it.
    const fatal = parsed.errors.find((e) => e.type === 'Quotes' || e.type === 'Delimiter');
    if (fatal) {
        throw new InvalidCsvError(`CSV could not be parsed: ${fatal.message}`);
    }

    const rows: CvParsedRow[] = [];
    let skipped = 0;
    for (const raw of parsed.data) {
        const candidate = {
            recordNumber: raw['Record Number'] ?? '',
            recordType: raw['Record Type'] ?? '',
            violationDate: raw['Date'] ?? '',
            rawAddress: raw['Address'] ?? '',
            applicationName: raw['Application Name'] ?? '',
            statusText: raw['Status'] ?? '',
            description: raw['Description'] ?? '',
        };
        const result = cvParsedRowSchema.safeParse(candidate);
        if (result.success) {
            rows.push(result.data);
        } else {
            skipped++;
        }
    }

    return { rows, skipped };
}

/**
 * Phase 1 ingest: open a `cv_uploads` audit row, archive the raw CSV, parse + validate, and
 * ENQUEUE one `cv_violations` row per complaint as `pending`. Does no matching, owner
 * resolution, or emailing — that is the cron consumer's job (Chunk C+). Returns immediately.
 *
 * The audit row is opened *before* any fallible work (storage, parse, insert) so every ingest
 * attempt — including a storage or parse failure — leaves a retrievable `cv_uploads` row that the
 * catch marks `failed`.
 *
 * Dedup is by `record_number`: a brand-new complaint inserts as `pending`; an already-seen one
 * refreshes its Accela `status_text`/`description` and its (possibly corrected) address, but is
 * **not** re-queued — its `processing_status` is left untouched — so overlapping daily uploads are
 * idempotent.
 *
 * @param params the uploaded buffer, file metadata, uploader, and producer source
 * @returns the new upload id and ingest counters
 * @throws {InvalidCsvError} when the file isn't a parseable Accela export (the row is marked `failed` first)
 */
export async function ingestCodeViolationCsv(params: IngestCsvParams): Promise<IngestCsvResult> {
    const { buffer, fileName, mimetype, uploadedBy, source = 'manual' } = params;

    // Open the audit row first so a later storage/parse/insert failure still has a row to mark
    // `failed` — without this, a storage outage would throw with no trace in the admin panel.
    const [upload] = await db
        .insert(cvUploads)
        .values({ source, uploadedBy, fileName, status: 'enqueued' })
        .returning({ id: cvUploads.id });

    try {
        // Archive the raw file so every upload row has a retrievable source artifact.
        const rawRef = `uploads/${crypto.randomUUID()}/${fileName}`;
        const { error: uploadError } = await getSupabase()
            .storage.from(codeViolationStorageBucket)
            .upload(rawRef, buffer, { contentType: mimetype, upsert: false });
        if (uploadError) {
            throw new Error(`Storage upload failed: ${uploadError.message}`);
        }
        await db.update(cvUploads).set({ rawRef }).where(eq(cvUploads.id, upload.id));

        const { rows, skipped } = parseCodeViolationCsv(buffer);

        // Dedup within this file, keeping the first occurrence (the export is most-recent-first).
        // Required, not just an optimization: a batch upsert that hit the same record_number twice
        // would raise "ON CONFLICT DO UPDATE command cannot affect row a second time".
        const byRecordNumber = new Map<string, CvParsedRow>();
        for (const row of rows) {
            if (!byRecordNumber.has(row.recordNumber)) {
                byRecordNumber.set(row.recordNumber, row);
            }
        }
        const uniqueRows = Array.from(byRecordNumber.values());

        let violationsNew = 0;
        if (uniqueRows.length > 0) {
            // normalized_address is left null here — the consumer computes it at MATCH time with the
            // shared normalizer (Chunk C).
            const written = await db
                .insert(cvViolations)
                .values(
                    uniqueRows.map((r) => ({
                        recordNumber: r.recordNumber,
                        recordType: r.recordType || null,
                        applicationName: r.applicationName || null,
                        statusText: r.statusText || null,
                        description: r.description || null,
                        violationDate: parseAccelaDate(r.violationDate),
                        rawAddress: r.rawAddress,
                        firstSeenUploadId: upload.id,
                    })),
                )
                // Already-seen complaints: refresh the Accela status/description and the address (it
                // can be corrected in a later export), and null normalized_address so the consumer
                // recomputes it. processing_status is never reset, so a processed complaint is not
                // re-queued or re-notified.
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
                // `xmax = 0` is true only for freshly inserted rows (a conflict-update carries the
                // updating xid), so the new-row count comes from the upsert's own result in one
                // atomic statement — concurrent uploads of the same record can't both count it new.
                .returning({ isNew: sql<boolean>`(xmax = 0)` });
            violationsNew = written.filter((r) => r.isNew).length;
        }

        await db
            .update(cvUploads)
            .set({ rowsTotal: rows.length, violationsNew })
            .where(eq(cvUploads.id, upload.id));

        return { uploadId: upload.id, rowsTotal: rows.length, violationsNew, skipped };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Ingest failed';
        await db
            .update(cvUploads)
            .set({ status: 'failed', errorMessage: message, finishedAt: sql`now()` })
            .where(eq(cvUploads.id, upload.id));
        throw error;
    }
}

/**
 * List ingest runs, most recent first, to back the admin results panel.
 * @returns all `cv_uploads` rows ordered by creation time descending
 */
export async function listCodeViolationUploads(): Promise<CvUpload[]> {
    return db.select().from(cvUploads).orderBy(desc(cvUploads.createdAt));
}

/**
 * Fetch a single ingest run by id.
 * @param id the `cv_uploads` id
 * @returns the upload row, or null if not found
 */
export async function getCodeViolationUploadById(id: string): Promise<CvUpload | null> {
    const [upload] = await db.select().from(cvUploads).where(eq(cvUploads.id, id)).limit(1);
    return upload ?? null;
}
