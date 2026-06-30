import { db } from 'server/storage';
import { and, count, eq, inArray, lt, ne } from 'drizzle-orm';
import { cvUploads, cvViolations } from '@database/schemas/code-violations.schema';
import type { CvProcessingStatus } from '@database/types/code-violations';

/**
 * Reset complaints stuck in `processing` past `staleMinutes` back to `pending` so the next run
 * retries them. Recovers rows orphaned by a crash or restart mid-batch. `updated_at` (bumped by
 * {@link markProcessing}) is the staleness proxy. Called once at the top of a consumer run.
 *
 * @param staleMinutes age after which a `processing` row is considered orphaned
 * @returns how many rows were reset
 */
export async function resetStaleProcessing(staleMinutes = 30): Promise<number> {
    const cutoff = new Date(Date.now() - staleMinutes * 60 * 1000);
    const reset = await db
        .update(cvViolations)
        .set({ processingStatus: 'pending', updatedAt: new Date() })
        .where(and(eq(cvViolations.processingStatus, 'processing'), lt(cvViolations.updatedAt, cutoff)))
        .returning({ id: cvViolations.id });
    return reset.length;
}

/**
 * Soft-lock a batch: mark the given complaints `processing` so a concurrent run won't pick them up.
 * Bumps `updated_at`, which {@link resetStaleProcessing} reads as the lock's age.
 */
export async function markProcessing(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await db
        .update(cvViolations)
        .set({ processingStatus: 'processing', updatedAt: new Date() })
        .where(inArray(cvViolations.id, ids));
}

/** Set a terminal/non-terminal status on one complaint, persisting its normalized address. */
async function setStatus(
    id: string,
    status: CvProcessingStatus,
    normalizedAddress: string,
    options?: { notified?: boolean; terminal?: boolean },
): Promise<void> {
    const terminal = options?.terminal ?? true;
    await db
        .update(cvViolations)
        .set({
            processingStatus: status,
            normalizedAddress,
            notified: options?.notified ?? false,
            updatedAt: new Date(),
            // `processed_at` marks reaching a *terminal* status; awaiting_review is not terminal.
            ...(terminal ? { processedAt: new Date() } : {}),
        })
        .where(eq(cvViolations.id, id));
}

/** Address isn't a property we track → terminal `no_match`. */
export async function markNoMatch(id: string, normalizedAddress: string): Promise<void> {
    await setStatus(id, 'no_match', normalizedAddress);
}

/** Address matched more than one property → terminal `ambiguous` (needs a human). */
export async function markAmbiguous(id: string, normalizedAddress: string): Promise<void> {
    await setStatus(id, 'ambiguous', normalizedAddress);
}

/**
 * Matched + recipients identified, email held for the admin's Approve (§4.6 dry-run gate).
 * Not terminal — flips to `complete` once approved (Chunk D).
 */
export async function markAwaitingReview(id: string, normalizedAddress: string): Promise<void> {
    await setStatus(id, 'awaiting_review', normalizedAddress, { terminal: false });
}

/**
 * Finish a complaint through-and-through. `notified` is the hard "an email actually fired" flag;
 * it stays `false` when there was nobody to email (individual owner / company with no users) or the
 * row was a ##TMP→CE duplicate already alerted elsewhere.
 */
export async function markComplete(
    id: string,
    params: { normalizedAddress: string; notified: boolean },
): Promise<void> {
    await setStatus(id, 'complete', params.normalizedAddress, { notified: params.notified });
}

/** Something threw while processing this complaint → terminal `failed` with the reason. No auto-retry. */
export async function markFailed(id: string, message: string): Promise<void> {
    await db
        .update(cvViolations)
        .set({
            processingStatus: 'failed',
            errorMessage: message.slice(0, 500),
            processedAt: new Date(),
            updatedAt: new Date(),
        })
        .where(eq(cvViolations.id, id));
}

/**
 * Recompute an upload's roll-up status + counters from its complaints' current statuses, so the
 * admin panel reflects the consumer's progress. Idempotent — derived purely from the rows, never
 * incremented in place. A `failed` upload (ingest error) is left untouched.
 *
 * Status: any `pending`/`processing` rows → `processing`; else any `awaiting_review` → `review`;
 * else `completed` (stamps `finished_at`). In the consumer's routing, `complete` and
 * `awaiting_review` both imply a matched complaint, so they count as matched; every other settled
 * status (`no_match`, `ambiguous`, `failed`) didn't resolve to one property, so it counts as
 * unmatched — together they account for all settled rows so none silently vanish from the counters.
 *
 * @param uploadId the `cv_uploads` row to refresh (a complaint's `first_seen_upload_id`)
 */
export async function refreshUploadStatus(uploadId: string): Promise<void> {
    const rows = await db
        .select({ status: cvViolations.processingStatus, n: count() })
        .from(cvViolations)
        .where(eq(cvViolations.firstSeenUploadId, uploadId))
        .groupBy(cvViolations.processingStatus);

    const counts: Record<string, number> = {};
    for (const row of rows) counts[row.status] = Number(row.n);

    const inFlight = (counts['pending'] ?? 0) + (counts['processing'] ?? 0);
    const awaitingReview = counts['awaiting_review'] ?? 0;
    const matched = (counts['complete'] ?? 0) + awaitingReview;
    const unmatched =
        (counts['no_match'] ?? 0) + (counts['ambiguous'] ?? 0) + (counts['failed'] ?? 0);

    let status: string;
    if (inFlight > 0) status = 'processing';
    else if (awaitingReview > 0) status = 'review';
    else status = 'completed';

    await db
        .update(cvUploads)
        .set({
            status,
            rowsMatched: matched,
            rowsUnmatched: unmatched,
            finishedAt: status === 'completed' ? new Date() : null,
        })
        // Don't resurrect an upload that failed at ingest.
        .where(and(eq(cvUploads.id, uploadId), ne(cvUploads.status, 'failed')));
}
