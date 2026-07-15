import { db } from 'server/storage';
import { msas, userCountySubscriptions } from '@database/schemas/msas.schema';
import { users, userNotificationPreferences } from '@database/schemas/users.schema';
import { getCompanionMsaName } from 'server/constants/companionCities.constants';
import { getTrackedCounties } from '@shared/constants/countyToMsa';
import { eq, and, inArray, sql } from 'drizzle-orm';
import type { DealType } from '@shared/types/deals';

export interface DealRecipientQuery {
    msaId: number;
    dealType: DealType;
    county: string | null;
    city: string | null;
    state: string | null;
    posterUserId: string;
}

export interface DealRecipient {
    userId: string;
    email: string;
}

export interface ResolvedDealRecipients {
    recipients: DealRecipient[];
    /** Every MSA in play (primary first, companion after) — MSA-level extras (whitelist) fan out over these. */
    msaIds: number[];
}

// Case-insensitive because legacy deal rows may not match COUNTY_TO_MSA's canonical casing.
function isTrackedCountyPair(county: string, state: string): boolean {
    const c = county.trim().toLowerCase();
    const s = state.trim().toLowerCase();
    return getTrackedCounties().some(
        (t) => t.county.toLowerCase() === c && t.state.toLowerCase() === s,
    );
}

/**
 * Resolves the full "who receives this deal" set from county subscriptions (issue #116):
 * exact-county match; MSA-wide fallback when the deal's county is null/untracked (a data gap
 * never drops a deal); companion-city fan-out to every county in primary ∪ companion MSAs.
 * Applies the master kill-switch, the deal toggle, the per-user deal-type filter, and poster
 * exclusion; recipients are unique by user.
 */
export async function resolveDealRecipients(
    query: DealRecipientQuery,
): Promise<ResolvedDealRecipients> {
    const { msaId, dealType, county, city, state, posterUserId } = query;

    // A boundary-city deal (e.g. Temecula) is announced to the companion market, so its
    // audience is every county subscriber across the primary + companion MSAs.
    const companionMsaName = getCompanionMsaName(city, state);
    const msaIds = [msaId];
    if (companionMsaName) {
        const [companionRow] = await db
            .select({ id: msas.id })
            .from(msas)
            .where(eq(msas.name, companionMsaName))
            .limit(1);
        if (companionRow && companionRow.id !== msaId) msaIds.push(companionRow.id);
    }

    const trackedCounty =
        county != null && state != null && isTrackedCountyPair(county, state)
            ? { county, state }
            : null;

    // Exact-county targeting only for a non-companion deal with a tracked (county, state);
    // otherwise the MSA safety net: every subscriber of every county in the MSA(s) in play.
    const scopeConditions =
        companionMsaName || !trackedCounty
            ? [inArray(userCountySubscriptions.msaId, msaIds)]
            : [
                  sql`lower(trim(${userCountySubscriptions.county})) = lower(trim(${trackedCounty.county}))`,
                  sql`lower(trim(${userCountySubscriptions.state})) = lower(trim(${trackedCounty.state}))`,
              ];

    const rows = await db
        .select({
            userId: users.id,
            email: users.email,
            dealTypeFilter: userNotificationPreferences.dealTypeFilter,
        })
        .from(userCountySubscriptions)
        .innerJoin(users, eq(userCountySubscriptions.userId, users.id))
        .innerJoin(userNotificationPreferences, eq(users.id, userNotificationPreferences.userId))
        .where(
            and(
                eq(users.notifications, true),
                eq(userNotificationPreferences.dealNotificationsEnabled, true),
                ...scopeConditions,
            ),
        );

    // neil@arvfinance.com receives notifications for his own postings; all other posters do not.
    const posterRow = rows.find((r) => r.userId === posterUserId);
    const posterIsNeil = posterRow?.email.toLowerCase() === 'neil@arvfinance.com';
    const seen = new Set<string>(posterIsNeil ? [] : [posterUserId]);
    const recipients = rows.flatMap((row) => {
        // The MSA-wide scope yields one row per subscribed county — keep each user once.
        if (seen.has(row.userId)) return [];
        seen.add(row.userId);
        // Deal-type filter: empty = all types; non-empty = must include this deal's type.
        const typeFilter = row.dealTypeFilter ?? [];
        if (typeFilter.length > 0 && !typeFilter.includes(dealType)) return [];
        return [{ userId: row.userId, email: row.email }];
    });

    return { recipients, msaIds };
}
