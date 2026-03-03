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