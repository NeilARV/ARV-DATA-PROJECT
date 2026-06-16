import { useMutation } from '@tanstack/react-query';
import { MailCheck } from 'lucide-react';

import AppDialog from '@/components/modals/Dialog';
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';

import { apiRequest } from '@/lib/queryClient';

type ResendVerificationModalProps = {
    open: boolean;
    onClose: () => void;
};

export function ResendVerificationModal({ open, onClose }: ResendVerificationModalProps) {
    const { user } = useAuth();
    const { toast } = useToast();

    const resendMutation = useMutation({
        mutationFn: () => apiRequest('POST', '/api/auth/resend-verification'),
        onSuccess: () => {
            toast({
                title: 'Verification email sent',
                description: 'Check your inbox for the link to verify your email address.',
            });
            onClose();
        },
        onError: (error: unknown) => {
            toast({
                title: 'Could not send email',
                description:
                    error instanceof Error
                        ? error.message
                        : 'Something went wrong. Please try again in a moment.',
                variant: 'destructive',
            });
        },
    });

    return (
        <AppDialog open={open} onClose={onClose} className="sm:max-w-md">
            <DialogHeader>
                <DialogTitle data-testid="heading-resend-verification">
                    Resend verification email
                </DialogTitle>
                <DialogDescription>
                    {user?.email
                        ? `We'll send a new verification link to ${user.email}.`
                        : "We'll send a new verification link to your email address."}
                </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-3 pt-2">
                <Button
                    onClick={() => resendMutation.mutate()}
                    disabled={resendMutation.isPending}
                    data-testid="button-resend-verification"
                >
                    <MailCheck className="w-4 h-4 mr-2" />
                    {resendMutation.isPending ? 'Sending…' : 'Resend'}
                </Button>
                <Button
                    variant="outline"
                    onClick={onClose}
                    disabled={resendMutation.isPending}
                    data-testid="button-resend-cancel"
                >
                    Cancel
                </Button>
            </div>
        </AppDialog>
    );
}
