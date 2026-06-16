import { requireAccess } from 'server/middleware/requireAccess';

/**
 * Returns a middleware that requires the user to have one of the given subscription tiers.
 * Subscription tiers (basic, pro, premium) are checked by joining users -> subscriptions.
 *
 * Pass bypassRoles to allow certain ARV team roles (e.g. admin, owner) through regardless of
 * subscription — useful for routes that should be accessible to both subscribers and internal
 * team members. Thin wrapper over requireAccess (tiers + role bypass). For ARV team role gating
 * use requireRole instead.
 */
export function requireSub(
    tierOrTiers: SubscriptionTier | SubscriptionTier[],
    options?: { bypassRoles?: Roles[] },
) {
    const allowedTiers = Array.isArray(tierOrTiers) ? tierOrTiers : [tierOrTiers];
    if (allowedTiers.length === 0) {
        throw new Error('requireSub: at least one subscription tier must be provided');
    }

    return requireAccess({
        tiers: allowedTiers,
        roles: options?.bypassRoles ?? [],
        forbiddenMessage: 'Forbidden - Subscription required',
        errorMessage: 'Error checking subscription',
    });
}
