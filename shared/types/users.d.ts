/** ARV team roles — stored in user_roles join table. A user can have many. */
type Roles = 'owner' | 'admin' | 'relationship-manager' | 'member'

/** Subscription tiers — stored as subscription_id FK on users. A user can have only one. */
type SubscriptionTier = 'basic' | 'pro' | 'premium'
