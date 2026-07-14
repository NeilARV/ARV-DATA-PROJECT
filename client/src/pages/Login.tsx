import { useLocation, useSearch } from 'wouter';

import { AuthPageShell } from '@/components/auth/AuthPageShell';
import { LoginForm } from '@/components/auth/LoginForm';

import { useRedirectWhenAuthenticated } from '@/hooks/useRedirectWhenAuthenticated';

import { getRedirectTarget } from '@/utils/authRedirect';

export default function Login() {
    const [, setLocation] = useLocation();
    const search = useSearch();

    const redirectTarget = getRedirectTarget(search);

    useRedirectWhenAuthenticated(redirectTarget);

    return (
        <AuthPageShell title="Sign In" description="Sign in to your account to access all features.">
            <LoginForm
                onSuccess={() => setLocation(redirectTarget)}
                onSwitchToSignup={() =>
                    setLocation(`/signup${search ? `?${search}` : ''}`)
                }
                onForgotPassword={() => setLocation('/forgot-password')}
            />
        </AuthPageShell>
    );
}
