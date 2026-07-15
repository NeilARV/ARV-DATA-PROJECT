/** ARV team roles — stored in user_roles join table. A user can have many. */
export type Roles = 'owner' | 'admin' | 'relationship-manager' | 'member';

/** Subscription tiers — stored as subscription_id FK on users. A user can have only one. */
export type SubscriptionTier = 'basic' | 'pro' | 'premium';

/** A county the user subscribes to, on the authenticated-user payload. `msaName`/`msaId` are the
 *  county's parent MSA (derived from COUNTY_TO_MSA), so consumers can group counties by MSA. */
export type CountySubscription = {
    county: string;
    state: string;
    msaId: number;
    msaName: string;
};

/** A relationship manager (RM) — camelCase contact shape used by both the admin RM list and the
 *  RM embedded on the authenticated user. `roles` is present only on the admin list. */
export type RelationshipManager = {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    roles?: string[];
};
