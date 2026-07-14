import { useEffect } from 'react';
import { useLocation } from 'wouter';

import { useAuth } from '@/hooks/use-auth';

/** Redirects an already-authenticated visitor to `target` once auth resolves — the guest-only-page counterpart to useRedirectWhenUnauthenticated. */
export function useRedirectWhenAuthenticated(target: string): void {
    const [, setLocation] = useLocation();
    const { isAuthenticated } = useAuth();

    useEffect(() => {
        if (isAuthenticated) setLocation(target);
    }, [isAuthenticated, target, setLocation]);
}
