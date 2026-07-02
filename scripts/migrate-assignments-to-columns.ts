/**
 * One-time migration: moves assignments from a separate transaction row to columns on
 * the actual arms-length sale row.
 *
 * Old model: an assignment was its own property_transactions row (transaction_type =
 * 'assignment') whose buyer_id matched the recorded arms-length sale and whose seller
 * was the assignor. New model: the sale row carries is_assignment / assignor_id /
 * assignor_name directly (see database/schemas/properties.schema.ts).
 *
 * Steps (all additive / idempotent where possible):
 *   1. ALTER TABLE property_transactions — add is_assignment, assignor_id, assignor_name
 *      (IF NOT EXISTS) + the assignor index. Run instead of `db:push` to avoid the
 *      unrelated market_scan_queue drift prompt.
 *   2. For each remaining 'assignment' row, find its target sale row — the arms-length
 *      row with the same buyer_id (falling back to the row immediately preceding it in
 *      sort order) — copy the assignor onto it, then delete the assignment row.
 *
 * An assignment whose target sale can't be found is left in place and logged, so no data
 * is silently lost. Safe to re-run: step 1 is IF NOT EXISTS; step 2 is empty once every
 * 'assignment' row has been converted.
 *
 * Usage: npx tsx scripts/migrate-assignments-to-columns.ts
 */

import 'dotenv/config';
import { sql, eq, and, asc } from 'drizzle-orm';
import { db } from 'server/storage';
import { propertyTransactions } from '@database/schemas/properties.schema';

async function addColumns(): Promise<void> {
    console.log('[migrate-assignments] Adding columns + index (IF NOT EXISTS) ...');
    await db.execute(
        sql`ALTER TABLE property_transactions ADD COLUMN IF NOT EXISTS is_assignment boolean NOT NULL DEFAULT false`,
    );
    await db.execute(
        sql`ALTER TABLE property_transactions ADD COLUMN IF NOT EXISTS assignor_id uuid REFERENCES companies(id) ON DELETE SET NULL`,
    );
    await db.execute(
        sql`ALTER TABLE property_transactions ADD COLUMN IF NOT EXISTS assignor_name varchar(200)`,
    );
    await db.execute(
        sql`CREATE INDEX IF NOT EXISTS idx_pt_assignor ON property_transactions (assignor_id)`,
    );
}

/** Finds the sale row an assignment belongs to: same buyer_id + arms length, most recent. */
async function findTargetByBuyer(
    propertyId: string,
    buyerId: string,
): Promise<number | null> {
    const [row] = await db
        .select({ id: propertyTransactions.propertyTransactionsId })
        .from(propertyTransactions)
        .where(
            and(
                eq(propertyTransactions.propertyId, propertyId),
                eq(propertyTransactions.buyerId, buyerId),
                sql`LOWER(TRIM(${propertyTransactions.transactionType})) = 'arms length'`,
            ),
        )
        .orderBy(asc(propertyTransactions.sortOrder))
        .limit(1);
    return row?.id ?? null;
}

/** Fallback: the arms-length row immediately preceding the assignment in sort order. */
async function findTargetByPosition(
    propertyId: string,
    sortOrder: number,
): Promise<number | null> {
    const [row] = await db
        .select({ id: propertyTransactions.propertyTransactionsId })
        .from(propertyTransactions)
        .where(
            and(
                eq(propertyTransactions.propertyId, propertyId),
                eq(propertyTransactions.sortOrder, sortOrder - 1),
                sql`LOWER(TRIM(${propertyTransactions.transactionType})) = 'arms length'`,
            ),
        )
        .limit(1);
    return row?.id ?? null;
}

async function convertAssignments(): Promise<void> {
    const assignments = await db
        .select({
            id: propertyTransactions.propertyTransactionsId,
            propertyId: propertyTransactions.propertyId,
            buyerId: propertyTransactions.buyerId,
            sellerId: propertyTransactions.sellerId,
            sellerName: propertyTransactions.sellerName,
            sortOrder: propertyTransactions.sortOrder,
        })
        .from(propertyTransactions)
        .where(sql`LOWER(TRIM(${propertyTransactions.transactionType})) = 'assignment'`);

    console.log(`[migrate-assignments] Found ${assignments.length} assignment row(s) to convert.`);

    let converted = 0;
    let unmatched = 0;
    let collisions = 0;

    // A sale row can only carry one assignor. If two assignments resolve to the same target
    // row, converting both would silently overwrite the first assignor (last-write-wins), so
    // we claim each target once and leave any colliding assignment in place for manual review.
    const usedTargets = new Set<number>();

    for (const a of assignments) {
        let targetId: number | null = null;
        if (a.buyerId) targetId = await findTargetByBuyer(a.propertyId, a.buyerId);
        if (targetId == null && a.sortOrder != null) {
            targetId = await findTargetByPosition(a.propertyId, a.sortOrder);
        }

        if (targetId == null) {
            unmatched += 1;
            console.warn(
                `[migrate-assignments] No sale row found for assignment ${a.id} (property ${a.propertyId}); leaving it in place.`,
            );
            continue;
        }

        if (usedTargets.has(targetId)) {
            collisions += 1;
            console.warn(
                `[migrate-assignments] Sale row ${targetId} already has an assignor from another ` +
                    `assignment; leaving assignment ${a.id} (property ${a.propertyId}) in place to ` +
                    `avoid overwriting it.`,
            );
            continue;
        }
        usedTargets.add(targetId);

        await db
            .update(propertyTransactions)
            .set({
                isAssignment: true,
                assignorId: a.sellerId,
                assignorName: a.sellerName,
                updatedAt: new Date(),
            })
            .where(eq(propertyTransactions.propertyTransactionsId, targetId));

        await db
            .delete(propertyTransactions)
            .where(eq(propertyTransactions.propertyTransactionsId, a.id));

        converted += 1;
    }

    console.log(
        `[migrate-assignments] Converted ${converted}, left ${unmatched} unmatched + ` +
            `${collisions} colliding in place.`,
    );
}

async function main() {
    await addColumns();
    await convertAssignments();
    console.log('[migrate-assignments] Done.');
}

main()
    .catch((err) => {
        console.error('[migrate-assignments] Fatal error:', err);
        process.exit(1);
    })
    .finally(() => process.exit(0));
