import { db } from 'server/storage';
import {
    msas,
    userCountySubscriptions,
    emailSubscriptionListCounties,
} from '@database/schemas/msas.schema';
import { eq, inArray } from 'drizzle-orm';
import { getMsaForCounty, getStateFromMsaName } from '@shared/constants/countyToMsa';
import type { CountySubscription } from '@shared/types/users';
import type {
    CountySubscriptionInput,
    CountySubscriptionSelection,
} from '@database/types/countySubscriptions';

/**
 * Returns the user's county subscriptions, each carrying its parent MSA (id + name) so callers can
 * group counties by MSA. Reads `user_county_subscriptions` (the source of truth since issue #114).
 */
export async function getUserCountySubscriptions(userId: string): Promise<CountySubscription[]> {
    return db
        .select({
            county: userCountySubscriptions.county,
            state: userCountySubscriptions.state,
            msaId: userCountySubscriptions.msaId,
            msaName: msas.name,
        })
        .from(userCountySubscriptions)
        .innerJoin(msas, eq(userCountySubscriptions.msaId, msas.id))
        .where(eq(userCountySubscriptions.userId, userId));
}

/**
 * Resolves API `(county, state)` selections into `(county, state, msaId)` rows, deriving each
 * county's parent MSA from COUNTY_TO_MSA (issue #112) rather than trusting the client. Untracked
 * counties, MSAs with no `msas` row, and MSA names with no parseable state are dropped; state is
 * taken from the MSA name so the resolved pair always matches COUNTY_TO_MSA's canonical pair.
 */
export async function resolveCountySelections(
    selections: CountySubscriptionSelection[],
): Promise<CountySubscriptionInput[]> {
    const wanted = Array.from(new Set(selections.map((s) => s.county)))
        .map((county) => ({ county, msaName: getMsaForCounty(county) }))
        .filter((c): c is { county: string; msaName: string } => c.msaName !== null);

    const msaNames = Array.from(new Set(wanted.map((w) => w.msaName)));
    if (msaNames.length === 0) return [];

    const msaRows = await db
        .select({ id: msas.id, name: msas.name })
        .from(msas)
        .where(inArray(msas.name, msaNames));
    const idByName = new Map(msaRows.map((r) => [r.name, r.id]));

    return wanted.flatMap(({ county, msaName }) => {
        const msaId = idByName.get(msaName);
        const state = getStateFromMsaName(msaName);
        if (msaId == null || !state) return [];
        return [{ county, state, msaId }];
    });
}

/**
 * Replaces the user's county subscriptions with the resolved selection set (add/remove exactly).
 * An empty (or fully-unresolvable) list clears all of the user's rows.
 * Side effect: writes `user_county_subscriptions`.
 */
export async function replaceUserCountySubscriptions(
    userId: string,
    selections: CountySubscriptionSelection[],
): Promise<void> {
    const resolved = await resolveCountySelections(selections);

    // Delete-then-insert (no transaction — matches the neon-http driver used app-wide).
    await db.delete(userCountySubscriptions).where(eq(userCountySubscriptions.userId, userId));
    if (resolved.length > 0) {
        await db.insert(userCountySubscriptions).values(resolved.map((r) => ({ userId, ...r })));
    }
}

/**
 * Copies a whitelist entry's county rows into the user's subscriptions (issue #135); rows already
 * present dedupe via the PK. Must run before the entry is deleted — its county rows cascade with it.
 * Side effect: writes `user_county_subscriptions`.
 */
export async function seedWhitelistCountySubscriptions(
    userId: string,
    subscriptionListId: number,
): Promise<void> {
    // Rows are copied verbatim — they were resolved against COUNTY_TO_MSA when the admin wrote them.
    const rows = await db
        .select({
            county: emailSubscriptionListCounties.county,
            state: emailSubscriptionListCounties.state,
            msaId: emailSubscriptionListCounties.msaId,
        })
        .from(emailSubscriptionListCounties)
        .where(eq(emailSubscriptionListCounties.subscriptionListId, subscriptionListId));
    if (rows.length === 0) return;

    await db
        .insert(userCountySubscriptions)
        .values(rows.map((r) => ({ userId, ...r })))
        .onConflictDoNothing();
}

/**
 * Seeds a single home-county subscription for a new user (issue #114) — the home county only, never
 * the whole MSA. No-op when the county is untracked, its MSA has no `msas` row, or a row already
 * exists (idempotent via the PK).
 * Side effect: writes `user_county_subscriptions`.
 */
export async function seedHomeCountySubscription(userId: string, county: string): Promise<void> {
    const msaName = getMsaForCounty(county);
    if (!msaName) return;

    const state = getStateFromMsaName(msaName);
    if (!state) return;

    const [msaRow] = await db.select({ id: msas.id }).from(msas).where(eq(msas.name, msaName));
    if (!msaRow) return;

    await db
        .insert(userCountySubscriptions)
        .values({ userId, county, state, msaId: msaRow.id })
        .onConflictDoNothing();
}
