import { db } from 'server/storage';
import { cvUploads, cvViolations, cvNotificationsSent } from '@database/schemas/codeViolations.schema';
import { addresses } from '@database/schemas/properties.schema';
import { desc, eq, inArray } from 'drizzle-orm';
import { resolveOwnersForProperties } from './resolveOwners.services';
import { formatCompanyName } from '@shared/utils/formatCompanyName';

/** Persisted upload + its processing status (what the admin screen polls). */
export interface UploadStatus {
    id: string;
    fileName: string | null;
    status: string;
    rowCount: number | null;
    matchedCount: number | null;
    error: string | null;
    createdAt: Date | null;
    processedAt: Date | null;
}

/** A violation row enriched for the admin review screen. */
export interface UploadViolation {
    id: string;
    recordNumber: string;
    rawAddress: string | null;
    violationDate: string | null;
    applicationName: string | null;
    status: string | null;
    matchMethod: string | null;
    matchConfidence: string | null;
    reviewStatus: string;
    propertyId: string | null;
    matchedAddress: string | null;
    ownerCompany: string | null;
    recipientCount: number;
    notified: boolean;
}

/**
 * Store an uploaded CSV as a pending batch.
 * @returns the new upload id (processing is kicked off separately, off the request thread)
 */
export async function createUpload(params: {
    fileName: string;
    rawCsv: string;
    uploadedBy: string;
}): Promise<string> {
    const [row] = await db
        .insert(cvUploads)
        .values({
            fileName: params.fileName,
            rawCsv: params.rawCsv,
            uploadedBy: params.uploadedBy,
            status: 'pending',
        })
        .returning({ id: cvUploads.id });
    return row.id;
}

/** Fetch one upload's status + summary, or null if it doesn't exist. */
export async function getUploadStatus(uploadId: string): Promise<UploadStatus | null> {
    const [row] = await db
        .select({
            id: cvUploads.id,
            fileName: cvUploads.fileName,
            status: cvUploads.status,
            rowCount: cvUploads.rowCount,
            matchedCount: cvUploads.matchedCount,
            error: cvUploads.error,
            createdAt: cvUploads.createdAt,
            processedAt: cvUploads.processedAt,
        })
        .from(cvUploads)
        .where(eq(cvUploads.id, uploadId))
        .limit(1);
    return row ?? null;
}

/**
 * List the violations from one upload, enriched with match + owner + notify state for the
 * admin review screen. Matched rows are resolved to their owning company and recipient
 * count in batch (no N+1); the notified flag reflects the alert ledger.
 */
export async function listUploadViolations(uploadId: string): Promise<UploadViolation[]> {
    const rows = await db
        .select({
            id: cvViolations.id,
            recordNumber: cvViolations.recordNumber,
            rawAddress: cvViolations.rawAddress,
            violationDate: cvViolations.violationDate,
            applicationName: cvViolations.applicationName,
            status: cvViolations.status,
            matchMethod: cvViolations.matchMethod,
            matchConfidence: cvViolations.matchConfidence,
            reviewStatus: cvViolations.reviewStatus,
            propertyId: cvViolations.propertyId,
            matchedAddress: addresses.formattedStreetAddress,
        })
        .from(cvViolations)
        .leftJoin(addresses, eq(addresses.propertyId, cvViolations.propertyId))
        .where(eq(cvViolations.sourceUploadId, uploadId))
        .orderBy(desc(cvViolations.matchMethod), desc(cvViolations.violationDate));

    const violationIds = rows.map((r) => r.id);
    const matchedPropertyIds = rows.flatMap((r) => (r.propertyId ? [r.propertyId] : []));

    const [ownersByProperty, notifiedIds] = await Promise.all([
        resolveOwnersForProperties(matchedPropertyIds),
        violationIds.length > 0
            ? db
                  .select({ cvViolationId: cvNotificationsSent.cvViolationId })
                  .from(cvNotificationsSent)
                  .where(inArray(cvNotificationsSent.cvViolationId, violationIds))
            : Promise.resolve([]),
    ]);

    const notifiedSet = new Set(notifiedIds.map((n) => n.cvViolationId));

    return rows.map((r) => {
        const owner = r.propertyId ? ownersByProperty.get(r.propertyId) : undefined;
        return {
            id: r.id,
            recordNumber: r.recordNumber,
            rawAddress: r.rawAddress,
            violationDate: r.violationDate,
            applicationName: r.applicationName,
            status: r.status,
            matchMethod: r.matchMethod,
            matchConfidence: r.matchConfidence,
            reviewStatus: r.reviewStatus,
            propertyId: r.propertyId,
            matchedAddress: r.matchedAddress,
            ownerCompany: owner ? formatCompanyName(owner.companyName) : null,
            recipientCount: owner?.userIds.length ?? 0,
            notified: notifiedSet.has(r.id),
        };
    });
}
