export type WhitelistEntry = {
    id: string;
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

export type EmailListTabProps = {
  isAdmin: boolean;
}

export type ManagePropertiesTabProps = {
  properties: PropertyRow[];
  isLoading: boolean;
  onOpenUpload: () => void;
  selectedCounty: string;
  onCountyChange: (county: string) => void;
}

export type AdminUser = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  createdAt: string;
  roles: string[];
  relationshipManagers?: { id: string; firstName: string; lastName: string }[];
}

export type RoleOption = {
  id: number;
  name: string;
}

export type RolesTabProps = {
    isAdmin: boolean;
    isOwner?: boolean;
    currentUserId?: string | null;
}