import {
    pgTable,
    uuid,
    varchar,
    text,
    integer,
    decimal,
    date,
    timestamp,
    index,
    unique,
} from 'drizzle-orm/pg-core';
import { users } from './users.schema';
import { properties } from './properties.schema';

// ─── Code-violation alerts (MVP) ────────────────────────────────────────────────
// City of San Diego code-enforcement complaints, ingested via admin CSV upload,
// matched to the properties we track, and pushed to the owning company's users.
// These `cv_` tables are the permanent system of record (the bell/email are a
// disposable projection). Status-like columns are plain varchars (not pgEnums) so
// new states never require an `ALTER TYPE` migration — the allowed values are
// documented inline at each column.

// One row per CSV upload: audit trail + the raw file (re-parse without re-download)
// + processing status the admin upload screen polls.
export const cvUploads = pgTable('cv_uploads', {
    id: uuid('id').defaultRandom().primaryKey(),
    uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    fileName: varchar('file_name', { length: 255 }),
    rawCsv: text('raw_csv'),
    rowCount: integer('row_count'),
    matchedCount: integer('matched_count'),
    // 'pending' | 'processing' | 'done' | 'failed'
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    error: text('error'),
    createdAt: timestamp('created_at').defaultNow(),
    processedAt: timestamp('processed_at'),
});

// One row per complaint, kept forever, idempotent on `recordNumber` so overlapping
// re-uploads (~2-week windows) upsert instead of duplicating. The matched property is
// a DIRECT nullable FK (`propertyId`): our matcher yields at most one property per
// violation (addresses.propertyId is unique + first-hit-wins), so a join table is
// unnecessary. NULL `propertyId` = unmatched (most of the feed — kept anyway for
// history + retroactive matching when a property later enters our DB).
export const cvViolations = pgTable(
    'cv_violations',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        recordNumber: varchar('record_number', { length: 40 }).notNull().unique(),
        recordType: varchar('record_type', { length: 50 }),
        source: varchar('source', { length: 30 }).notNull().default('sandiego_accela'),

        // ── the complaint as the city reported it (always stored) ──
        rawAddress: text('raw_address'),
        normalizedAddress: text('normalized_address'),
        streetNumber: varchar('street_number', { length: 20 }),
        streetName: varchar('street_name', { length: 120 }),
        unit: varchar('unit', { length: 20 }),
        city: varchar('city', { length: 100 }),
        state: varchar('state', { length: 2 }),
        zip: varchar('zip', { length: 10 }),
        applicationName: text('application_name'),
        status: varchar('status', { length: 60 }),
        description: text('description'),
        violationDate: date('violation_date'),

        // ── our inference: which property this matched (0 or 1) ──
        propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'set null' }),
        // 'exact' | 'exact_no_zip' | 'fuzzy' | null (unmatched)
        matchMethod: varchar('match_method', { length: 20 }),
        matchConfidence: decimal('match_confidence', { precision: 4, scale: 3 }),
        // 'pending' | 'confirmed' | 'dismissed' — fuzzy stays 'pending' (held from auto-send);
        // confident tiers are auto-confirmed by the pipeline.
        reviewStatus: varchar('review_status', { length: 20 }).notNull().default('pending'),

        firstSeenAt: timestamp('first_seen_at').defaultNow(),
        lastSeenAt: timestamp('last_seen_at').defaultNow(),
        sourceUploadId: uuid('source_upload_id').references(() => cvUploads.id, {
            onDelete: 'set null',
        }),
    },
    (t) => [
        // "all violations for property X" — the per-property history query
        index('idx_cv_violations_property').on(t.propertyId),
        index('idx_cv_violations_norm_addr').on(t.normalizedAddress),
    ],
);

// Idempotency ledger for alerts: one row per (violation, user, channel) actually sent.
// The unique constraint makes re-clicks / overlapping re-uploads safe — a user is never
// alerted twice for the same violation on the same channel. `propertyId` is denormalized
// (no FK) so the ledger records which property the alert was about at send time and
// survives later re-matching of the violation.
export const cvNotificationsSent = pgTable(
    'cv_notifications_sent',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        cvViolationId: uuid('cv_violation_id')
            .notNull()
            .references(() => cvViolations.id, { onDelete: 'cascade' }),
        propertyId: uuid('property_id').notNull(),
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        // 'email' | 'in_app'
        channel: varchar('channel', { length: 10 }).notNull(),
        sentAt: timestamp('sent_at').defaultNow(),
    },
    (t) => [unique().on(t.cvViolationId, t.userId, t.channel)],
);
