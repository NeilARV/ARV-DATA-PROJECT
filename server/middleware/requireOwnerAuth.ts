import { userRoles, roles } from "@database/schemas/users.schema";
import { Request, Response, NextFunction } from "express";
import { db } from "server/storage";
import { eq, and, inArray } from "drizzle-orm";

/** Role names that pass requireAdminAuth (admin and owner). */
const ADMIN_ACCESS_ROLES = ["owner"] as const;

/**
 * Determines admin access from user_roles + roles (not users.is_admin).
 * User must have at least one role in ADMIN_ACCESS_ROLES to pass.
 */
export async function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
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
          inArray(roles.name, [...ADMIN_ACCESS_ROLES])
        )
      )
      .limit(1);

    if (allowedRows.length === 0) {
      console.error(
        `[AUTH DENIED] User ${req.session.userId} has no admin/owner role for ${req.path}`,
      );
      return res
        .status(403)
        .json({ message: "Forbidden - Admin access required" });
    }

    console.log(
      `[AUTH GRANTED] User ${req.session.userId} (${allowedRows[0].roleName}) accessing ${req.path}`,
    );
    next();
  } catch (error) {
    console.error("[AUTH ERROR]", error);
    res.status(500).json({ message: "Error checking admin status" });
  }
}