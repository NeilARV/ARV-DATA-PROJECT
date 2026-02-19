import { db } from "server/storage";
import { sfrSyncState } from "@database/schemas/sync.schema";
import { eq } from "drizzle-orm";
import { normalizeDateToYMD } from "server/utils/normalization";

/**
 * Fetches the last_sale_date from sfr_sync_state for the given MSA.
 * Returns null if no row exists or last_sale_date is null (caller should use a default start date).
 */
export async function fetchLastSaleDate(msa: string): Promise<string | null> {
    const rows = await db
        .select({ lastSaleDate: sfrSyncState.lastSaleDate })
        .from(sfrSyncState)
        .where(eq(sfrSyncState.msa, msa))
        .limit(1);

    if (rows.length === 0 || rows[0].lastSaleDate == null) {
        return null;
    }
    return normalizeDateToYMD(rows[0].lastSaleDate) ?? null;
}
