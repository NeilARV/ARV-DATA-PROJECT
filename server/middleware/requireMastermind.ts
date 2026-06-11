import { db } from 'server/storage';
import { users, subscriptions, userRoles, roles } from '@database/schemas/users.schema';
import { eq, and, inArray } from 'drizzle-orm';
import { requireSub } from 'server/middleware/requireSub';

// Mastermind access = any subscription tier OR any team role.
// This pairing is the server-side equivalent of the frontend `canAccessApp` flag.
const MASTERMIND_TIERS = ['basic', 'pro', 'premium'] as const;
const MASTERMIND_BYPASS_ROLES = ['admin', 'owner', 'relationship-manager', 'member'] as const;

// REST gate for every Mastermind read/write route.
export const requireMastermind = requireSub([...MASTERMIND_TIERS], {
    bypassRoles: [...MASTERMIND_BYPASS_ROLES],
});

// Boolean form of the same rule, for contexts without an Express middleware chain
// (e.g. the WebSocket upgrade handshake). Mirrors requireSub: a bypass role grants
// access regardless of subscription; otherwise a qualifying tier is required.
export async function isMastermindEligible(userId: string): Promise<boolean> {
    const roleRows = await db
        .select({ roleName: roles.name })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(and(eq(userRoles.userId, userId), inArray(roles.name, [...MASTERMIND_BYPASS_ROLES])))
        .limit(1);
    if (roleRows.length > 0) return true;

    const subRows = await db
        .select({ subscriptionName: subscriptions.name })
        .from(users)
        .innerJoin(subscriptions, eq(users.subscriptionId, subscriptions.id))
        .where(and(eq(users.id, userId), inArray(subscriptions.name, [...MASTERMIND_TIERS])))
        .limit(1);
    return subRows.length > 0;
}
