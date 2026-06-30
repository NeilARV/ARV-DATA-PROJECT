import { db } from 'server/storage';
import { and, count, eq, lt, ne } from 'drizzle-orm';
import {
    cvNotificationsSent,
    cvUploads,
    cvViolations,
} from '@database/schemas/code-violations.schema';
import {
    CV_PROCESSING_STATUS,
    CV_UPLOAD_STATUS,
} from '@database/validation/code-violations.validation';
import type { CvProcessingStatus, CvUploadStatus } from '@database/types/code-violations';

/**
 * Reset complaints stuck in `processing` past `staleMinutes` back to `pending` so the next run
 * retries them. Recovers rows orphaned by a crash or restart mid-batch. `updated_at` (bumped when a
 * row is claimed by `claimPendingViolations`) is the staleness proxy. Called once at the top of a
 * consumer run.
 *
 * @param staleMinutes age after which a `processing` row is considered orphaned
 * @returns how many rows were reset
 */
export async function resetStaleProcessing(staleMinutes = 30): Promise<number> {
    const cutoff = new Date(Date.now() - staleMinutes * 60 * 1000);
    const reset = await db
        .update(cvViolations)
        .set({ processingStatus: CV_PROCESSING_STATUS.PENDING, updatedAt: new Date() })
        .where(
            and(
                eq(cvViolations.processingStatus, CV_PROCESSING_STATUS.PROCESSING),
                lt(cvViolations.updatedAt, cutoff),
            ),
        )
        .returning({ id: cvViolations.id });
    return reset.length;
}

/** Set a terminal/non-terminal status on one complaint, persisting its normalized address. */
async function setStatus(params: {
    id: string;
    status: CvProcessingStatus;
    normalizedAddress: string;
    notified?: boolean;
    terminal?: boolean;
}): Promise<void> {
    const { id, status, normalizedAddress, notified = false, terminal = true } = params;
    await db
        .update(cvViolations)
        .set({
            processingStatus: status,
            normalizedAddress,
            notified,
            updatedAt: new Date(),
            // `processed_at` marks reaching a *terminal* status; awaiting_review is not terminal.
            ...(terminal ? { processedAt: new Date() } : {}),
        })
        .where(eq(cvViolations.id, id));
}

/** Address isn't a property we track → terminal `no_match`. */
export async function markNoMatch(id: string, normalizedAddress: string): Promise<void> {
    await setStatus({ id, status: CV_PROCESSING_STATUS.NO_MATCH, normalizedAddress });
}

/** Address matched more than one property → terminal `ambiguous` (needs a human). */
export async function markAmbiguous(id: string, normalizedAddress: string): Promise<void> {
    await setStatus({ id, status: CV_PROCESSING_STATUS.AMBIGUOUS, normalizedAddress });
}

/**
 * Matched + recipients identified, email held for the admin's Approve (§4.6 dry-run gate).
 * Not terminal — flips to `complete` once approved (Chunk D).
 */
export async function markAwaitingReview(id: string, normalizedAddress: string): Promise<void> {
    await setStatus({
        id,
        status: CV_PROCESSING_STATUS.AWAITING_REVIEW,
        normalizedAddress,
        terminal: false,
    });
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
    await setStatus({
        id,
        status: CV_PROCESSING_STATUS.COMPLETE,
        normalizedAddress: params.normalizedAddress,
        notified: params.notified,
    });
}

/** Something threw while processing this complaint → terminal `failed` with the reason. No auto-retry. */
export async function markFailed(id: string, message: string): Promise<void> {
    await db
        .update(cvViolations)
        .set({
            processingStatus: CV_PROCESSING_STATUS.FAILED,
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
 * `notifications_sent` is derived from the `cv_notifications_sent` ledger (the emails actually sent
 * for this upload's complaints), so it stays correct across re-approve / retry.
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

    const inFlight =
        (counts[CV_PROCESSING_STATUS.PENDING] ?? 0) + (counts[CV_PROCESSING_STATUS.PROCESSING] ?? 0);
    const awaitingReview = counts[CV_PROCESSING_STATUS.AWAITING_REVIEW] ?? 0;
    const matched = (counts[CV_PROCESSING_STATUS.COMPLETE] ?? 0) + awaitingReview;
    const unmatched =
        (counts[CV_PROCESSING_STATUS.NO_MATCH] ?? 0) +
        (counts[CV_PROCESSING_STATUS.AMBIGUOUS] ?? 0) +
        (counts[CV_PROCESSING_STATUS.FAILED] ?? 0);

    // Count actual deliveries from the ledger so the counter survives retries (derived, not summed).
    const [notifications] = await db
        .select({ n: count() })
        .from(cvNotificationsSent)
        .innerJoin(cvViolations, eq(cvNotificationsSent.violationId, cvViolations.id))
        .where(eq(cvViolations.firstSeenUploadId, uploadId));
    const notificationsSent = Number(notifications?.n ?? 0);

    let status: CvUploadStatus;
    if (inFlight > 0) status = CV_UPLOAD_STATUS.PROCESSING;
    else if (awaitingReview > 0) status = CV_UPLOAD_STATUS.REVIEW;
    else status = CV_UPLOAD_STATUS.COMPLETED;

    await db
        .update(cvUploads)
        .set({
            status,
            rowsMatched: matched,
            rowsUnmatched: unmatched,
            notificationsSent,
            finishedAt: status === CV_UPLOAD_STATUS.COMPLETED ? new Date() : null,
        })
        // Don't resurrect an upload that failed at ingest.
        .where(and(eq(cvUploads.id, uploadId), ne(cvUploads.status, CV_UPLOAD_STATUS.FAILED)));
}
