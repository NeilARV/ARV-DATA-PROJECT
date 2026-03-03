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
  viewMode: View;
  onViewModeChange: (mode: View) => void;
  onSearch?: (query: string) => void;
  onPropertySelect?: (propertyId: string) => void;
  onLoginClick?: () => void;
  onSignupClick?: () => void;
  onLeaderboardClick?: () => void;
  onBuyersFeedClick?: () => void;
  onWholesaleClick?: () => void;
  onLogoClick?: () => void;
  county?: string; // County filter for suggestions
}

export type PropertySuggestion = {
  id: string;
  address: string;
  city: string;
  state: string;
  zipcode: string;
}