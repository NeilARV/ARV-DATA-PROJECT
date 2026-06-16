import { users, subscriptions, userRoles, roles as rolesTable } from '@database/schemas/users.schema';
import { Request, Response, NextFunction } from 'express';
import { db } from 'server/storage';
import { eq, and, inArray } from 'drizzle-orm';

type RequireAccessOptions = {
    roles?: readonly Roles[];
    tiers?: readonly SubscriptionTier[];
    forbiddenMessage?: string;
    errorMessage?: string;
};

/**
 * Single access-control engine. A request passes when the signed-in user has ANY of the allowed
 * team roles OR ANY of the allowed subscription tiers (roles are checked first, so a qualifying
 * role short-circuits the tier lookup). Returns 401 with no session, 403 otherwise.
 *
 * `requireRole` and `requireSub` are thin wrappers over this — role-only and tier-with-role-bypass
 * respectively — and pass their own 403/500 messages so their existing contracts are preserved.
 */
export function requireAccess({
    roles,
    tiers,
    forbiddenMessage = 'Forbidden',
    errorMessage = 'Error checking access',
}: RequireAccessOptions) {
    const allowedRoles: Roles[] = roles ? [...roles] : [];
    const allowedTiers: SubscriptionTier[] = tiers ? [...tiers] : [];
    if (allowedRoles.length === 0 && allowedTiers.length === 0) {
        throw new Error('requireAccess: at least one role or tier must be provided');
    }

    return async function requireAccessMiddleware(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = req.session.userId;
            if (!userId) {
                console.error(
                    `[AUTH DENIED] No user session for ${req.path}, Session ID: ${req.sessionID}`,
                );
                return res.status(401).json({ message: 'Unauthorized - Please log in' });
            }

            if (allowedRoles.length > 0) {
                const roleRows = await db
                    .select({ roleName: rolesTable.name })
                    .from(userRoles)
                    .innerJoin(rolesTable, eq(userRoles.roleId, rolesTable.id))
                    .where(
                        and(eq(userRoles.userId, userId), inArray(rolesTable.name, allowedRoles)),
                    )
                    .limit(1);
                if (roleRows.length > 0) {
                    console.log(
                        `[AUTH GRANTED] User ${userId} (role: ${roleRows[0].roleName}) accessing ${req.path}`,
                    );
                    return next();
                }
            }

            if (allowedTiers.length > 0) {
                const subRows = await db
                    .select({ subscriptionName: subscriptions.name })
                    .from(users)
                    .innerJoin(subscriptions, eq(users.subscriptionId, subscriptions.id))
                    .where(and(eq(users.id, userId), inArray(subscriptions.name, allowedTiers)))
                    .limit(1);
                if (subRows.length > 0) {
                    console.log(
                        `[AUTH GRANTED] User ${userId} (sub: ${subRows[0].subscriptionName}) accessing ${req.path}`,
                    );
                    return next();
                }
            }

            console.error(
                `[AUTH DENIED] User ${userId} lacks roles [${allowedRoles.join(', ')}] / tiers [${allowedTiers.join(', ')}] for ${req.path}`,
            );
            return res.status(403).json({ message: forbiddenMessage });
        } catch (error) {
            console.error('[AUTH ERROR]', error);
            res.status(500).json({ message: errorMessage });
        }
    };
}
