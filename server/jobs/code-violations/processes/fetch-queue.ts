import { db } from 'server/storage';
import { asc, eq } from 'drizzle-orm';
import { cvViolations } from '@database/schemas/code-violations.schema';
import { CV_PROCESSING_STATUS } from '@database/validation/code-violations.validation';
import type { CvViolation } from '@database/types/code-violations';

/**
 * Pull the next batch of `pending` complaints for the consumer to process, oldest first.
 *
 * Rides the `(processing_status, created_at)` index on `cv_violations` so the fetch stays cheap as
 * the table grows. The caller marks the returned rows `processing` (soft lock) before doing any work
 * — see `markProcessing` in `mark-status.ts`.
 *
 * @param limit max rows to return (the consumer's `CV_BATCH_SIZE`)
 * @returns the pending violation rows, ordered by `created_at` ascending
 */
export async function fetchPendingViolations(limit: number): Promise<CvViolation[]> {
    if (limit <= 0) return [];
    return db
        .select()
        .from(cvViolations)
        .where(eq(cvViolations.processingStatus, CV_PROCESSING_STATUS.PENDING))
        .orderBy(asc(cvViolations.createdAt))
        .limit(limit);
}
