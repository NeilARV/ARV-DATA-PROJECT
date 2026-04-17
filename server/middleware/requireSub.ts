import { users, subscriptions, userRoles, roles } from "@database/schemas/users.schema";
import { Request, Response, NextFunction } from "express";
import { db } from "server/storage";
import { eq, and, inArray } from "drizzle-orm";

/**
 * Returns a middleware that requires the user to have one of the given subscription tiers.
 * Subscription tiers (basic, pro, premium) are checked by joining users -> subscriptions.
 *
 * Pass bypassRoles to allow certain ARV team roles (e.g. admin, owner) through regardless
 * of subscription — useful for routes that should be accessible to both subscribers and
 * internal team members.
 *
 * For ARV team role gating use requireRole instead.
 */
export function requireSub(
    tierOrTiers: SubscriptionTier | SubscriptionTier[],
    options?: { bypassRoles?: Roles[] }
) {
    const allowedTiers = Array.isArray(tierOrTiers) ? tierOrTiers : [tierOrTiers];
    if (allowedTiers.length === 0) {
        throw new Error("requireSub: at least one subscription tier must be provided");
    }
    const bypass = options?.bypassRoles ?? [];

    return async function requireSubMiddleware(
        req: Request,
        res: Response,
        next: NextFunction
    ) {
        try {
            if (!req.session.userId) {
                console.error(
                    `[AUTH DENIED] No user session for ${req.path}, Session ID: ${req.sessionID}`,
                );
                return res.status(401).json({ message: "Unauthorized - Please log in" });
            }

            // Check bypass roles first — team members with these roles skip the subscription check
            if (bypass.length > 0) {
                const roleRows = await db
                    .select({ roleName: roles.name })
                    .from(userRoles)
                    .innerJoin(roles, eq(userRoles.roleId, roles.id))
                    .where(
                        and(
                            eq(userRoles.userId, req.session.userId),
                            inArray(roles.name, bypass),
                        ),
                    )
                    .limit(1);

                if (roleRows.length > 0) {
                    console.log(
                        `[AUTH GRANTED] User ${req.session.userId} (role: ${roleRows[0].roleName}) bypassing subscription check for ${req.path}`,
                    );
                    return next();
                }
            }

            // Check subscription tier
            const rows = await db
                .select({ subscriptionName: subscriptions.name })
                .from(users)
                .innerJoin(subscriptions, eq(users.subscriptionId, subscriptions.id))
                .where(
                    and(
                        eq(users.id, req.session.userId),
                        inArray(subscriptions.name, allowedTiers),
                    ),
                )
                .limit(1);

            if (rows.length === 0) {
                console.error(
                    `[AUTH DENIED] User ${req.session.userId} lacks subscription [${allowedTiers.join(", ")}] for ${req.path}`,
                );
                return res.status(403).json({ message: "Forbidden - Subscription required" });
            }

            console.log(
                `[AUTH GRANTED] User ${req.session.userId} (sub: ${rows[0].subscriptionName}) accessing ${req.path}`,
            );
            next();
        } catch (error) {
            console.error("[AUTH ERROR]", error);
            res.status(500).json({ message: "Error checking subscription" });
        }
    };
}
