import { db } from 'server/storage';
import {
    userRoles,
    roles,
    users,
    subscriptions,
    emailSubscriptionList,
} from '@database/schemas/users.schema';
import { msas } from '@database/schemas';
import { eq, and, inArray } from 'drizzle-orm';
import { ALL_TEAM_ROLES } from 'server/constants/roles.constants';

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

interface WhitelistRow {
    id: number;
    email: string;
    msaName: string | null;
    relationshipManagerId: string | null;
}

export async function getWhitelist(): Promise<WhitelistRow[]> {
    const rows = await db
        .select({
            id: emailSubscriptionList.id,
            email: emailSubscriptionList.email,
            msaName: msas.name,
            relationshipManagerId: emailSubscriptionList.relationshipManagerId,
        })
        .from(emailSubscriptionList)
        .leftJoin(msas, eq(emailSubscriptionList.msa, msas.id))
        .orderBy(emailSubscriptionList.createdAt);

    return rows.map((r) => ({
        id: r.id,
        email: r.email,
        msaName: r.msaName ?? null,
        relationshipManagerId: r.relationshipManagerId ?? null,
    }));
}

export async function deleteWhitelistEntry(id: number): Promise<number | null> {
    const deleted = await db
        .delete(emailSubscriptionList)
        .where(eq(emailSubscriptionList.id, id))
        .returning({ id: emailSubscriptionList.id });

    return deleted.length > 0 ? deleted[0].id : null;
}

interface UpdateWhitelistParams {
    id: number;
    msaName?: string;
    relationshipManagerId?: string | null;
}

interface UpdateWhitelistResult {
    id: number;
    email: string;
    relationshipManagerId: string | null;
}

export async function updateWhitelistEntry(
    params: UpdateWhitelistParams,
): Promise<UpdateWhitelistResult | null> {
    const { id, msaName, relationshipManagerId } = params;
    const updates: { msa?: number; relationshipManagerId?: string | null; updatedAt: Date } = {
        updatedAt: new Date(),
    };

    if (msaName !== undefined) {
        const [msaRow] = await db
            .select({ id: msas.id })
            .from(msas)
            .where(eq(msas.name, msaName))
            .limit(1);
        if (!msaRow) return null;
        updates.msa = msaRow.id;
    }

    if (relationshipManagerId !== undefined) {
        updates.relationshipManagerId = relationshipManagerId === '' ? null : relationshipManagerId;
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

    return {
        id: updated[0].id,
        email: updated[0].email,
        relationshipManagerId: updated[0].relationshipManagerId ?? null,
    };
}

interface AddWhitelistParams {
    email: string;
    msaName: string;
    relationshipManagerId?: string | null;
}

/** Returns "invalid-msa" if MSA not found, "duplicate" if email already exists, otherwise "ok". */
export async function addWhitelistEntry(
    params: AddWhitelistParams,
): Promise<'ok' | 'invalid-msa' | 'duplicate'> {
    const { email, msaName, relationshipManagerId } = params;
    const normalizedEmail = email.toLowerCase().trim();

    const [msaRow] = await db
        .select({ id: msas.id })
        .from(msas)
        .where(eq(msas.name, msaName))
        .limit(1);

    if (!msaRow) return 'invalid-msa';

    const existing = await db
        .select()
        .from(emailSubscriptionList)
        .where(eq(emailSubscriptionList.email, normalizedEmail))
        .limit(1);

    if (existing.length > 0) return 'duplicate';

    await db.insert(emailSubscriptionList).values({
        email: normalizedEmail,
        msa: msaRow.id,
        relationshipManagerId: relationshipManagerId ?? null,
    });

    return 'ok';
}
