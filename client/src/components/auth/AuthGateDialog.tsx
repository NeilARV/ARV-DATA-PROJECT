import { useLocation } from 'wouter';
import { LogIn } from 'lucide-react';

import AppDialog from '@/components/modals/Dialog';
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type AuthGateDialogProps = {
    open: boolean;
    onClose: () => void;
    /** Internal path to return to after the user signs in or signs up. */
    redirect?: string;
};

export function AuthGateDialog({ open, onClose, redirect }: AuthGateDialogProps) {
    const [, setLocation] = useLocation();

    const suffix = redirect ? `?redirect=${encodeURIComponent(redirect)}` : '';

    function goTo(path: string) {
        onClose();
        setLocation(`${path}${suffix}`);
    }

    return (
        <AppDialog open={open} onClose={onClose} className="sm:max-w-md">
            <DialogHeader>
                <DialogTitle data-testid="heading-auth-gate">Sign in to continue</DialogTitle>
                <DialogDescription>
                    Log in or create an account to access this part of ARV DATA.
                </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-3 pt-2">
                <Button onClick={() => goTo('/login')} data-testid="button-gate-login">
                    <LogIn className="w-4 h-4 mr-2" />
                    Log In
                </Button>
                <Button
                    variant="outline"
                    onClick={() => goTo('/signup')}
                    data-testid="button-gate-signup"
                >
                    Sign Up
                </Button>
            </div>
        </AppDialog>
    );
}
