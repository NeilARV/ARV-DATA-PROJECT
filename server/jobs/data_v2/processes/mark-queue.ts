import { db } from "server/storage";
import { marketScanQueue } from "@database/schemas/sync.schema";
import { and, eq, inArray, lt } from "drizzle-orm";

/**
 * Resets queue rows that have been stuck in 'processing' for longer than
 * staleMinutes back to 'pending' so they will be retried on the next consumer run.
 *
 * This handles rows orphaned by a server crash or restart mid-consumer-run.
 * Since markProcessing does not record a start timestamp, we use enqueuedAt as
 * the staleness proxy — any row enqueued more than staleMinutes ago that is
 * still in 'processing' was never completed and is safe to retry.
 *
 * Called once at the top of runConsumer() before any batch work begins.
 * Returns the number of rows reset.
 */
export async function resetStaleProcessing(staleMinutes: number = 60): Promise<number> {
    const cutoff = new Date(Date.now() - staleMinutes * 60 * 1000);
    const reset = await db
        .update(marketScanQueue)
        .set({ status: "pending", errorMessage: null })
        .where(
            and(
                eq(marketScanQueue.status, "processing"),
                lt(marketScanQueue.enqueuedAt, cutoff)
            )
        )
        .returning({ id: marketScanQueue.id });
    return reset.length;
}

/**
 * Sets all matching queue rows to 'processing' to prevent concurrent consumer
 * runs from picking up the same properties.
 */
export async function markProcessing(msaId: number, sfrPropertyIds: number[]): Promise<void> {
    if (sfrPropertyIds.length === 0) return;
    await db
        .update(marketScanQueue)
        .set({ status: "processing" })
        .where(
            and(
                eq(marketScanQueue.msaId, msaId),
                inArray(marketScanQueue.sfrPropertyId, sfrPropertyIds)
            )
        );
}

/**
 * Marks all matching queue rows as 'complete' with a processedAt timestamp.
 * Covers the deduplicated row AND any duplicates from other scan windows.
 */
export async function markComplete(msaId: number, sfrPropertyIds: number[]): Promise<void> {
    if (sfrPropertyIds.length === 0) return;
    await db
        .update(marketScanQueue)
        .set({ status: "complete", processedAt: new Date() })
        .where(
            and(
                eq(marketScanQueue.msaId, msaId),
                inArray(marketScanQueue.sfrPropertyId, sfrPropertyIds)
            )
        );
}

/**
 * Marks all matching queue rows as 'failed' with the error message.
 * Failed rows are not automatically retried — they require manual review or a
 * separate retry mechanism.
 */
export async function markFailed(
    msaId: number,
    sfrPropertyIds: number[],
    error: string
): Promise<void> {
    if (sfrPropertyIds.length === 0) return;
    await db
        .update(marketScanQueue)
        .set({ status: "failed", errorMessage: error.slice(0, 500) })
        .where(
            and(
                eq(marketScanQueue.msaId, msaId),
                inArray(marketScanQueue.sfrPropertyId, sfrPropertyIds)
            )
        );
}