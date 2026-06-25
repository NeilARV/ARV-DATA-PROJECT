import { useEffect } from 'react';
import { useLocation } from 'wouter';

import { useAuth } from '@/hooks/use-auth';

/**
 * Redirects an unauthenticated visitor to `/login?redirect=<path>` once auth has resolved — the
 * single place the "this app is behind login" rule lives. Pass `null`/`undefined` to disable (e.g.
 * a gate that shows a locked panel instead of redirecting). Returns whether a redirect is currently
 * pending so callers can render a spinner instead of flashing gated content before navigation.
 */
export function useRedirectWhenUnauthenticated(path: string | null | undefined): boolean {
    const [, setLocation] = useLocation();
    const { isLoading, isAuthenticated } = useAuth();

    const shouldRedirect = !!path && !isLoading && !isAuthenticated;

    useEffect(() => {
        if (shouldRedirect) {
            setLocation(`/login?redirect=${encodeURIComponent(path)}`);
        }
    }, [shouldRedirect, path, setLocation]);

    return shouldRedirect;
}
