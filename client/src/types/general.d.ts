export type UpdateDialogInitialData = {
  companyName?: string;
  contactName?: string;
  contactEmail?: string;
  phoneNumber?: string;
};

export type UpdateDialogProps = {
  open: boolean;
  onClose: () => void;
  companyId: string | null;
  /** Pre-fill form from directory/list to avoid fetch; when provided, fetch is skipped on open */
  initialData?: UpdateDialogInitialData | null;
  onSuccess?: () => void;
};

export type UploadDialogProps = {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export type HeaderProps = {
  onSearch?: (query: string) => void;
  onLoginClick?: () => void;
  onSignupClick?: () => void;
  onLeaderboardClick?: () => void;
  onRMClick?: () => void;
  county?: string; // County filter for suggestions
}

export type PropertySuggestion = {
  id: string;
  address: string;
  city: string;
  state: string;
  zipcode: string;
}