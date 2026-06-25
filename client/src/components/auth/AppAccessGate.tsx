import type { ReactNode } from 'react';
import { useLocation } from 'wouter';
import { Lock, Loader2, Mail, type LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { useAuth } from '@/hooks/use-auth';
import { useRedirectWhenUnauthenticated } from '@/hooks/useRedirectWhenUnauthenticated';
import { buildContactUrl } from '@/lib/contactLink';

import type { ContactSubject } from '@database/validation/contactMessages.validation';

const DEFAULT_CONTACT_MESSAGE = 'I would like to request more access to the ARV data application';

type AppAccessLockedProps = {
    /** Path to return to after login/signup (unauthenticated case). */
    redirect?: string;
    /** Icon representing the gated area (e.g. Brain for Mastermind). */
    icon?: LucideIcon;
    title?: string;
    description?: string;
    /** Where the "back" button goes for an authenticated, no-access user. */
    backTo?: string;
    backLabel?: string;
    /** Prefill for the Contact Us form (matches the request-access flow used elsewhere). */
    contactSubject?: ContactSubject;
    contactMessage?: string;
};

// Shared "locked" panel for every app-access gate (Mastermind, Deals, and the Data feeds/table
// direct-URL fallback). Unauthenticated users get Log In / Sign Up; authenticated users without a
// subscription or team role get a Back button plus Contact Us — the same autofilled contact form
// shown when a no-sub user clicks a gated view toggle.
export function AppAccessLocked({
    redirect,
    icon: Icon = Lock,
    title,
    description,
    backTo = '/',
    backLabel = 'Back to Home',
    contactSubject = 'Request Access',
    contactMessage = DEFAULT_CONTACT_MESSAGE,
}: AppAccessLockedProps) {
    const [, setLocation] = useLocation();
    const { isAuthenticated } = useAuth();
    const suffix = redirect ? `?redirect=${encodeURIComponent(redirect)}` : '';

    return (
        <div className="h-full w-full flex flex-col items-center justify-center gap-4 p-6 text-center">
            <Icon className="w-10 h-10 text-muted-foreground" />
            <div className="space-y-1">
                <p className="text-base font-semibold text-foreground">
                    {title ?? (isAuthenticated ? 'Subscription required' : 'Sign in to continue')}
                </p>
                <p className="text-sm text-muted-foreground max-w-sm">
                    {description ??
                        (isAuthenticated
                            ? 'This area is available to ARV subscribers and team members. Upgrade your account or reach out to get access.'
                            : 'Log in or create an account with an active subscription to access this area.')}
                </p>
            </div>

            {isAuthenticated ? (
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setLocation(backTo)}>
                        {backLabel}
                    </Button>
                    <Button
                        size="sm"
                        onClick={() => setLocation(buildContactUrl(contactSubject, contactMessage))}
                    >
                        <Mail className="w-4 h-4 mr-2" />
                        Contact Us
                    </Button>
                </div>
            ) : (
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setLocation(`/login${suffix}`)}
                    >
                        Log In
                    </Button>
                    <Button size="sm" onClick={() => setLocation(`/signup${suffix}`)}>
                        Sign Up
                    </Button>
                </div>
            )}
        </div>
    );
}

type AppAccessGateProps = AppAccessLockedProps & {
    children: ReactNode;
    /**
     * When set, unauthenticated visitors are redirected to `/login?redirect=<path>` instead of
     * seeing the locked panel — used to put a whole app behind login. Authenticated users without
     * a subscription/team role still get the locked notice (the "request access" path).
     */
    redirectWhenUnauthenticated?: string;
};

// Page-level gate: renders children only when the user has app access (any subscription tier or
// team role), otherwise the shared locked panel. Holds a spinner while auth state resolves so a
// real subscriber never flashes the locked screen. Extra props are forwarded to AppAccessLocked.
export function AppAccessGate({
    children,
    redirectWhenUnauthenticated,
    ...lockedProps
}: AppAccessGateProps) {
    const { isLoading, isAuthenticated, isAdminStatusLoading, canAccessApp } = useAuth();
    const shouldRedirect = useRedirectWhenUnauthenticated(redirectWhenUnauthenticated);

    // Spinner while auth resolves, or while the redirect above is in flight.
    if (isLoading || (isAuthenticated && isAdminStatusLoading) || shouldRedirect) {
        return (
            <div className="h-full w-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!canAccessApp) {
        return <AppAccessLocked {...lockedProps} />;
    }

    return <>{children}</>;
}
