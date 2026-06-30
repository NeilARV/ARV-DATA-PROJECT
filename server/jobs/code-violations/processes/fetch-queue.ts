import { db } from 'server/storage';
import { asc, eq, inArray } from 'drizzle-orm';
import { cvViolations } from '@database/schemas/code-violations.schema';
import { CV_PROCESSING_STATUS } from '@database/validation/code-violations.validation';
import type { CvViolation } from '@database/types/code-violations';

/**
 * Atomically claim the next batch of `pending` complaints for the consumer, oldest first: flip them
 * to `processing` and return the claimed rows in a single statement.
 *
 * The claim is one `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)` so two overlapping
 * consumer runs grab disjoint sets instead of both reading the same `pending` rows — a separate
 * SELECT-then-UPDATE (the old soft lock) was advisory only and racy. `SKIP LOCKED` makes the second
 * run skip rows the first has already locked. Bumps `updated_at`, which `resetStaleProcessing` reads
 * as the lock's age. The inner select rides the `(processing_status, created_at)` index.
 *
 * @param limit max rows to claim (the consumer's `CV_BATCH_SIZE`)
 * @returns the claimed violation rows, now `processing`, ordered by `created_at` ascending
 */
export async function claimPendingViolations(limit: number): Promise<CvViolation[]> {
    if (limit <= 0) return [];
    const pendingIds = db
        .select({ id: cvViolations.id })
        .from(cvViolations)
        .where(eq(cvViolations.processingStatus, CV_PROCESSING_STATUS.PENDING))
        .orderBy(asc(cvViolations.createdAt))
        .limit(limit)
        .for('update', { skipLocked: true });

    return db
        .update(cvViolations)
        .set({ processingStatus: CV_PROCESSING_STATUS.PROCESSING, updatedAt: new Date() })
        .where(inArray(cvViolations.id, pendingIds))
        .returning();
}
