// A company membership as returned by the /company-memberships endpoints (wire shape — dates are ISO strings).
export type UserMembership = {
    companyId: string;
    companyName: string;
    role: 'owner' | 'member' | null;
    isPrimary: boolean;
    joinedAt: string;
};

// A company-claim row as returned for admin review (wire shape — dates are ISO strings).
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
