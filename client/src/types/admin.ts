export type RelationshipManagerAssignment = {
    id: string;
    firstName: string;
    lastName: string;
};

export type AdminUser = {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    createdAt: string;
    emailVerifiedAt: string | null;
    roles: string[];
    subscriptionTier: string | null;
    relationshipManagers?: RelationshipManagerAssignment[];
    accountTypes: string[];
};

export type AccountTypeOption = {
    id: number;
    name: string;
};

/** Tier filter value; 'all' clears the filter, 'none' matches users with no subscription tier. */
export type TierFilter = 'all' | 'basic' | 'pro' | 'premium' | 'none';

/** Email-verification filter for the admin user list. */
export type EmailVerifiedFilter = 'all' | 'verified' | 'unverified';

/** Company-association filter for the admin user list. */
export type CompanyFilter = 'all' | 'has' | 'none';

/** In-memory filter state for the admin Users tab (not persisted to the URL). */
export type UserFilters = {
    search: string;
    tier: TierFilter;
    accountTypes: string[];
    emailVerified: EmailVerifiedFilter;
    company: CompanyFilter;
};
