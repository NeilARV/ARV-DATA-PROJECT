import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { useDialogs } from '@/hooks/useDialogs';
import { useToast } from '@/hooks/use-toast';

export function useRequireAuth() {
    const { isAuthenticated, isLoading } = useAuth();
    const { openDialog } = useDialogs();
    const { toast } = useToast();
    const [location] = useLocation();

    const requireAuth = (action: () => void) => {
        // Allow through while auth is loading to avoid blocking during hydration
        if (isLoading) return;
        if (!isAuthenticated) {
            toast({
                title: 'Sign in to continue',
                description: 'Log in or create an account to access this feature.',
            });
            openDialog({ type: 'authGate', redirect: location });
            return;
        }
        action();
    };

    return { requireAuth };
}
