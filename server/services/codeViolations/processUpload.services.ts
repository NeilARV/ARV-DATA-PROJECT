import { db } from 'server/storage';
import { addresses, properties } from '@database/schemas/properties.schema';
import { cvUploads, cvViolations } from '@database/schemas/codeViolations.schema';
import { eq, inArray, sql } from 'drizzle-orm';
import { parseCsv } from './parse.services';
import { parseAddress, streetKeyFromComponents } from './address.services';
import { buildCandidateIndex, matchAddress, type AddressCandidate, type CandidateIndex } from './match.services';
import { notifyForMatches } from './notify.services';

// MVP scope: City of San Diego only. County lives on properties (addresses.county is
// unpopulated in this data), so candidates are scoped there — verified against the DB.
const MATCH_COUNTY = 'san diego';

// Tiers we trust enough to auto-confirm and auto-send. Fuzzy is stored but held: it never
// auto-notifies (reviewStatus stays 'pending').
const CONFIDENT_METHODS = new Set(['exact', 'exact_no_zip']);

type ViolationInsert = typeof cvViolations.$inferInsert;

/** Load the San Diego candidate set and index it for matching. */
async function loadCandidateIndex(): Promise<CandidateIndex> {
    const rows = await db
        .select({
            propertyId: addresses.propertyId,
            streetNumber: addresses.streetNumber,
            streetPreDirection: addresses.streetPreDirection,
            streetName: addresses.streetName,
            streetSuffix: addresses.streetSuffix,
            streetPostDirection: addresses.streetPostDirection,
            city: addresses.city,
            zip: addresses.zipCode,
        })
        .from(addresses)
        .innerJoin(properties, eq(properties.id, addresses.propertyId))
        .where(sql`lower(trim(${properties.county})) = ${MATCH_COUNTY}`);

    const candidates: AddressCandidate[] = rows.map((r) => ({
        propertyId: r.propertyId,
        streetNumber: r.streetNumber,
        canonicalStreet: streetKeyFromComponents(r),
        city: r.city,
        zip: r.zip,
    }));
    return buildCandidateIndex(candidates);
}

/**
 * Process an uploaded CSV end to end: parse → match → upsert cv_violations → auto-notify
 * confident new matches. Idempotent: violations upsert on record_number (overlapping
 * re-uploads update, never duplicate) and alerts dedupe via the notify ledger. Flips the
 * cv_uploads row through processing → done/failed and records row/matched counts.
 * Intended to run off the request thread; never throws (failures land on the upload row).
 * @param uploadId the cv_uploads row to process
 */
export async function processUpload(uploadId: string): Promise<void> {
    const [upload] = await db
        .select({ rawCsv: cvUploads.rawCsv })
        .from(cvUploads)
        .where(eq(cvUploads.id, uploadId))
        .limit(1);

    if (!upload?.rawCsv) {
        await db
            .update(cvUploads)
            .set({ status: 'failed', error: 'No CSV content to process', processedAt: new Date() })
            .where(eq(cvUploads.id, uploadId));
        return;
    }

    try {
        await db.update(cvUploads).set({ status: 'processing' }).where(eq(cvUploads.id, uploadId));

        const rows = parseCsv(upload.rawCsv);
        const index = await loadCandidateIndex();

        const evaluated = rows.map((row) => {
            const parsed = parseAddress(row.rawAddress);
            const match = matchAddress(parsed, index);
            return { row, parsed, match };
        });

        if (evaluated.length > 0) {
            const values: ViolationInsert[] = evaluated.map(({ row, parsed, match }) => ({
                recordNumber: row.recordNumber,
                recordType: row.recordType,
                rawAddress: row.rawAddress,
                normalizedAddress: parsed.normalized,
                streetNumber: parsed.streetNumber,
                streetName: parsed.streetName,
                unit: parsed.unit,
                city: parsed.city,
                state: parsed.state,
                zip: parsed.zip,
                applicationName: row.applicationName,
                status: row.status,
                description: row.description,
                violationDate: row.violationDate,
                propertyId: match?.propertyId ?? null,
                matchMethod: match?.method ?? null,
                matchConfidence: match ? String(match.confidence) : null,
                // Confident tiers auto-confirm; fuzzy/unmatched stay pending.
                reviewStatus: match && CONFIDENT_METHODS.has(match.method) ? 'confirmed' : 'pending',
                sourceUploadId: uploadId,
            }));

            // Upsert on record_number: refresh the violation's data + re-match, but keep
            // first_seen_at and review_status (so an admin's later dismissal isn't undone).
            await db
                .insert(cvViolations)
                .values(values)
                .onConflictDoUpdate({
                    target: cvViolations.recordNumber,
                    set: {
                        recordType: sql`excluded.record_type`,
                        rawAddress: sql`excluded.raw_address`,
                        normalizedAddress: sql`excluded.normalized_address`,
                        streetNumber: sql`excluded.street_number`,
                        streetName: sql`excluded.street_name`,
                        unit: sql`excluded.unit`,
                        city: sql`excluded.city`,
                        state: sql`excluded.state`,
                        zip: sql`excluded.zip`,
                        applicationName: sql`excluded.application_name`,
                        status: sql`excluded.status`,
                        description: sql`excluded.description`,
                        violationDate: sql`excluded.violation_date`,
                        propertyId: sql`excluded.property_id`,
                        matchMethod: sql`excluded.match_method`,
                        matchConfidence: sql`excluded.match_confidence`,
                        sourceUploadId: sql`excluded.source_upload_id`,
                        lastSeenAt: sql`now()`,
                    },
                });
        }

        const matchedCount = evaluated.filter((e) => e.match != null).length;
        const confidentRecordNumbers = evaluated
            .filter((e) => e.match != null && CONFIDENT_METHODS.has(e.match.method))
            .map((e) => e.row.recordNumber);

        // Re-read the confident matches to get their ids + final property ids for notify
        // (avoids relying on bulk-insert RETURNING order).
        const toNotify =
            confidentRecordNumbers.length > 0
                ? (
                      await db
                          .select({ id: cvViolations.id, propertyId: cvViolations.propertyId })
                          .from(cvViolations)
                          .where(inArray(cvViolations.recordNumber, confidentRecordNumbers))
                  ).flatMap((v) =>
                      v.propertyId ? [{ violationId: v.id, propertyId: v.propertyId }] : [],
                  )
                : [];

        // Auto-send (locked decision): confident new matches notify their owners now —
        // before flipping to 'done' so the status truly means "processed + alerted".
        await notifyForMatches(toNotify);

        await db
            .update(cvUploads)
            .set({
                status: 'done',
                rowCount: rows.length,
                matchedCount,
                processedAt: new Date(),
            })
            .where(eq(cvUploads.id, uploadId));
    } catch (error) {
        console.error('processUpload error:', error);
        await db
            .update(cvUploads)
            .set({
                status: 'failed',
                error: error instanceof Error ? error.message : 'Unknown processing error',
                processedAt: new Date(),
            })
            .where(eq(cvUploads.id, uploadId));
    }
}
