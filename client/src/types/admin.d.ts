export type WhitelistEntry = {
    id: number;
    email: string;
    msaName: string | null;
    relationshipManagerId: string | null;
};

export type RelationshipManager = {
    id: string;
    first_name: string;
    last_name: string;
    phone: string;
    email: string;
    roles: string[];
};

export type ManagePropertiesTabProps = {
    properties: PropertyRow[];
    isLoading: boolean;
    onOpenUpload: () => void;
    selectedCounty: string;
    onCountyChange: (county: string) => void;
};

export type AdminUser = {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    createdAt: string;
    roles: string[];
    subscriptionTier: string | null;
    relationshipManagers?: RelationshipManagerAssignment[];
    accountTypes: string[];
};

export type AccountTypeOption = {
    id: number;
    name: string;
};

export type RoleOption = {
    id: number;
    name: string;
};

export type RolesTabProps = {
    isAdmin: boolean;
    isOwner?: boolean;
    currentUserId?: string | null;
};

export type RelationshipManagerAssignment = {
    id: string;
    firstName: string;
    lastName: string;
};

export type UsersTabProps = {
    isAdmin: boolean;
    canDeleteUser?: boolean;
    canManageSubscriptionTier?: boolean;
    canManageRelationshipManagers?: boolean;
    canManageAccountTypes?: boolean;
};

export type EmailListTabProps = {
    isAdmin: boolean;
    canEditEntries?: boolean;
};

export type UserListResponse = {
    data: AdminUser[];
    count: number;
};

export type WhitelistResponse = {
    data: WhitelistEntry[];
    count: number;
};
