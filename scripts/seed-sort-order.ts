/**
 * One-time script: re-seeds sort_order on ALL property_transactions using the
 * current sortTransactionsDesc algorithm (includes chain detection).
 *
 * Processes properties ordered by most-recent transaction recording_date DESC,
 * so the most recently active properties are fixed first.
 *
 * To resume after a cancelled run, set RESUME_FROM_DATE to the last
 * "Batch complete" date you saw in the logs before cancelling.
 * Set to null to process all properties.
 *
 * Usage:
 *   npm run seed:sort-order
 */

import "dotenv/config";
import { db } from "server/storage";
import { properties, propertyTransactions } from "@database/schemas/properties.schema";
import { eq, sql } from "drizzle-orm";
import { sortTransactionsDesc } from "server/utils/orderTransactions";

// ─── Config ───────────────────────────────────────────────────────────────────

// Set to a YYYY-MM-DD string to resume from a specific date, or null to process all.
const RESUME_FROM_DATE: string | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateStr(d: Date | string | null | undefined): string | null {
    if (d == null) return null;
    if (typeof d === "string") return d.split("T")[0] ?? null;
    return (d as Date).toISOString().split("T")[0] ?? null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const BATCH_SIZE = 500;

async function main() {
    const startDate = RESUME_FROM_DATE;

    if (startDate) {
        console.log(`[seed-sort-order] Resuming from ${startDate} (max recording_date <= ${startDate})`);
    } else {
        console.log(`[seed-sort-order] Processing all properties (most recent first)`);
    }

    const allRows = await db
        .select({
            id: properties.id,
            maxRecordingDate: sql<string | null>`MAX(${propertyTransactions.recordingDate})`,
        })
        .from(properties)
        .leftJoin(propertyTransactions, eq(properties.id, propertyTransactions.propertyId))
        .groupBy(properties.id)
        .having(
            startDate
                ? sql`MAX(${propertyTransactions.recordingDate}) <= ${startDate}::date OR MAX(${propertyTransactions.recordingDate}) IS NULL`
                : sql`1=1`
        )
        .orderBy(sql`MAX(${propertyTransactions.recordingDate}) DESC NULLS LAST`);

    const total = allRows.length;
    console.log(`[seed-sort-order] Properties to process: ${total}\n`);

    let totalProps = 0;
    let totalTx = 0;
    let lastRecordingDate: string | null = null;

    for (let offset = 0; offset < total; offset += BATCH_SIZE) {
        const batch = allRows.slice(offset, offset + BATCH_SIZE);

        for (const row of batch) {
            const txs = await db
                .select()
                .from(propertyTransactions)
                .where(eq(propertyTransactions.propertyId, row.id));

            if (txs.length === 0) continue;

            type TxWithStrDates = Omit<typeof txs[number], "recordingDate" | "saleDate"> & {
                recordingDate: string | null;
                saleDate: string | null;
            };

            const sorted = sortTransactionsDesc(
                txs.map((tx): TxWithStrDates => ({
                    ...tx,
                    recordingDate: toDateStr(tx.recordingDate),
                    saleDate: toDateStr(tx.saleDate),
                }))
            );

            for (let i = 0; i < sorted.length; i++) {
                const tx = sorted[i] as typeof txs[number];
                await db
                    .update(propertyTransactions)
                    .set({ sortOrder: i + 1 })
                    .where(eq(propertyTransactions.propertyTransactionsId, tx.propertyTransactionsId));
            }

            lastRecordingDate = toDateStr(row.maxRecordingDate);
            totalTx += txs.length;
            totalProps++;
            console.log(`[seed-sort-order] ${totalProps} / ${total} processed...`);
        }

        const processed = Math.min(offset + BATCH_SIZE, total);
        console.log(`[seed-sort-order] ${processed} / ${total} — last recording_date: ${lastRecordingDate ?? "none"}`);
    }

    console.log(`\n[seed-sort-order] Done.`);
    console.log(`Properties updated : ${totalProps}`);
    console.log(`Transactions sorted: ${totalTx}`);
}

main()
    .catch((err) => {
        console.error("[seed-sort-order] Fatal error:", err);
        process.exit(1);
    })
    .finally(() => process.exit(0));
