import { z } from 'zod';

// ─── Value sets (single source of truth for the `text` status columns) ──────────
// The schema columns are plain `text` (see code-violations.schema.ts). Each value set is declared
// once as a named-constant object — referenced at the comparison/assignment sites in the service,
// consumer, and job processes so a typo'd status is a compile error, not a silent no-op (and so the
// near-twins `complete` (a violation) and `completed` (an upload) can't be transposed). The `as const`
// arrays — consumed by `z.enum` and the union types in database/types — are derived from the objects,
// so there is exactly one literal per value.

export const CV_PROCESSING_STATUS = {
    PENDING: 'pending',
    PROCESSING: 'processing',
    AWAITING_REVIEW: 'awaiting_review',
    NO_MATCH: 'no_match',
    AMBIGUOUS: 'ambiguous',
    COMPLETE: 'complete',
    FAILED: 'failed',
} as const;

export const CV_PROCESSING_STATUSES = [
    CV_PROCESSING_STATUS.PENDING,
    CV_PROCESSING_STATUS.PROCESSING,
    CV_PROCESSING_STATUS.AWAITING_REVIEW,
    CV_PROCESSING_STATUS.NO_MATCH,
    CV_PROCESSING_STATUS.AMBIGUOUS,
    CV_PROCESSING_STATUS.COMPLETE,
    CV_PROCESSING_STATUS.FAILED,
] as const;

export const CV_UPLOAD_STATUS = {
    ENQUEUED: 'enqueued',
    PROCESSING: 'processing',
    REVIEW: 'review',
    COMPLETED: 'completed',
    FAILED: 'failed',
} as const;

export const CV_UPLOAD_STATUSES = [
    CV_UPLOAD_STATUS.ENQUEUED,
    CV_UPLOAD_STATUS.PROCESSING,
    CV_UPLOAD_STATUS.REVIEW,
    CV_UPLOAD_STATUS.COMPLETED,
    CV_UPLOAD_STATUS.FAILED,
] as const;

export const CV_UPLOAD_SOURCES = ['manual', 'scraper'] as const;

// 'email' in V1; 'in_app' reserved for V2.
export const CV_NOTIFICATION_CHANNEL = {
    EMAIL: 'email',
    IN_APP: 'in_app',
} as const;

export const CV_NOTIFICATION_CHANNELS = [
    CV_NOTIFICATION_CHANNEL.EMAIL,
    CV_NOTIFICATION_CHANNEL.IN_APP,
] as const;

// ─── Parsed CSV row ──────────────────────────────────────────────────────────────
// The normalized shape the ingest service produces from one papaparse row (after mapping
// the Accela header names to our fields) and validates before ENQUEUE. A row that fails
// this — no record number or no address (e.g. a bare `United States` junk line) — is
// skipped, never enqueued.

// An optional Accela text cell: trimmed, with an empty/absent cell collapsing to `null` —
// the storage shape of these nullable columns — so the service stores the value directly
// instead of reconverting `''` back to `null`.
const optionalText = z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null));

export const cvParsedRowSchema = z.object({
    recordNumber: z.string().trim().min(1, 'Record Number is required'),
    recordType: optionalText,
    // MM/DD/YYYY as it appears in the export; converted to a date by the service (which maps
    // an empty string to null), so this stays a string rather than collapsing to null here.
    violationDate: z.string().trim().optional().default(''),
    rawAddress: z.string().trim().min(1, 'Address is required'),
    applicationName: optionalText,
    statusText: optionalText,
    description: optionalText,
});

export type CvParsedRow = z.infer<typeof cvParsedRowSchema>;

// ─── Upload request ──────────────────────────────────────────────────────────────
// The CSV itself arrives as multipart (handled by multer); this validates the optional
// JSON body fields that accompany it. V1's only producer is the manual upload, so `source`
// defaults to 'manual'.

export const uploadCodeViolationsSchema = z.object({
    source: z.enum(CV_UPLOAD_SOURCES).optional().default('manual'),
});

export type UploadCodeViolationsInput = z.infer<typeof uploadCodeViolationsSchema>;
