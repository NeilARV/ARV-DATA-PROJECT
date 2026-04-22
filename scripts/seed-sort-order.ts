/**
 * One-time script: seeds sort_order on all property_transactions.
 *
 * Safe to re-run — only processes properties that have at least one
 * transaction with sort_order IS NULL, so a crashed run can be resumed.
 *
 * Usage:
 *   npm run seed:sort-order
 */

import "dotenv/config";
import { db } from "server/storage";
import { propertyTransactions } from "@database/schemas/properties.schema";
import { eq, desc, isNull, max } from "drizzle-orm";
import { sortTransactionsDesc } from "server/utils/orderTransactions";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateStr(d: Date | string | null | undefined): string | null {
    if (d == null) return null;
    if (typeof d === "string") return d.split("T")[0] ?? null;
    return (d as Date).toISOString().split("T")[0] ?? null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    // Only fetch property IDs that still have at least one unsorted transaction.
    // This makes the script safe to resume after a crash.
    const unsortedRows = await db
        .select({
            propertyId: propertyTransactions.propertyId,
            latestDate: max(propertyTransactions.recordingDate),
        })
        .from(propertyTransactions)
        .where(isNull(propertyTransactions.sortOrder))
        .groupBy(propertyTransactions.propertyId)
        .orderBy(desc(max(propertyTransactions.recordingDate)));

    const propertyIds = unsortedRows.map((r) => r.propertyId);

    console.log(`[seed-sort-order] Properties with unsorted transactions: ${propertyIds.length}`);

    if (propertyIds.length === 0) {
        console.log(`[seed-sort-order] Nothing to do — all transactions already have sort_order.`);
        return;
    }

    let totalTx = 0;
    let totalProps = 0;

    for (const id of propertyIds) {

        console.log(`[seed-sort-order] Processing property ${id}...`);
        
        const txs = await db
            .select()
            .from(propertyTransactions)
            .where(eq(propertyTransactions.propertyId, id))
            .orderBy(
                desc(propertyTransactions.recordingDate),
                desc(propertyTransactions.propertyTransactionsId)
            );

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

        totalTx += txs.length;
        totalProps++;

        if (totalProps % 100 === 0) {
            console.log(`[seed-sort-order] ${totalProps} / ${propertyIds.length} properties done...`);
        }

        console.log(`[seed-sort-order] Finished processing property ${id}...`);
    }

    console.log(`[seed-sort-order] Done.`);
    console.log(`Properties updated : ${totalProps}`);
    console.log(`Transactions sorted: ${totalTx}`);
}

main()
    .catch((err) => {
        console.error("[seed-sort-order] Fatal error:", err);
        process.exit(1);
    })
    .finally(() => process.exit(0));
