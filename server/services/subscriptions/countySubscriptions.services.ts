import { db } from 'server/storage';
import { msas, userMsaSubscriptions, userCountySubscriptions } from '@database/schemas/msas.schema';
import { eq } from 'drizzle-orm';
import { getCountiesForMsa, getStateFromMsaName } from '@shared/constants/countyToMsa';

export interface CountySubscriptionBackfillResult {
    msaSubscriptionsScanned: number;
    countyRowsInserted: number;
}

/**
 * Expands every existing `user_msa_subscriptions` row into one `user_county_subscriptions` row per
 * county in that MSA (issue #113), so an MSA subscriber keeps identical coverage at county grain.
 * Idempotent: rows conflicting on the `(userId, county, state)` PK are skipped, so re-running is a no-op.
 * Side effect: writes `user_county_subscriptions`.
 * @returns counts of MSA rows scanned and county rows actually inserted (0 on a re-run).
 */
export async function backfillCountySubscriptions(): Promise<CountySubscriptionBackfillResult> {
    const msaSubs = await db
        .select({ userId: userMsaSubscriptions.userId, msaId: msas.id, msaName: msas.name })
        .from(userMsaSubscriptions)
        .innerJoin(msas, eq(userMsaSubscriptions.msaId, msas.id));

    const rows = msaSubs.flatMap((sub) => {
        const state = getStateFromMsaName(sub.msaName);
        // An MSA name whose trailing ", XX" code doesn't parse can't yield a valid state — skip it
        // loudly-by-absence rather than writing a malformed row that violates the state check.
        if (!state) return [];
        return getCountiesForMsa(sub.msaName).map((county) => ({
            userId: sub.userId,
            county,
            state,
            msaId: sub.msaId,
        }));
    });

    if (rows.length === 0) {
        return { msaSubscriptionsScanned: msaSubs.length, countyRowsInserted: 0 };
    }

    const inserted = await db
        .insert(userCountySubscriptions)
        .values(rows)
        .onConflictDoNothing()
        .returning({ userId: userCountySubscriptions.userId });

    return { msaSubscriptionsScanned: msaSubs.length, countyRowsInserted: inserted.length };
}
