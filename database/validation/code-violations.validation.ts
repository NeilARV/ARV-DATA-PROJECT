import { z } from 'zod';

// ─── Value sets (single source of truth for the `text` status columns) ──────────
// The schema columns are plain `text` (see code-violations.schema.ts); these arrays are
// what enforces the allowed values at the edges, and the union types in
// database/types/code-violations.d.ts derive from them.

export const CV_PROCESSING_STATUSES = [
    'pending',
    'processing',
    'awaiting_review',
    'no_match',
    'ambiguous',
    'complete',
    'failed',
] as const;

export const CV_UPLOAD_STATUSES = [
    'enqueued',
    'processing',
    'review',
    'completed',
    'failed',
] as const;

export const CV_UPLOAD_SOURCES = ['manual', 'scraper'] as const;

// 'email' in V1; 'in_app' reserved for V2 (§8.2).
export const CV_NOTIFICATION_CHANNELS = ['email', 'in_app'] as const;

// ─── Parsed CSV row ──────────────────────────────────────────────────────────────
// The normalized shape the ingest service produces from one papaparse row (after mapping
// the Accela header names to our fields) and validates before ENQUEUE. A row that fails
// this — no record number or no address (e.g. a bare `United States` junk line) — is
// skipped, never enqueued.

export const cvParsedRowSchema = z.object({
    recordNumber: z.string().trim().min(1, 'Record Number is required'),
    recordType: z.string().trim().optional().default(''),
    // MM/DD/YYYY as it appears in the export; converted to a date by the service.
    violationDate: z.string().trim().optional().default(''),
    rawAddress: z.string().trim().min(1, 'Address is required'),
    applicationName: z.string().trim().optional().default(''),
    statusText: z.string().trim().optional().default(''),
    description: z.string().trim().optional().default(''),
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
