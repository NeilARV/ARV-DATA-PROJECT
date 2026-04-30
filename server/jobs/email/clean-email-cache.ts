import { db } from "server/storage";
import { sentPropertyIds } from "@database/schemas/sync.schema";
import { lt } from "drizzle-orm";

export async function cleanEmailCache(): Promise<void> {
    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

    const deleted = await db
        .delete(sentPropertyIds)
        .where(lt(sentPropertyIds.createdAt, fifteenDaysAgo))
        .returning();

    console.log(`[CLEAN EMAIL CACHE] Deleted ${deleted.length} expired sent property IDs`);
}
