import { useEffect, useRef, useState } from 'react';
import { Link, useSearch } from 'wouter';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

import { AuthPageShell } from '@/components/auth/AuthPageShell';
import { ResendVerificationModal } from '@/components/auth/ResendVerificationModal';
import { Button } from '@/components/ui/button';

import { useAuth } from '@/hooks/use-auth';

import { apiRequest, queryClient } from '@/lib/queryClient';

type VerifyState = 'verifying' | 'success' | 'error';

export default function VerifyEmail() {
    const search = useSearch();
    const { isAuthenticated } = useAuth();
    const [state, setState] = useState<VerifyState>('verifying');
    const [resendOpen, setResendOpen] = useState(false);
    // Strict mode mounts effects twice in dev; the token is single-use, so guard the call.
    const hasVerified = useRef(false);

    useEffect(() => {
        if (hasVerified.current) return;
        hasVerified.current = true;

        const token = new URLSearchParams(search).get('token');
        if (!token) {
            setState('error');
            return;
        }

        async function verify() {
            try {
                await apiRequest('POST', '/api/auth/verify-email', { token });
                await queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
                setState('success');
            } catch {
                setState('error');
            }
        }
        verify();
    }, [search]);

    return (
        <AuthPageShell
            title="Email Verification"
            description="Confirming your email address with ARV Finance."
        >
            {state === 'verifying' && (
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                    <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
                    <p className="text-sm text-muted-foreground">Verifying your email…</p>
                </div>
            )}

            {state === 'success' && (
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                    <CheckCircle2 className="w-8 h-8 text-status-online" />
                    <p className="text-base font-semibold text-foreground">Email verified</p>
                    <p className="text-sm text-muted-foreground">
                        Your email address is confirmed. You now have full access to posting,
                        offers, and community features.
                    </p>
                    <Button asChild className="mt-2">
                        <Link href="/">Continue to ARV Finance</Link>
                    </Button>
                </div>
            )}

            {state === 'error' && (
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                    <XCircle className="w-8 h-8 text-destructive" />
                    <p className="text-base font-semibold text-foreground">
                        This link is invalid or expired
                    </p>
                    <p className="text-sm text-muted-foreground">
                        Verification links expire after 24 hours and can only be used once.
                        {isAuthenticated
                            ? ' Request a fresh link below.'
                            : ' Log in and request a fresh link from the banner or your profile.'}
                    </p>
                    {isAuthenticated ? (
                        <Button className="mt-2" onClick={() => setResendOpen(true)}>
                            Resend verification
                        </Button>
                    ) : (
                        <Button asChild className="mt-2">
                            <Link href="/login">Log In</Link>
                        </Button>
                    )}
                </div>
            )}

            <ResendVerificationModal open={resendOpen} onClose={() => setResendOpen(false)} />
        </AuthPageShell>
    );
}
