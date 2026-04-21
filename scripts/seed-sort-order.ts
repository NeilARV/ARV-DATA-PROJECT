/**
 * One-time script: seeds sort_order on all property_transactions.
 *
 * Usage:
 *   npm run seed:sort-order
 */

import "dotenv/config";
import { db } from "server/storage";
import { properties, propertyTransactions } from "@database/schemas/properties.schema";
import { eq, desc, asc } from "drizzle-orm";
import { sortTransactionsDesc } from "server/utils/orderTransactions";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateStr(d: Date | string | null | undefined): string | null {
    if (d == null) return null;
    if (typeof d === "string") return d.split("T")[0] ?? null;
    return (d as Date).toISOString().split("T")[0] ?? null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    const allProperties = await db
        .select({ id: properties.id })
        .from(properties)
        .orderBy(asc(properties.id));

    console.log(`[seed-sort-order] Processing ${allProperties.length} properties...`);

    let totalTx = 0;
    let totalProps = 0;
    let skipped = 0;

    for (const { id } of allProperties) {

        console.log(`[seed-sort-order] Processing property ID ${id}`);

        const txs = await db
            .select()
            .from(propertyTransactions)
            .where(eq(propertyTransactions.propertyId, id))
            .orderBy(
                desc(propertyTransactions.recordingDate),
                desc(propertyTransactions.propertyTransactionsId)
            );

        if (txs.length === 0) {
            skipped++;
            continue;
        }

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

        console.log(`[seed-sort-order] Finished processing property ID ${id}`);
    }

    console.log(`[seed-sort-order] Done.`);
    console.log(`  Properties updated : ${totalProps}`);
    console.log(`  Properties skipped : ${skipped} (no transactions)`);
    console.log(`  Transactions sorted: ${totalTx}`);
}

main()
    .catch((err) => {
        console.error("[seed-sort-order] Fatal error:", err);
        process.exit(1);
    })
    .finally(() => process.exit(0));
