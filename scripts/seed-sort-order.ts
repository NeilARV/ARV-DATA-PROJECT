/**
 * One-time script: re-seeds sort_order on ALL property_transactions using the
 * current sortTransactionsDesc algorithm (includes chain detection).
 *
 * Safe to re-run — idempotent. Processes all properties so stale sort_orders
 * assigned by older pipeline versions are also corrected.
 *
 * Usage:
 *   npm run seed:sort-order
 */

import "dotenv/config";
import { db } from "server/storage";
import { properties, propertyTransactions } from "@database/schemas/properties.schema";
import { eq, desc, sql } from "drizzle-orm";
import { sortTransactionsDesc } from "server/utils/orderTransactions";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateStr(d: Date | string | null | undefined): string | null {
    if (d == null) return null;
    if (typeof d === "string") return d.split("T")[0] ?? null;
    return (d as Date).toISOString().split("T")[0] ?? null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const BATCH_SIZE = 500;

async function main() {
    const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(properties);

    const total = Number(count);
    console.log(`[seed-sort-order] Total properties to process: ${total}`);

    let offset = 0;
    let totalProps = 0;
    let totalTx = 0;

    while (offset < total) {
        const batch = await db
            .select({ id: properties.id })
            .from(properties)
            .orderBy(properties.id)
            .limit(BATCH_SIZE)
            .offset(offset);

        for (const { id } of batch) {
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
        }

        offset += BATCH_SIZE;
        console.log(`[seed-sort-order] ${Math.min(offset, total)} / ${total} properties done...`);
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
