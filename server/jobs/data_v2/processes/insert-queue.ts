import { db } from "server/storage";
import { marketScanQueue } from "@database/schemas/sync.schema";
import { normalizeDateToYMD } from "server/utils/normalization";
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
 * Bulk inserts filtered market records into market_scan_queue.
 * Records with a duplicate sfr_market_id (already enqueued by a previous scan
 * of any window) are silently skipped via ON CONFLICT DO NOTHING.
 *
 * Returns counts of attempted, actually inserted, and skipped rows.
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

    // Single bulk insert — ON CONFLICT on sfr_market_id unique constraint skips duplicates
    const inserted = await db
        .insert(marketScanQueue)
        .values(rows)
        .onConflictDoNothing({ target: marketScanQueue.sfrMarketId })
        .returning({ sfrMarketId: marketScanQueue.sfrMarketId });

    const insertedCount = inserted.length;
    const skippedCount = rows.length - insertedCount;

    console.log(
        `${label} Queue insert: ${insertedCount} new, ${skippedCount} already existed (${rows.length} attempted)`
    );

    return {
        attempted: rows.length,
        inserted: insertedCount,
        skipped: skippedCount,
    };
}
