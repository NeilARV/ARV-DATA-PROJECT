export type UpdateDialogProps = {
    open: boolean;
    onClose: () => void;
    companyId: string | null;
    onSuccess?: () => void;
}