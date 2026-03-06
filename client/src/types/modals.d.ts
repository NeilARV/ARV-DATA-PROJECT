export type ConfirmationDialogProps = {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    variant?: "default" | "destructive";
    isLoading?: boolean;
}

export type LeaderboardDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompanyClick?: (companyName: string) => void;
}

export type LeaderboardData = {
  companies: Array<{ rank: number; name: string; count: number; contactName: string | null }>;
  zipCodes: Array<{ rank: number; zipCode: string; count: number }>;
}