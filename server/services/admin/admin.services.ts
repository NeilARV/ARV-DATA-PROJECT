import { db } from 'server/storage';
import {
    userRoles,
    roles,
    users,
    subscriptions,
    emailSubscriptionList,
} from '@database/schemas/users.schema';
import { msas, emailSubscriptionListCounties } from '@database/schemas';
import { eq, and, inArray } from 'drizzle-orm';
import { ALL_TEAM_ROLES } from 'server/constants/roles.constants';
import { normalizeEmail } from 'server/utils/normalizeEmail';
import { resolveCountySelections } from 'server/services/subscriptions/countySubscriptions.services';
import type { CountySubscriptionSelection } from '@database/types/countySubscriptions';
import type { WhitelistCounty, WhitelistEntry } from '@shared/types/users';

interface AdminStatusResult {
    authenticated: boolean;
    isAdmin: boolean;
    roles: string[];
    subscriptionTier: string | null;
}

export async function getAdminStatus(userId: string): Promise<AdminStatusResult> {
    // Fetch ARV team roles from the user_roles join table
    const teamRoleRows = await db
        .select({ roleName: roles.name })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(and(eq(userRoles.userId, userId), inArray(roles.name, [...ALL_TEAM_ROLES])));

    // Fetch subscription tier by joining users -> subscriptions
    const [userRow] = await db
        .select({ subscriptionTier: subscriptions.name })
        .from(users)
        .leftJoin(subscriptions, eq(users.subscriptionId, subscriptions.id))
        .where(eq(users.id, userId))
        .limit(1);

    const subscriptionTier = userRow?.subscriptionTier ?? null;
    const rolesList = teamRoleRows.map((r) => r.roleName);

    const isAdmin = rolesList.some((r) => (ALL_TEAM_ROLES as readonly string[]).includes(r));
    return { authenticated: true, isAdmin, roles: rolesList, subscriptionTier };
}

/** Returns all whitelist entries with their subscribed counties (each carrying its MSA name). */
export async function getWhitelist(): Promise<WhitelistEntry[]> {
    const entries = await db
        .select({
            id: emailSubscriptionList.id,
            email: emailSubscriptionList.email,
            relationshipManagerId: emailSubscriptionList.relationshipManagerId,
        })
        .from(emailSubscriptionList)
        .orderBy(emailSubscriptionList.createdAt);

    const countyRows = await db
        .select({
            subscriptionListId: emailSubscriptionListCounties.subscriptionListId,
            county: emailSubscriptionListCounties.county,
            state: emailSubscriptionListCounties.state,
            msaName: msas.name,
        })
        .from(emailSubscriptionListCounties)
        .innerJoin(msas, eq(emailSubscriptionListCounties.msaId, msas.id));

    const countiesByEntry = new Map<number, WhitelistCounty[]>();
    for (const { subscriptionListId, ...county } of countyRows) {
        const counties = countiesByEntry.get(subscriptionListId) ?? [];
        counties.push(county);
        countiesByEntry.set(subscriptionListId, counties);
    }

    return entries.map((e) => ({ ...e, counties: countiesByEntry.get(e.id) ?? [] }));
}

export async function deleteWhitelistEntry(id: number): Promise<number | null> {
    const deleted = await db
        .delete(emailSubscriptionList)
        .where(eq(emailSubscriptionList.id, id))
        .returning({ id: emailSubscriptionList.id });

    return deleted.length > 0 ? deleted[0].id : null;
}

// Same replace-list semantics as replaceUserCountySubscriptions, keyed by whitelist entry:
// delete-then-insert without a transaction (matches the neon-http driver used app-wide).
async function replaceWhitelistCounties(
    subscriptionListId: number,
    selections: CountySubscriptionSelection[],
): Promise<void> {
    const resolved = await resolveCountySelections(selections);

    await db
        .delete(emailSubscriptionListCounties)
        .where(eq(emailSubscriptionListCounties.subscriptionListId, subscriptionListId));
    if (resolved.length > 0) {
        await db
            .insert(emailSubscriptionListCounties)
            .values(resolved.map((r) => ({ subscriptionListId, ...r })));
    }
}

interface UpdateWhitelistParams {
    id: number;
    counties?: CountySubscriptionSelection[];
    relationshipManagerId?: string | null;
}

interface UpdateWhitelistResult {
    id: number;
    email: string;
    relationshipManagerId: string | null;
}

/**
 * Updates an entry's relationship manager and/or replaces its subscribed counties (untracked
 * counties are dropped by resolution); null when no entry matches.
 */
export async function updateWhitelistEntry(
    params: UpdateWhitelistParams,
): Promise<UpdateWhitelistResult | null> {
    const { id, counties, relationshipManagerId } = params;
    const updates: { relationshipManagerId?: string | null; updatedAt: Date } = {
        updatedAt: new Date(),
    };

    if (relationshipManagerId !== undefined) {
        updates.relationshipManagerId = relationshipManagerId;
    }

    const updated = await db
        .update(emailSubscriptionList)
        .set(updates)
        .where(eq(emailSubscriptionList.id, id))
        .returning({
            id: emailSubscriptionList.id,
            email: emailSubscriptionList.email,
            relationshipManagerId: emailSubscriptionList.relationshipManagerId,
        });

    if (updated.length === 0) return null;

    if (counties !== undefined) {
        await replaceWhitelistCounties(id, counties);
    }

    return {
        id: updated[0].id,
        email: updated[0].email,
        relationshipManagerId: updated[0].relationshipManagerId ?? null,
    };
}

interface AddWhitelistParams {
    email: string;
    counties: CountySubscriptionSelection[];
    relationshipManagerId?: string | null;
}

/**
 * Creates a whitelist entry with its subscribed counties (untracked counties are dropped by
 * resolution); "duplicate" if the email already exists, otherwise "ok".
 */
export async function addWhitelistEntry(params: AddWhitelistParams): Promise<'ok' | 'duplicate'> {
    const { email, counties, relationshipManagerId } = params;
    const normalizedEmail = normalizeEmail(email);

    const existing = await db
        .select({ id: emailSubscriptionList.id })
        .from(emailSubscriptionList)
        .where(eq(emailSubscriptionList.email, normalizedEmail))
        .limit(1);

    if (existing.length > 0) return 'duplicate';

    const [created] = await db
        .insert(emailSubscriptionList)
        .values({
            email: normalizedEmail,
            relationshipManagerId: relationshipManagerId ?? null,
        })
        .returning({ id: emailSubscriptionList.id });

    await replaceWhitelistCounties(created.id, counties);

    return 'ok';
}
