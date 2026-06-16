import { db } from 'server/storage';
import { authTokens } from '@database/schemas/authTokens.schema';
import { lt, isNotNull, or, sql } from 'drizzle-orm';

// Nightly hygiene for the auth_tokens table: drops rows that can never be redeemed again
// (already used, or past expiry). consumeToken enforces these at redemption regardless, so
// this is purely to keep the table small.
export async function cleanAuthTokens() {
    try {
        console.log('[CLEAN AUTH TOKENS CRON] Removing used/expired auth tokens');
        await db
            .delete(authTokens)
            .where(or(isNotNull(authTokens.usedAt), lt(authTokens.expiresAt, sql`now()`)));
        console.log('[CLEAN AUTH TOKENS CRON] Done');
    } catch (error) {
        console.error('[CRON] Failed to clean auth tokens:', error);
        throw error;
    }
}
