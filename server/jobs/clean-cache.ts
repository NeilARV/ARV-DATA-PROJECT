import { db } from 'server/storage';
import { streetviewCache } from '@database/schemas/properties.schema';
import { lt, eq, or, and, gte, inArray } from 'drizzle-orm';
import { StreetviewServices } from 'server/services/properties';

/**
 * From the rows about to be deleted, returns the distinct storage paths that are safe to remove
 * from the bucket — i.e. those NOT still referenced by a surviving (non-expired) row. Storage
 * keys are content-addressed, so a re-fetch can leave a valid row sharing an expired row's path;
 * deleting that object would break a live cache entry that would never self-heal.
 */
async function resolveRemovableStoragePaths(
    rowsToDelete: Array<{ storagePath: string | null }>,
    now: Date,
): Promise<string[]> {
    const candidatePaths = Array.from(
        new Set(
            rowsToDelete.map((row) => row.storagePath).filter((p): p is string => p !== null),
        ),
    );
    if (candidatePaths.length === 0) return [];

    const survivors = await db
        .select({ storagePath: streetviewCache.storagePath })
        .from(streetviewCache)
        .where(
            and(
                inArray(streetviewCache.storagePath, candidatePaths),
                gte(streetviewCache.expiresAt, now),
            ),
        );
    const survivorPaths = new Set(survivors.map((r) => r.storagePath));
    return candidatePaths.filter((p) => !survivorPaths.has(p));
}

export async function CleanCache() {
    try {
        console.log('[CLEAN CACHE CRON] Running streetview cache clean up');

        const now = new Date();

        const rowsToDelete = await db
            .select()
            .from(streetviewCache)
            .where(
                or(
                    lt(streetviewCache.expiresAt, now),
                    eq(streetviewCache.metadataStatus, 'REQUEST_DENIED'),
                ),
            );

        if (rowsToDelete.length > 0) {
            console.log(`[CLEAN CACHE CRON] Found ${rowsToDelete.length} entries to remove:`);

            const expiredCount = rowsToDelete.filter((row) => row.expiresAt < now).length;
            const deniedCount = rowsToDelete.filter(
                (row) => row.metadataStatus === 'REQUEST_DENIED',
            ).length;

            console.log(`  - ${expiredCount} expired entries`);
            console.log(`  - ${deniedCount} REQUEST_DENIED entries`);

            // Optional: log details of each row
            rowsToDelete.forEach((row) => {
                const reason = row.expiresAt < now ? 'EXPIRED' : 'REQUEST_DENIED';
                console.log(
                    `  - ID: ${row.id}, Address: ${row.address}, ${row.city}, ${row.state}, Reason: ${reason}`,
                );
            });
        } else {
            console.log(`[CLEAN CACHE CRON] No entries to remove`);
            return;
        }

        // Remove backing Supabase Storage objects before deleting the rows, so expired images
        // don't orphan in the bucket. Only paths no surviving row still references are removed.
        const pathsToRemove = await resolveRemovableStoragePaths(rowsToDelete, now);
        if (pathsToRemove.length > 0) {
            await StreetviewServices.removeStoredStreetviewImages(pathsToRemove);
        }

        const result = await db
            .delete(streetviewCache)
            .where(
                or(
                    lt(streetviewCache.expiresAt, now),
                    eq(streetviewCache.metadataStatus, 'REQUEST_DENIED'),
                ),
            );

        console.log(
            `[CLEAN CACHE CRON] Successfully cleaned streetview cache - removed expired entries`,
        );

        return result;
    } catch (error) {
        console.error('[CRON] Failed to clean up streetview cache');
        throw error;
    }
}
