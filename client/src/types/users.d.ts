export type LoginDialogProps ={
    open: boolean;
    forced?: boolean;
    onClose: () => void;
    onSuccess: () => void;
    onSwitchToSignup: () => void;
}

export type SignupDialogProps = {
    open: boolean;
    forced?: boolean;
    onClose: () => void;
    onSuccess: () => void;
    onSwitchToLogin: () => void;
}