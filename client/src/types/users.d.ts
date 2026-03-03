export type LoginDialogProps ={
    open: boolean;
    forced?: boolean;
    onClose: () => void;
    onSuccess: () => void;
    onSwitchToSignup: () => void;
}