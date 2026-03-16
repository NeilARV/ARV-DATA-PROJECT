import { db } from "server/storage";
import { marketScanQueue } from "@database/schemas/sync.schema";
import { and, eq, inArray } from "drizzle-orm";

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