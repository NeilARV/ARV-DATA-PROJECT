// Wire contracts for the Code Violations admin panel (the `GET`/`POST /api/code-violations/*`
// responses). Dates are strings here because JSON has no `Date` type — the server's in-memory rows
// carry `Date`s (Drizzle) and JSON-serialize to ISO strings, which is what the client actually reads.
// (Mirrors the string-date convention in shared/types/deals.ts.)
//
// The status/source unions are the database's single source of truth (database/validation/
// code-violations.validation.ts → database/types). We re-export them rather than re-declaring the
// literals so the wire contract can't drift from the columns the consumer writes.
export type {
    CvProcessingStatus,
    CvUploadStatus,
    CvUploadSource,
} from '@database/types/code-violations';

import type {
    CvProcessingStatus,
    CvUploadStatus,
    CvUploadSource,
} from '@database/types/code-violations';

/** One ingest run, as the admin history table reads it (a JSON-serialized `cv_uploads` row). */
export type CvUploadSummary = {
    id: string;
    source: CvUploadSource;
    uploadedBy: string | null;
    fileName: string;
    status: CvUploadStatus;
    rowsTotal: number;
    rowsMatched: number;
    rowsUnmatched: number;
    violationsNew: number;
    notificationsSent: number;
    errorMessage: string | null;
    createdAt: string;
    finishedAt: string | null;
};

/** A user eligible to be emailed about a complaint — already kill-switch filtered. */
export type CvViolationRecipient = {
    userId: string;
    email: string;
};

/**
 * One complaint enqueued by an upload, with its resolution and the owning company's eligible alert
 * recipients. `propertyId`/`owner*` are null until the consumer matches it; `recipients` is empty
 * unless the matched owner is a company with at least one notifiable member. Whether an alert
 * actually fired is `notified` (only sendable — new/active `CE-*` — complaints email).
 */
export type CvViolationDetail = {
    id: string;
    recordNumber: string;
    recordType: string | null;
    statusText: string | null;
    description: string | null;
    violationDate: string | null;
    rawAddress: string;
    processingStatus: CvProcessingStatus;
    notified: boolean;
    errorMessage: string | null;
    createdAt: string;
    // Resolution (the `cv_matches` row) — null when the complaint didn't resolve to a property.
    propertyId: string | null;
    ownerCompanyId: string | null;
    ownerCompanyName: string | null; // formatted for display (ARV.RAW-COMPANY-NAME)
    ownerName: string | null; // formatted for display (ARV.RAW-COMPANY-NAME)
    // The owning company's eligible alert recipients (see `notified` for whether an alert fired).
    recipients: CvViolationRecipient[];
};

/** `GET /api/code-violations/uploads` */
export type CvUploadListResponse = {
    uploads: CvUploadSummary[];
};

/** `GET /api/code-violations/uploads/:id` — the upload plus its per-complaint breakdown. */
export type CvUploadDetailResponse = {
    upload: CvUploadSummary;
    violations: CvViolationDetail[];
};

/** `POST /api/code-violations/uploads` — the immediate Phase-1 ingest result. */
export type CvIngestResponse = {
    uploadId: string;
    rowsTotal: number;
    violationsNew: number;
    skipped: number;
};
