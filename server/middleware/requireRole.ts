import { userRoles, roles } from '@database/schemas/users.schema';
import { Request, Response, NextFunction } from 'express';
import { db } from 'server/storage';
import { eq, and, inArray } from 'drizzle-orm';

/**
 * Returns a middleware that requires the user to have at least one of the given ARV team roles.
 * Team roles (owner, admin, relationship-manager, member) are checked via the user_roles join table.
 *
 * For subscription tier gating use requireSub instead.
 */
export function requireRole(roleOrRoles: Roles | readonly Roles[]) {
    const allowedRoles: Roles[] = Array.isArray(roleOrRoles) ? [...roleOrRoles] : [roleOrRoles];
    if (allowedRoles.length === 0) {
        throw new Error('requireRole: at least one role must be provided');
    }

    return async function requireRoleMiddleware(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.session.userId) {
                console.error(
                    `[AUTH DENIED] No user session for ${req.path}, Session ID: ${req.sessionID}`,
                );
                return res.status(401).json({ message: 'Unauthorized - Please log in' });
            }

            const rows = await db
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

            if (rows.length === 0) {
                console.error(
                    `[AUTH DENIED] User ${req.session.userId} has none of [${allowedRoles.join(', ')}] for ${req.path}`,
                );
                return res.status(403).json({ message: 'Forbidden - Required role access' });
            }

            console.log(
                `[AUTH GRANTED] User ${req.session.userId} (${rows[0].roleName}) accessing ${req.path}`,
            );
            next();
        } catch (error) {
            console.error('[AUTH ERROR]', error);
            res.status(500).json({ message: 'Error checking role' });
        }
    };
}
