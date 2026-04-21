/**
 * One-time script: seeds sort_order on property_transactions.
 *
 * Modes (set via SEED_MODE env var or CLI arg):
 *   preview   — process at most 5 properties (default)
 *   full      — process every property
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.json scripts/seed-sort-order.ts preview
 *   npx tsx --tsconfig tsconfig.json scripts/seed-sort-order.ts full
 */

import "dotenv/config";
import { db } from "server/storage";
import { properties, propertyTransactions } from "@database/schemas/properties.schema";
import { eq, desc, asc } from "drizzle-orm";
import { sortTransactionsDesc } from "server/utils/orderTransactions";

// ─── Config ───────────────────────────────────────────────────────────────────

const MODE = (process.argv[2] ?? process.env.SEED_MODE ?? "preview") as "preview" | "full";
const PREVIEW_LIMIT = 5;

if (MODE !== "preview" && MODE !== "full") {
    console.error(`Unknown mode "${MODE}". Use "preview" or "full".`);
    process.exit(1);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateStr(d: Date | string | null | undefined): string | null {
    if (d == null) return null;
    if (typeof d === "string") return d.split("T")[0] ?? null;
    return (d as Date).toISOString().split("T")[0] ?? null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log(`\n[seed-sort-order] Mode: ${MODE.toUpperCase()}`);
    if (MODE === "preview") {
        console.log(`[seed-sort-order] Preview: processing at most ${PREVIEW_LIMIT} properties.\n`);
    }

    const allProperties = await db
        .select({ id: properties.id })
        .from(properties)
        .orderBy(asc(properties.id));

    const batch = MODE === "preview" ? allProperties.slice(0, PREVIEW_LIMIT) : allProperties;

    console.log(`[seed-sort-order] Properties in DB: ${allProperties.length}`);
    console.log(`[seed-sort-order] Properties to process: ${batch.length}\n`);

    let totalTx = 0;
    let totalProps = 0;
    let skipped = 0;

    for (const { id } of batch) {
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

        // Sort using the existing algorithm (same one used everywhere in the app)
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

        // Assign sort_order: 1 = most recent (displayed first)
        for (let i = 0; i < sorted.length; i++) {
            const tx = sorted[i] as typeof txs[number];
            await db
                .update(propertyTransactions)
                .set({ sortOrder: i + 1 })
                .where(eq(propertyTransactions.propertyTransactionsId, tx.propertyTransactionsId));
        }

        if (MODE === "preview") {
            console.log(`  Property ${id}: ${txs.length} transaction(s) ordered`);
            sorted.forEach((tx: TxWithStrDates, i: number) => {
                console.log(
                    `    [${i + 1}] id=${tx.propertyTransactionsId}  type=${tx.transactionType ?? "—"}  recording=${tx.recordingDate ?? "—"}`
                );
            });
        }

        totalTx += txs.length;
        totalProps++;
    }

    console.log(`\n[seed-sort-order] Done.`);
    console.log(`  Properties updated : ${totalProps}`);
    console.log(`  Properties skipped : ${skipped} (no transactions)`);
    console.log(`  Transactions sorted: ${totalTx}`);
    if (MODE === "preview") {
        console.log(`\n  Looks good? Re-run with "full" to process all ${allProperties.length} properties.`);
    }
}

main()
    .catch((err) => {
        console.error("[seed-sort-order] Fatal error:", err);
        process.exit(1);
    })
    .finally(() => process.exit(0));
