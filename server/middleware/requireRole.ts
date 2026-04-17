import { userRoles, roles, users, subscriptions } from "@database/schemas/users.schema";
import { Request, Response, NextFunction } from "express";
import { db } from "server/storage";
import { eq, and, inArray } from "drizzle-orm";

const TEAM_ROLES = ["owner", "admin", "relationship-manager", "member"] as const satisfies readonly Roles[];
const SUBSCRIPTION_TIERS = ["basic", "pro", "premium"] as const satisfies readonly Roles[];

// Compile-time guard: if a new value is added to the Roles type without being placed in one of the
// two arrays above, this line will produce a TypeScript error.
void (true as [Exclude<Roles, typeof TEAM_ROLES[number] | typeof SUBSCRIPTION_TIERS[number]>] extends [never] ? true : never);

const SUBSCRIPTION_TIER_SET = new Set<Roles>(SUBSCRIPTION_TIERS);

/**
 * Normalizes role(s) to a non-empty array of role names.
 */
function toRoleArray(roleOrRoles: Roles | Roles[]): Roles[] {
  const arr = Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles];
  if (arr.length === 0) {
    throw new Error("requireRole: at least one role must be provided");
  }
  return arr;
}

/**
 * Returns a middleware that requires the user to have at least one of the given roles.
 * Pass a single role or an array of roles, e.g. requireRole("owner") or requireRole(["owner", "admin"]).
 *
 * ARV team roles (owner, admin, relationship-manager, member) are checked via the user_roles join table.
 * Subscription tiers (basic, pro, premium) are checked by joining users -> subscriptions.
 */
type RoleOrRoles = Roles | Roles[];

export function requireRole(roleOrRoles: RoleOrRoles) {
  const allowedRoles = toRoleArray(roleOrRoles);
  const teamRoles = allowedRoles.filter((r) => !SUBSCRIPTION_TIER_SET.has(r));
  const tierRoles = allowedRoles.filter((r) => SUBSCRIPTION_TIER_SET.has(r));

  return async function requireRoleMiddleware(
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

      let matchedRole: string | null = null;

      // Check ARV team roles via the user_roles join table
      if (teamRoles.length > 0) {
        const rows = await db
          .select({ roleName: roles.name })
          .from(userRoles)
          .innerJoin(roles, eq(userRoles.roleId, roles.id))
          .where(
            and(
              eq(userRoles.userId, req.session.userId),
              inArray(roles.name, teamRoles),
            ),
          )
          .limit(1);

        if (rows.length > 0) matchedRole = rows[0].roleName;
      }

      // Check subscription tier by joining users -> subscriptions
      if (!matchedRole && tierRoles.length > 0) {
        const rows = await db
          .select({ subscriptionName: subscriptions.name })
          .from(users)
          .innerJoin(subscriptions, eq(users.subscriptionId, subscriptions.id))
          .where(
            and(
              eq(users.id, req.session.userId),
              inArray(subscriptions.name, tierRoles),
            ),
          )
          .limit(1);

        if (rows.length > 0) matchedRole = rows[0].subscriptionName;
      }

      if (!matchedRole) {
        console.error(
          `[AUTH DENIED] User ${req.session.userId} has none of [${allowedRoles.join(", ")}] for ${req.path}`,
        );
        return res
          .status(403)
          .json({ message: "Forbidden - Required role access" });
      }

      console.log(
        `[AUTH GRANTED] User ${req.session.userId} (${matchedRole}) accessing ${req.path}`,
      );
      next();
    } catch (error) {
      console.error("[AUTH ERROR]", error);
      res.status(500).json({ message: "Error checking role" });
    }
  };
}
