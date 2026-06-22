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
