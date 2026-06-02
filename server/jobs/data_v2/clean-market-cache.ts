import { db } from 'server/storage';
import { marketScanQueue } from '@database/schemas/sync.schema';
import { lt, eq, and } from 'drizzle-orm';

export async function cleanMarketCache(): Promise<void> {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const deleted = await db
        .delete(marketScanQueue)
        .where(
            and(
                eq(marketScanQueue.status, 'complete'),
                lt(marketScanQueue.processedAt, ninetyDaysAgo),
            ),
        )
        .returning();

    console.log(
        `[CLEAN MARKET CACHE] Deleted ${deleted.length} completed market scan queue entries`,
    );
}
