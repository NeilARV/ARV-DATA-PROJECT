type NamedUser = { firstName: string; lastName: string };

/**
 * Full display name ("First Last") for a user, trimmed so a missing first or last name doesn't leave
 * a stray space. Returns '' when both are blank. Structural param so it works for any named entity
 * (DM users, candidates, admin users) without coupling to a specific wire type.
 */
export function formatUserName(user: NamedUser): string {
    return `${user.firstName} ${user.lastName}`.trim();
}
