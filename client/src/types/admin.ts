export type RelationshipManagerRow = {
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

// A company-claim row as returned for admin review (CompanyClaimsTab + ClaimDetailDialog).
export type ClaimRow = {
    id: string;
    status: 'pending' | 'approved' | 'rejected';
    userMessage: string | null;
    adminNotes: string | null;
    adminMessage: string | null;
    reviewedAt: string | null;
    createdAt: string;
    userId: string;
    userFirstName: string;
    userLastName: string;
    userEmail: string;
    companyId: string;
    companyName: string;
    reviewerFirstName: string | null;
    reviewerLastName: string | null;
};
