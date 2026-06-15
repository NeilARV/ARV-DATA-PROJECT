import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LoginForm } from '@/components/auth/LoginForm';

interface LoginContentProps {
    onSuccess: () => void;
    onSwitchToSignup: () => void;
}

export default function LoginContent({ onSuccess, onSwitchToSignup }: LoginContentProps) {
    return (
        <>
            <DialogHeader>
                <DialogTitle data-testid="heading-login">Sign In</DialogTitle>
                <DialogDescription>
                    Sign in to your account to access all features.
                </DialogDescription>
            </DialogHeader>

            <LoginForm onSuccess={onSuccess} onSwitchToSignup={onSwitchToSignup} />
        </>
    );
}
