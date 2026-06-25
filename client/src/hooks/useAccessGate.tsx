import { useLocation } from 'wouter';

import { useAuth } from '@/hooks/use-auth';
import { useDialogs } from '@/hooks/useDialogs';
import type { SubscriptionTier } from '@shared/types/users';
import { useToast } from '@/hooks/use-toast';
import { buildContactUrl } from '@/lib/contactLink';

import type { ContactSubject } from '@database/validation/contactMessages.validation';

type RequireSubOptions = {
    tiers?: SubscriptionTier[];
    subject?: ContactSubject;
    message?: string;
};

const DEFAULT_REQUEST_MESSAGE = 'I would like to request more access to the ARV data application';

/**
 * Client-side access gating. `requireAuth` wraps an action behind login (opening the auth-gate
 * dialog when signed out); `requireSubscription` wraps it behind a subscription tier / team role
 * (routing to the prefilled /contact page when blocked).
 */
export function useAccessGate() {
    const {
        isAuthenticated,
        isLoading,
        isAdminStatusLoading,
        role,
        isBasic,
        isPro,
        isPremium,
        subscriptionTier,
    } = useAuth();
    const { openDialog } = useDialogs();
    const { toast } = useToast();
    const [location, setLocation] = useLocation();

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

    // Surfaces a toast and routes to the centralized contact page with the request prefilled.
    const block = (
        subject: ContactSubject,
        message: string,
        toastTitle: string,
        toastDescription: string,
    ) => {
        toast({ title: toastTitle, description: toastDescription });
        setLocation(buildContactUrl(subject, message));
    };

    const requireSubscription = (action: () => void, options?: RequireSubOptions) => {
        if (!isAuthenticated) {
            action();
            return;
        }

        if (options?.tiers) {
            const hasBypassRole = role !== null;
            const hasRequiredTier =
                subscriptionTier !== null && (options.tiers as string[]).includes(subscriptionTier);

            if (hasBypassRole || hasRequiredTier) {
                action();
                return;
            }

            const tierList = options.tiers
                .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
                .join(' or ');
            block(
                options.subject ?? 'Request Access',
                options.message ?? DEFAULT_REQUEST_MESSAGE,
                'Upgrade Required',
                `A ${tierList} subscription is required to access this area`,
            );
            return;
        }

        // No tiers specified — allow while loading to avoid blocking during hydration,
        // then gate on any team role or any subscription tier.
        const hasAccess = isAdminStatusLoading || role !== null || isBasic || isPro || isPremium;
        if (!hasAccess) {
            block(
                options?.subject ?? 'Request Access',
                options?.message ?? DEFAULT_REQUEST_MESSAGE,
                'Upgrade Account',
                'Please request an upgrade to your account to access this area',
            );
            return;
        }

        action();
    };

    return { requireAuth, requireSubscription };
}
