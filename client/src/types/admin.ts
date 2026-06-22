export type RelationshipManager = {
    id: string;
    first_name: string;
    last_name: string;
    phone: string;
    email: string;
    roles: string[];
};

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
