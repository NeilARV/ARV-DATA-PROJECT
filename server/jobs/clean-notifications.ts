import { db } from 'server/storage';
import { notifications } from '@database/schemas/mastermind.schema';
import { lt, sql } from 'drizzle-orm';

// Nightly hygiene for the notifications (bell feed) table: drops rows older than 30 days
// regardless of type (mention, channel_mention, announcement, deal_bid) or read state.
// Keeps the feed small — anything past 30 days is no longer surfaced to users.
export async function cleanNotifications() {
    try {
        console.log('[CLEAN NOTIFICATIONS CRON] Removing notifications older than 30 days');
        await db.delete(notifications).where(lt(notifications.createdAt, sql`now() - interval '30 days'`));
        console.log('[CLEAN NOTIFICATIONS CRON] Done');
    } catch (error) {
        console.error('[CRON] Failed to clean notifications:', error);
        throw error;
    }
}
