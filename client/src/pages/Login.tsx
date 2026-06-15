import { useEffect } from 'react';
import { useLocation, useSearch } from 'wouter';

import { AuthPageShell } from '@/components/auth/AuthPageShell';
import { LoginForm } from '@/components/auth/LoginForm';

import { useAuth } from '@/hooks/use-auth';

import { getRedirectTarget } from '@/utils/authRedirect';

export default function Login() {
    const [, setLocation] = useLocation();
    const search = useSearch();
    const { isAuthenticated } = useAuth();

    const redirectTarget = getRedirectTarget(search);

    useEffect(() => {
        if (isAuthenticated) setLocation(redirectTarget);
    }, [isAuthenticated, redirectTarget, setLocation]);

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
