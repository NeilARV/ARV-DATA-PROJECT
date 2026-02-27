import { userRoles, roles } from "@database/schemas/users.schema";
import { Request, Response, NextFunction } from "express";
import { db } from "server/storage";
import { eq, and, inArray } from "drizzle-orm";

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
 */
export function requireRole(roleOrRoles: string | string[]) {
  const allowedRoles = toRoleArray(roleOrRoles);

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

      const allowedRows = await db
        .select({ roleName: roles.name })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(
          and(
            eq(userRoles.userId, req.session.userId),
            inArray(roles.name, allowedRoles),
          ),
        )
        .limit(1);

      if (allowedRows.length === 0) {
        console.error(
          `[AUTH DENIED] User ${req.session.userId} has none of [${allowedRoles.join(", ")}] for ${req.path}`,
        );
        return res
          .status(403)
          .json({ message: "Forbidden - Required role access" });
      }

      console.log(
        `[AUTH GRANTED] User ${req.session.userId} (${allowedRows[0].roleName}) accessing ${req.path}`,
      );
      next();
    } catch (error) {
      console.error("[AUTH ERROR]", error);
      res.status(500).json({ message: "Error checking role" });
    }
  };
}
