import { requireAccess } from 'server/middleware/requireAccess';
import type { Roles } from '@shared/types/users';

/**
 * Returns a middleware that requires the user to have at least one of the given ARV team roles.
 * Team roles (owner, admin, relationship-manager, member) are checked via the user_roles join table.
 *
 * Thin wrapper over requireAccess (role-only). For subscription tier gating use requireSub instead.
 */
export function requireRole(roleOrRoles: Roles | readonly Roles[]) {
    const allowedRoles: Roles[] = Array.isArray(roleOrRoles) ? [...roleOrRoles] : [roleOrRoles];
    if (allowedRoles.length === 0) {
        throw new Error('requireRole: at least one role must be provided');
    }

    return requireAccess({
        roles: allowedRoles,
        forbiddenMessage: 'Forbidden - Required role access',
        errorMessage: 'Error checking role',
    });
}
