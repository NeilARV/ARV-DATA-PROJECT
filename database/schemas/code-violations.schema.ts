import {
    pgTable,
    uuid,
    text,
    integer,
    boolean,
    date,
    timestamp,
    index,
    unique,
} from 'drizzle-orm/pg-core';
import { users } from './users.schema';
import { companies } from './companies.schema';
import { properties } from './properties.schema';

// Status columns below are plain `text` (not pgEnum) on purpose: the value sets are
// expected to grow (new processing states, a future 'in_app' channel) and we don't want
// a migration per addition. The allowed values are enforced at the edges by Zod
// (database/validation/code-violations.validation.ts) and typed in database/types.

// ─── Uploads ──────────────────────────────────────────────────────────────────
// One row per ingest run — the audit trail + the data the admin results panel reads.

export const cvUploads = pgTable('cv_uploads', {
    id: uuid('id').defaultRandom().primaryKey(),
    // Which producer enqueued this batch. Included from V1 so the future scraper needs no migration.
    source: text('source').notNull().default('manual'), // 'manual' | 'scraper'
    // Null for the scraper producer (no human uploader).
    uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    fileName: text('file_name').notNull(),
    rawRef: text('raw_ref'), // Supabase Storage path of the archived CSV
    // Upload-level lifecycle: 'enqueued' | 'processing' | 'review' | 'completed' | 'failed'.
    status: text('status').notNull().default('enqueued'),
    rowsTotal: integer('rows_total').notNull().default(0),
    rowsMatched: integer('rows_matched').notNull().default(0),
    rowsUnmatched: integer('rows_unmatched').notNull().default(0),
    violationsNew: integer('violations_new').notNull().default(0),
    notificationsSent: integer('notifications_sent').notNull().default(0),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
});

// ─── Violations (system of record + work queue) ─────────────────────────────────
// Every distinct complaint we've ever parsed, property-agnostic. `processingStatus` is
// the queue state the consumer reads; `pending` rows are the work list.

export const cvViolations = pgTable(
    'cv_violations',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        // The idempotency key. Overlapping daily uploads dedup on this.
        recordNumber: text('record_number').notNull().unique(),
        recordType: text('record_type'),
        applicationName: text('application_name'),
        // Accela's own status (e.g. 'New') — distinct from `processingStatus`.
        statusText: text('status_text'),
        description: text('description'),
        violationDate: date('violation_date'),
        rawAddress: text('raw_address').notNull(),
        // Canonicalized form used for matching + the ##TMP→CE secondary dedup.
        normalizedAddress: text('normalized_address'),
        // The queue state: 'pending' → 'processing' → 'awaiting_review' /
        // 'no_match' / 'ambiguous' / 'complete' / 'failed'.
        processingStatus: text('processing_status').notNull().default('pending'),
        // Hard "did the email fire" flag — independent of processingStatus.
        notified: boolean('notified').notNull().default(false),
        errorMessage: text('error_message'), // reason when processingStatus = 'failed'
        // The upload that first enqueued this complaint (review approval is per-upload).
        firstSeenUploadId: uuid('first_seen_upload_id').references(() => cvUploads.id, {
            onDelete: 'set null',
        }),
        processedAt: timestamp('processed_at', { withTimezone: true }), // reached a terminal status
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        // The consumer fetch — pull the oldest `pending` rows — rides this index.
        index('idx_cv_violations_status_created').on(t.processingStatus, t.createdAt),
    ],
);

// ─── Matches (violation ↔ property + owner snapshot) ─────────────────────────────
// Written only when a violation resolves to a property. One match per violation.

export const cvMatches = pgTable('cv_matches', {
    id: uuid('id').defaultRandom().primaryKey(),
    violationId: uuid('violation_id')
        .notNull()
        .unique()
        .references(() => cvViolations.id, { onDelete: 'cascade' }),
    propertyId: uuid('property_id')
        .notNull()
        .references(() => properties.id, { onDelete: 'cascade' }),
    // Null when the current owner is an individual / unlinked (no company FK).
    ownerCompanyId: uuid('owner_company_id').references(() => companies.id, {
        onDelete: 'set null',
    }),
    ownerName: text('owner_name'), // snapshot of buyerName at match time
    matchedAt: timestamp('matched_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Notifications sent (delivery audit) ─────────────────────────────────────────
// One row per notification actually delivered. The UNIQUE is the double-send backstop.

export const cvNotificationsSent = pgTable(
    'cv_notifications_sent',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        violationId: uuid('violation_id')
            .notNull()
            .references(() => cvViolations.id, { onDelete: 'cascade' }),
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        companyId: uuid('company_id')
            .notNull()
            .references(() => companies.id, { onDelete: 'cascade' }),
        channel: text('channel').notNull().default('email'), // 'email' in V1; 'in_app' in V2
        sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        unique('uq_cv_notifications_violation_user_channel').on(
            t.violationId,
            t.userId,
            t.channel,
        ),
    ],
);
