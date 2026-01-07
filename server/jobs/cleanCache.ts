import { db } from "server/storage"
import { streetviewCache } from "@shared/schema"
import { lt, eq, or } from "drizzle-orm";

export async function CleanCache() {
    try {
        console.log("[CLEAN CACHE CRON] Running streetview cache clean up");

        const now = new Date();

        const rowsToDelete = await db.select().from(streetviewCache).where(
            or(
                lt(streetviewCache.expiresAt, now),
                eq(streetviewCache.metadataStatus, "REQUEST_DENIED")
            )
        )

        if (rowsToDelete.length > 0) {
            
            console.log(`[CLEAN CACHE CRON] Found ${rowsToDelete.length} entries to remove:`);
            
            const expiredCount = rowsToDelete.filter(row => row.expiresAt < now).length;
            const deniedCount = rowsToDelete.filter(row => row.metadataStatus === "REQUEST_DENIED").length;
            
            console.log(`  - ${expiredCount} expired entries`);
            console.log(`  - ${deniedCount} REQUEST_DENIED entries`);
            
            // Optional: log details of each row
            rowsToDelete.forEach(row => {
                const reason = row.expiresAt < now ? "EXPIRED" : "REQUEST_DENIED";
                console.log(`  - ID: ${row.id}, Address: ${row.address}, ${row.city}, ${row.state}, Reason: ${reason}`);
            });

        } else {
            console.log(`[CLEAN CACHE CRON] No entries to remove`)
            return;
        }

        const result = await db.delete(streetviewCache).where(
            or (
                lt(streetviewCache.expiresAt, now),
                eq(streetviewCache.metadataStatus, "REQUEST_DENIED")
            )
        );

        console.log(`[CLEAN CACHE CRON] Successfully cleaned streetview cache - removed expired entries`);

        return result;

    } catch(error) {
        console.error("[CRON] Failed to clean up streetview cache");
        throw error;
    }
}