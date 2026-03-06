export type UpdateDialogProps = {
    open: boolean;
    onClose: () => void;
    companyId: string | null;
    onSuccess?: () => void;
}

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
  county?: string; // County filter for suggestions
}

export type PropertySuggestion = {
  id: string;
  address: string;
  city: string;
  state: string;
  zipcode: string;
}