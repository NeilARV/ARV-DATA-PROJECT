import type { Roles } from '@shared/types/users';

// Canonical ARV team role groups. Use these instead of inlining role tuples at call sites so a
// role's access surface changes in one place. Typed against the shared `Roles` union so a typo or
// a removed role fails the build.

/** Full admin capabilities — owner and admin only. */
export const ADMIN_ROLES = ['admin', 'owner'] as const satisfies readonly Roles[];

/** Privileged staff — admin, owner, and relationship managers. */
export const PRIVILEGED_ROLES = [
    'admin',
    'owner',
    'relationship-manager',
] as const satisfies readonly Roles[];

/** Any internal team member — used for admin-panel and Mastermind access. */
export const ALL_TEAM_ROLES = [
    'admin',
    'owner',
    'relationship-manager',
    'member',
] as const satisfies readonly Roles[];
