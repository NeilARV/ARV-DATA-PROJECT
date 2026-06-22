import { useState } from 'react';
import { useLocation } from 'wouter';

import AppDialog from '@/components/modals/Dialog';
import ContactContent from '@/components/modals/Contact';

import { useAuth } from '@/hooks/use-auth';
import { useDialogs } from '@/hooks/useDialogs';
import type { SubscriptionTier } from '@shared/types/users';
import { useToast } from '@/hooks/use-toast';

import type { ContactSubject } from '@database/validation/contactMessages.validation';

type RequireSubOptions = {
    tiers?: SubscriptionTier[];
    subject?: ContactSubject;
    message?: string;
};

/**
 * Client-side access gating. `requireAuth` wraps an action behind login (opening the auth-gate
 * dialog when signed out); `requireSubscription` wraps it behind a subscription tier / team role
 * (surfacing the contact dialog when blocked). Render `ContactDialog` once where the hook is used.
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
        user,
    } = useAuth();
    const { openDialog } = useDialogs();
    const { toast } = useToast();
    const [location] = useLocation();

    const [showContact, setShowContact] = useState(false);
    const [contactSubject, setContactSubject] = useState<ContactSubject>('Request Access');
    const [contactMessage, setContactMessage] = useState(
        'I would like to request more access to the ARV data application',
    );

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

    const block = (
        subject: ContactSubject,
        message: string,
        toastTitle: string,
        toastDescription: string,
    ) => {
        toast({ title: toastTitle, description: toastDescription });
        setContactSubject(subject);
        setContactMessage(message);
        setShowContact(true);
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
                options.message ??
                    'I would like to request more access to the ARV data application',
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
                options?.message ??
                    'I would like to request more access to the ARV data application',
                'Upgrade Account',
                'Please request an upgrade to your account to access this area',
            );
            return;
        }

        action();
    };

    const ContactDialog = (
        <AppDialog open={showContact} onClose={() => setShowContact(false)} className="max-w-lg">
            {showContact && (
                <ContactContent
                    onClose={() => setShowContact(false)}
                    onSuccess={() => {
                        toast({
                            title: 'Message Sent',
                            description: 'We will get back to you shortly.',
                        });
                    }}
                    defaultSubject={contactSubject}
                    defaultMessage={contactMessage}
                    defaultFirstName={user?.firstName}
                    defaultLastName={user?.lastName}
                    defaultEmail={user?.email}
                    defaultPhone={user?.phone}
                />
            )}
        </AppDialog>
    );

    return { requireAuth, requireSubscription, ContactDialog, showContact, setShowContact };
}
