import { userRoles, roles, users } from "@database/schemas/users.schema";
import { Request, Response, NextFunction } from "express";
import { db } from "server/storage";
import { eq, and, inArray } from "drizzle-orm";

// These roles live on users.user_role — not in the user_roles join table
const USER_TIER_ROLES = new Set<string>(["base", "pro"]);

/**
 * Normalizes role(s) to a non-empty array of role names.
 */
function toRoleArray(roleOrRoles: string | string[]): string[] {
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
 * User tier roles (base, pro) are checked via the user_role column on the users table.
 */
type RoleOrRoles = Roles | Roles[];

export function requireRole(roleOrRoles: RoleOrRoles) {
  const allowedRoles = toRoleArray(roleOrRoles);
  const teamRoles = allowedRoles.filter((r) => !USER_TIER_ROLES.has(r));
  const tierRoles = allowedRoles.filter((r) => USER_TIER_ROLES.has(r));

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

      // Check user tier role via users.user_role column
      if (!matchedRole && tierRoles.length > 0) {
        const rows = await db
          .select({ userRole: users.userRole })
          .from(users)
          .where(
            and(
              eq(users.id, req.session.userId),
              inArray(users.userRole, tierRoles),
            ),
          )
          .limit(1);

        if (rows.length > 0) matchedRole = rows[0].userRole;
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
