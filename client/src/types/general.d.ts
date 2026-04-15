export type UpdateDialogInitialData = {
  companyName?: string;
  isArvClient?: boolean;
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
  onDealsClick?: () => void;
  county?: string; // County filter for suggestions
  /** When true, a forced auth dialog is active — Header should close its own modals */
  forcedDialogActive?: boolean;
}

export type PropertySuggestion = {
  id: string;
  address: string;
  city: string;
  state: string;
  zipcode: string;
}