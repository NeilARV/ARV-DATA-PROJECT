import crypto from 'crypto';
import Papa from 'papaparse';
import { desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from 'server/storage';
import { cvMatches, cvUploads, cvViolations } from '@database/schemas/code-violations.schema';
import { companies, companyMembers } from '@database/schemas/companies.schema';
import {
    cvParsedRowSchema,
    CV_UPLOAD_STATUS,
    type CvParsedRow,
} from '@database/validation/code-violations.validation';
import type { CvProcessingStatus, CvUpload, CvUploadSource } from '@database/types/code-violations';
import type { CvViolationDetail, CvViolationRecipient } from '@shared/types/code-violations';
import { formatCompanyName } from '@shared/utils/formatCompanyName';
import { getSupabase, codeViolationStorageBucket } from 'server/lib/supabase';
import { getEmailRecipientsByUserIds } from 'server/services/postmark/email.services';
import { processCodeViolationQueue } from 'server/jobs/code-violations/consumer';

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
 * idempotent. An upload that enqueues nothing new (all duplicates, or empty) is finalized to
 * `completed` here, since the consumer never visits an upload with no `pending` complaints of its own.
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
        .values({ source, uploadedBy, fileName, status: CV_UPLOAD_STATUS.ENQUEUED })
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
                        recordType: r.recordType,
                        applicationName: r.applicationName,
                        statusText: r.statusText,
                        description: r.description,
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

        // Nothing new was enqueued (every row was an already-seen duplicate, or the file was empty),
        // so no `pending` complaint points at this upload and the consumer will never touch it. Finalize
        // it here instead of leaving it stuck at `enqueued`.
        if (violationsNew === 0) {
            await db
                .update(cvUploads)
                .set({ status: CV_UPLOAD_STATUS.COMPLETED, finishedAt: sql`now()` })
                .where(eq(cvUploads.id, upload.id));
        } else {
            // Kick off processing immediately — there is no cron; the upload itself drives the
            // consumer. Fire-and-forget so this request still returns instantly (the admin panel
            // polls GET /uploads/:id for progress); a drain failure is logged, never surfaced here.
            void processCodeViolationQueue().catch((err) => {
                console.error(`[CV-INGEST] Background drain failed for upload ${upload.id}:`, err);
            });
        }

        return { uploadId: upload.id, rowsTotal: rows.length, violationsNew, skipped };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Ingest failed';
        await db
            .update(cvUploads)
            .set({ status: CV_UPLOAD_STATUS.FAILED, errorMessage: message, finishedAt: sql`now()` })
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

/**
 * The per-complaint breakdown for one upload's admin detail panel: every complaint this upload
 * enqueued (by `first_seen_upload_id`), its match + owning company, and the company's alert
 * recipients — so the panel can show per-complaint statuses and who a sent alert reached.
 *
 * Recipients mirror exactly who NOTIFY targets: the matched owner company's `company_members`
 * narrowed by {@link getEmailRecipientsByUserIds} (the master-notifications / verified-email
 * kill-switch) — never `company_contacts` (§2). Member→recipient resolution is batched across the
 * upload's companies (two queries total), not per row. Whether an alert actually fired is the
 * complaint's `notified` flag, independent of this eligible-recipient list.
 *
 * @param uploadId the `cv_uploads` id
 * @returns the upload's complaints, oldest first, each with its resolution + eligible recipients
 */
export async function getCodeViolationUploadViolations(
    uploadId: string,
): Promise<CvViolationDetail[]> {
    const rows = await db
        .select({
            violation: cvViolations,
            propertyId: cvMatches.propertyId,
            ownerCompanyId: cvMatches.ownerCompanyId,
            ownerName: cvMatches.ownerName,
            ownerCompanyName: companies.companyName,
        })
        .from(cvViolations)
        .leftJoin(cvMatches, eq(cvMatches.violationId, cvViolations.id))
        .leftJoin(companies, eq(companies.id, cvMatches.ownerCompanyId))
        .where(eq(cvViolations.firstSeenUploadId, uploadId))
        .orderBy(cvViolations.createdAt);

    const companyIds = Array.from(
        new Set(rows.map((r) => r.ownerCompanyId).filter((id): id is string => id !== null)),
    );
    const recipientsByCompany = await getRecipientsByCompany(companyIds);

    return rows.map((r) => ({
        id: r.violation.id,
        recordNumber: r.violation.recordNumber,
        recordType: r.violation.recordType,
        statusText: r.violation.statusText,
        description: r.violation.description,
        violationDate: r.violation.violationDate,
        rawAddress: r.violation.rawAddress,
        processingStatus: r.violation.processingStatus as CvProcessingStatus,
        notified: r.violation.notified,
        errorMessage: r.violation.errorMessage,
        createdAt: r.violation.createdAt.toISOString(),
        propertyId: r.propertyId,
        ownerCompanyId: r.ownerCompanyId,
        ownerCompanyName: formatCompanyName(r.ownerCompanyName),
        // buyer_name is stored ALL-CAPS — title-case before returning it (ARV.RAW-COMPANY-NAME),
        // since the panel falls back to it when there's no linked company.
        ownerName: formatCompanyName(r.ownerName),
        recipients: r.ownerCompanyId ? (recipientsByCompany.get(r.ownerCompanyId) ?? []) : [],
    }));
}

/**
 * Resolve each company's would-be email recipients in two batched queries: all members of the given
 * companies, then {@link getEmailRecipientsByUserIds} over the union to apply the kill-switch. A
 * member who fails the kill-switch is dropped — they wouldn't be emailed, so the dry-run omits them.
 */
async function getRecipientsByCompany(
    companyIds: string[],
): Promise<Map<string, CvViolationRecipient[]>> {
    const byCompany = new Map<string, CvViolationRecipient[]>();
    if (companyIds.length === 0) return byCompany;

    const memberRows = await db
        .select({ companyId: companyMembers.companyId, userId: companyMembers.userId })
        .from(companyMembers)
        .where(inArray(companyMembers.companyId, companyIds));

    const userIds = Array.from(new Set(memberRows.map((m) => m.userId)));
    const recipients = await getEmailRecipientsByUserIds(userIds);
    const emailByUserId = new Map(recipients.map((r) => [r.userId, r.email]));

    for (const { companyId, userId } of memberRows) {
        const email = emailByUserId.get(userId);
        if (!email) continue; // suppressed by the kill-switch — wouldn't be emailed
        const list = byCompany.get(companyId) ?? [];
        if (!list.some((r) => r.userId === userId)) list.push({ userId, email });
        byCompany.set(companyId, list);
    }
    return byCompany;
}
