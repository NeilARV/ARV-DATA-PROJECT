import { db } from "server/storage";
import { sfrSyncState } from "@database/schemas/sync.schema";

/**
 * Updates last_sale_date in sfr_sync_state for the given MSA.
 * Uses upsert so the row is created on first run. Call with the next day to
 * process (e.g. last_sale_date + 1) after successfully processing one day.
 */
export async function updateLastSaleDate(
    msa: string,
    cityCode: string,
    newLastSaleDate: string
): Promise<void> {
    await db
        .insert(sfrSyncState)
        .values({
            msa,
            lastSaleDate: newLastSaleDate,
            lastSyncAt: new Date(),
        })
        .onConflictDoUpdate({
            target: sfrSyncState.msa,
            set: {
                lastSaleDate: newLastSaleDate,
                lastSyncAt: new Date(),
            },
        });

    console.log(
        `[${cityCode} SYNC] Updated sfr_sync_state last_sale_date to ${newLastSaleDate} for MSA: ${msa}`
    );
}
