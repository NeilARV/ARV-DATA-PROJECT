import { db } from "server/storage";
import { marketScanQueue } from "@database/schemas/sync.schema";
import { normalizeDateToYMD } from "server/utils/normalization";
import { and, eq, inArray, ne } from "drizzle-orm";
import type { BuyersMarketRecord } from "./get-market";
import type { MarketScanWindow } from "@database/types/sync";

export interface InsertQueueParams {
    records: BuyersMarketRecord[];
    msaId: number;
    scanWindow: MarketScanWindow;
    msaName: string;
}

export interface InsertQueueResult {
    attempted: number;
    inserted: number;
    skipped: number;
}

function toRow(
    record: BuyersMarketRecord,
    msaId: number,
    scanWindow: MarketScanWindow
): typeof marketScanQueue.$inferInsert | null {
    const sfrMarketId = record.id as number | null | undefined;
    const sfrPropertyId = record.propertyId as number | null | undefined;
    const saleDate = normalizeDateToYMD(record.saleDate as string | undefined);
    const recordingDate = normalizeDateToYMD(record.recordingDate as string | undefined);

    // Both IDs and both dates are required — skip malformed records
    if (!sfrMarketId || !sfrPropertyId || !saleDate || !recordingDate) {
        return null;
    }

    const saleValue = record.saleValue != null ? String(record.saleValue) : null;

    return {
        sfrMarketId,
        sfrPropertyId,
        address: (record.address as string) || null,
        city: (record.city as string) || null,
        state: (record.state as string) || null,
        zipCode: (record.zipCode as string) || null,
        msaId,
        saleDate,
        recordingDate,
        buyerName: (record.buyerName as string) || null,
        sellerName: (record.sellerName as string) || null,
        saleValue,
        lenderName: (record.lenderName as string) || null,
        isCorporate: typeof record.isCorporate === "boolean" ? record.isCorporate : null,
        isPrivateLender: typeof record.isPrivateLender === "boolean" ? record.isPrivateLender : null,
        propertyType: (record.propertyType as string) || null,
        rawData: record as Record<string, unknown>,
        status: "pending",
        scanWindow,
    };
}

/**
 * Inserts new market records into market_scan_queue, deduplicating by sfr_property_id.
 *
 * For each incoming record, checks existing queue rows for the same property:
 *  - If an existing row has recording_date >= incoming → skip (already queued or processed)
 *  - If incoming is more recent → delete stale non-processing rows, insert new pending row
 *
 * This replaces the previous sfr_market_id-based ON CONFLICT approach, which was broken
 * because the SFR API reassigns market IDs to the same transactions on every scan run.
 */
export async function insertQueue(params: InsertQueueParams): Promise<InsertQueueResult> {
    const { records, msaId, scanWindow, msaName } = params;
    const label = `[SCAN:${scanWindow}][${msaName}]`;

    if (records.length === 0) {
        console.log(`${label} No records to insert`);
        return { attempted: 0, inserted: 0, skipped: 0 };
    }

    // Map to DB rows, dropping any malformed records
    const rows = records
        .map((r) => toRow(r, msaId, scanWindow))
        .filter((r): r is NonNullable<typeof r> => r !== null);

    const malformed = records.length - rows.length;
    if (malformed > 0) {
        console.warn(`${label} Dropped ${malformed} malformed records (missing id, propertyId, or dates)`);
    }

    // Deduplicate candidates by sfrPropertyId, keeping the most recent recordingDate
    const candidateMap = new Map<number, typeof rows[number]>();
    for (const row of rows) {
        const existing = candidateMap.get(row.sfrPropertyId);
        if (!existing || row.recordingDate > existing.recordingDate) {
            candidateMap.set(row.sfrPropertyId, row);
        }
    }
    const candidates = Array.from(candidateMap.values());

    // Query all existing queue rows for these property IDs
    const propertyIds = candidates.map(r => r.sfrPropertyId);
    const existingRows = await db
        .select({
            sfrPropertyId: marketScanQueue.sfrPropertyId,
            recordingDate: marketScanQueue.recordingDate,
        })
        .from(marketScanQueue)
        .where(
            and(
                eq(marketScanQueue.msaId, msaId),
                inArray(marketScanQueue.sfrPropertyId, propertyIds)
            )
        );

    // Build map: sfrPropertyId → most recent recording_date in the queue (any status)
    const latestInQueue = new Map<number, string>();
    for (const row of existingRows) {
        const current = latestInQueue.get(row.sfrPropertyId);
        const rd = row.recordingDate ?? "";
        if (!current || rd > current) {
            latestInQueue.set(row.sfrPropertyId, rd);
        }
    }

    // Partition candidates: skip (not newer) vs insert (more recent or brand new)
    const toInsert: typeof candidates = [];
    const propertyIdsWithStaleRows: number[] = [];
    let skippedCount = 0;

    for (const candidate of candidates) {
        const queuedDate = latestInQueue.get(candidate.sfrPropertyId);
        if (queuedDate !== undefined && queuedDate >= candidate.recordingDate) {
            // Already have this transaction (or a more recent one) — skip
            skippedCount++;
        } else {
            toInsert.push(candidate);
            if (queuedDate !== undefined) {
                // Existing rows are older — schedule them for cleanup
                propertyIdsWithStaleRows.push(candidate.sfrPropertyId);
            }
        }
    }

    if (toInsert.length === 0) {
        console.log(`${label} Queue insert: 0 new, ${skippedCount} already up-to-date (${rows.length} attempted)`);
        return { attempted: rows.length, inserted: 0, skipped: skippedCount };
    }

    // Remove stale rows (skip any currently processing to avoid mid-run conflicts)
    if (propertyIdsWithStaleRows.length > 0) {
        const deleted = await db
            .delete(marketScanQueue)
            .where(
                and(
                    eq(marketScanQueue.msaId, msaId),
                    inArray(marketScanQueue.sfrPropertyId, propertyIdsWithStaleRows),
                    ne(marketScanQueue.status, "processing")
                )
            )
            .returning({ sfrPropertyId: marketScanQueue.sfrPropertyId });

        if (deleted.length > 0) {
            console.log(`${label} Removed ${deleted.length} stale queue row(s) superseded by newer transactions`);
        }
    }

    // Insert new rows — sfrMarketId conflict guard kept as a safety net for concurrent runs
    const inserted = await db
        .insert(marketScanQueue)
        .values(toInsert)
        .onConflictDoNothing({ target: marketScanQueue.sfrMarketId })
        .returning({ sfrPropertyId: marketScanQueue.sfrPropertyId });

    const insertedCount = inserted.length;

    console.log(
        `${label} Queue insert: ${insertedCount} new, ${skippedCount} already up-to-date (${rows.length} attempted)`
    );

    return {
        attempted: rows.length,
        inserted: insertedCount,
        skipped: skippedCount,
    };
}