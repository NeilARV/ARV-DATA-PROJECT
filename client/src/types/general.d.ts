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