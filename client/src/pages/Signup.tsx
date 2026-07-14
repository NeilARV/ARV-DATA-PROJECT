import { useLocation, useSearch } from 'wouter';

import { AuthPageShell } from '@/components/auth/AuthPageShell';
import { SignupForm } from '@/components/auth/SignupForm';

import { useToast } from '@/hooks/use-toast';
import { useRedirectWhenAuthenticated } from '@/hooks/useRedirectWhenAuthenticated';

import { getRedirectTarget } from '@/utils/authRedirect';

export default function Signup() {
    const [, setLocation] = useLocation();
    const search = useSearch();
    const { toast } = useToast();

    const redirectTarget = getRedirectTarget(search);

    useRedirectWhenAuthenticated(redirectTarget);

    return (
        <AuthPageShell
            title="Create Your Account"
            description="Sign up to access all property listings and save your searches."
        >
            <SignupForm
                onSuccess={() => {
                    toast({
                        title: 'Check your inbox',
                        description:
                            "We sent a link to verify your email. Verify it to unlock posting deals, offers, and community features.",
                    });
                    setLocation(redirectTarget);
                }}
                onSwitchToLogin={() => setLocation(`/login${search ? `?${search}` : ''}`)}
                onRequestAccess={() =>
                    toast({
                        title: 'Beta Access Required',
                        description:
                            'This app is currently in beta. Use the Contact Us option to request access.',
                        variant: 'destructive',
                    })
                }
            />
        </AuthPageShell>
    );
}
