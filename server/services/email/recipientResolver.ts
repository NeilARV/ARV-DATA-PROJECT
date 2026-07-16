import { db } from 'server/storage';
import {
    msas,
    userCountySubscriptions,
    emailSubscriptionListCounties,
} from '@database/schemas/msas.schema';
import {
    users,
    userNotificationPreferences,
    emailSubscriptionList,
} from '@database/schemas/users.schema';
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
    /** Every MSA in play (primary first, companion after) — resolveWhitelistDealRecipients scopes over these. */
    msaIds: number[];
}

export interface DataAppRecipient {
    userId: string;
    email: string;
    firstName: string;
    dataAppStatusFilter: string[];
    /** The user's subscribed counties within the queried MSA — the job's per-user "where" filter. */
    counties: string[];
}

export interface WhitelistDealRecipientQuery {
    /** Every MSA in play (primary first, companion after), as returned by resolveDealRecipients. */
    msaIds: number[];
    county: string | null;
    city: string | null;
    state: string | null;
}

export interface WhitelistRecipient {
    email: string;
    /** The entry's relationship manager's email, pre-resolved for the From address. */
    rmEmail?: string;
}

export interface WhitelistDataAppRecipient {
    email: string;
    /** The entry's relationship manager's email, pre-resolved for the From address. */
    rmEmail?: string;
    /** The entry's subscribed counties within the queried MSA — the job's per-entry "where" filter. */
    counties: string[];
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

/**
 * Resolves the daily property-digest audience for one MSA (issue #117): every user subscribed
 * to at least one of the MSA's counties, with the master kill-switch and Data App toggle
 * applied; one entry per user, carrying the counties the job filters that user's properties to.
 */
export async function resolveDataAppRecipients(msaId: number): Promise<DataAppRecipient[]> {
    const rows = await db
        .select({
            userId: users.id,
            email: users.email,
            firstName: users.firstName,
            dataAppStatusFilter: userNotificationPreferences.dataAppStatusFilter,
            county: userCountySubscriptions.county,
        })
        .from(userCountySubscriptions)
        .innerJoin(users, eq(userCountySubscriptions.userId, users.id))
        .innerJoin(userNotificationPreferences, eq(users.id, userNotificationPreferences.userId))
        .where(
            and(
                eq(userCountySubscriptions.msaId, msaId),
                eq(users.notifications, true),
                eq(userNotificationPreferences.dataAppEnabled, true),
            ),
        );

    // One row per subscribed county — fold into a single recipient per user.
    const byUser = new Map<string, DataAppRecipient>();
    for (const row of rows) {
        const recipient = byUser.get(row.userId);
        if (recipient) {
            recipient.counties.push(row.county);
            continue;
        }
        byUser.set(row.userId, {
            userId: row.userId,
            email: row.email,
            firstName: row.firstName,
            dataAppStatusFilter: row.dataAppStatusFilter,
            counties: [row.county],
        });
    }
    return Array.from(byUser.values());
}

// A whitelist address that has since registered gets the user path, never both (double-send
// prevention).
const notRegisteredAsUser = sql`NOT EXISTS (
    SELECT 1 FROM users
    WHERE lower(trim(users.email)) = lower(trim(${emailSubscriptionList.email}))
)`;

async function getRmEmailsByIds(rmIds: string[]): Promise<Map<string, string>> {
    if (rmIds.length === 0) return new Map();
    const rows = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(inArray(users.id, rmIds));
    return new Map(rows.map((r) => [r.id, r.email]));
}

// Batch-resolves each entry's RM From address; rows repeat per matched county, so callers
// dedupe by email before calling.
async function withRmEmails<T extends { relationshipManagerId: string | null }>(
    entries: T[],
): Promise<(Omit<T, 'relationshipManagerId'> & { rmEmail?: string })[]> {
    const rmIds = Array.from(
        new Set(
            entries.map((e) => e.relationshipManagerId).filter((id): id is string => id != null),
        ),
    );
    const rmEmailByRmId = await getRmEmailsByIds(rmIds);
    return entries.map(({ relationshipManagerId, ...entry }) => ({
        ...entry,
        rmEmail: relationshipManagerId ? rmEmailByRmId.get(relationshipManagerId) : undefined,
    }));
}

/**
 * Resolves the whitelist audience for a deal under the same scoping contract registered users
 * get (issue #133): exact-county match; MSA-wide fallback over `msaIds` when the deal's county
 * is null/untracked; companion-city deals fan out over `msaIds` (primary ∪ companion).
 * Entries are unique by email; addresses already registered as users are excluded.
 */
export async function resolveWhitelistDealRecipients(
    query: WhitelistDealRecipientQuery,
): Promise<WhitelistRecipient[]> {
    const { msaIds, county, city, state } = query;

    const trackedCounty =
        county != null && state != null && isTrackedCountyPair(county, state)
            ? { county, state }
            : null;

    // Mirrors resolveDealRecipients: a companion-city deal bypasses exact-county targeting.
    const scopeConditions =
        getCompanionMsaName(city, state) || !trackedCounty
            ? [inArray(emailSubscriptionListCounties.msaId, msaIds)]
            : [
                  sql`lower(trim(${emailSubscriptionListCounties.county})) = lower(trim(${trackedCounty.county}))`,
                  sql`lower(trim(${emailSubscriptionListCounties.state})) = lower(trim(${trackedCounty.state}))`,
              ];

    const rows = await db
        .select({
            email: emailSubscriptionList.email,
            relationshipManagerId: emailSubscriptionList.relationshipManagerId,
        })
        .from(emailSubscriptionListCounties)
        .innerJoin(
            emailSubscriptionList,
            eq(emailSubscriptionListCounties.subscriptionListId, emailSubscriptionList.id),
        )
        .where(and(notRegisteredAsUser, ...scopeConditions));

    // The MSA-wide scope yields one row per subscribed county — keep each entry once.
    const seen = new Set<string>();
    const unique = rows.filter((row) => {
        const key = row.email.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    return withRmEmails(unique);
}

/**
 * Resolves the daily property-digest whitelist audience for one MSA (issue #133): every entry
 * subscribed to at least one of the MSA's counties, mirroring resolveDataAppRecipients' shape.
 * Entries are unique by email; addresses already registered as users are excluded.
 */
export async function resolveWhitelistDataAppRecipients(
    msaId: number,
): Promise<WhitelistDataAppRecipient[]> {
    const rows = await db
        .select({
            email: emailSubscriptionList.email,
            relationshipManagerId: emailSubscriptionList.relationshipManagerId,
            county: emailSubscriptionListCounties.county,
        })
        .from(emailSubscriptionListCounties)
        .innerJoin(
            emailSubscriptionList,
            eq(emailSubscriptionListCounties.subscriptionListId, emailSubscriptionList.id),
        )
        .where(and(eq(emailSubscriptionListCounties.msaId, msaId), notRegisteredAsUser));

    // One row per subscribed county — fold into a single entry per email.
    const byEmail = new Map<
        string,
        { email: string; relationshipManagerId: string | null; counties: string[] }
    >();
    for (const row of rows) {
        const entry = byEmail.get(row.email.toLowerCase());
        if (entry) {
            entry.counties.push(row.county);
            continue;
        }
        byEmail.set(row.email.toLowerCase(), {
            email: row.email,
            relationshipManagerId: row.relationshipManagerId,
            counties: [row.county],
        });
    }

    return withRmEmails(Array.from(byEmail.values()));
}
