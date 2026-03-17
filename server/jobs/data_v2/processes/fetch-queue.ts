import { db } from "server/storage";
import { marketScanQueue } from "@database/schemas/sync.schema";
import { eq, and, inArray, desc } from "drizzle-orm";
import type { MarketScanQueue } from "@database/types/sync";

export interface FetchQueueResult {
    /** One deduplicated row per sfr_property_id (best recording_date → sale_date). */
    rows: MarketScanQueue[];
    /** All sfr_property_ids matched (including duplicates across scan windows). */
    allPropertyIds: number[];
}

/**
 * Reads up to BATCH_SIZE unique pending rows from market_scan_queue for the given MSA.
 *
 * Deduplication is done at the DB level via DISTINCT ON sfr_property_id, ordered by
 * recording_date DESC then sale_date DESC — so the most recent transaction per property
 * is chosen. Returns both the deduplicated rows (for processing) and ALL sfr_property_ids
 * that match (for bulk status updates, covering cross-window duplicates).
 */
export async function fetchQueue(msaId: number, msaName: string, limit: number): Promise<FetchQueueResult> {
    const label = `[CONSUMER][${msaName}]`;

    // Inner query: DISTINCT ON sfr_property_id picks the most recent transaction per property.
    // Outer query: re-sorts by recording_date DESC so the batch prioritizes the newest
    // properties across all pending rows, then applies LIMIT.
    const deduped = db
        .selectDistinctOn([marketScanQueue.sfrPropertyId])
        .from(marketScanQueue)
        .where(
            and(
                eq(marketScanQueue.msaId, msaId),
                eq(marketScanQueue.status, "pending")
            )
        )
        .orderBy(
            marketScanQueue.sfrPropertyId,
            desc(marketScanQueue.recordingDate),
            desc(marketScanQueue.saleDate)
        )
        .as("deduped");

    const deduplicated = await db
        .select()
        .from(deduped)
        .orderBy(desc(deduped.recordingDate), desc(deduped.saleDate))
        .limit(limit);

    if (deduplicated.length === 0) {
        return { rows: [], allPropertyIds: [] };
    }

    const uniquePropertyIds = deduplicated.map((r) => r.sfrPropertyId);

    // Find ALL pending rows sharing these property IDs — other scan windows may have
    // enqueued the same property. We need to mark them all as 'processing' so a
    // concurrent consumer run won't pick them up.
    const allMatching = await db
        .select({ sfrPropertyId: marketScanQueue.sfrPropertyId })
        .from(marketScanQueue)
        .where(
            and(
                eq(marketScanQueue.msaId, msaId),
                eq(marketScanQueue.status, "pending"),
                inArray(marketScanQueue.sfrPropertyId, uniquePropertyIds)
            )
        );

    const allPropertyIds = Array.from(new Set(allMatching.map((r) => r.sfrPropertyId)));

    console.log(
        `${label} Fetched ${deduplicated.length} unique properties ` +
        `(${allPropertyIds.length} total pending queue rows across scan windows)`
    );

    return { rows: deduplicated, allPropertyIds };
}