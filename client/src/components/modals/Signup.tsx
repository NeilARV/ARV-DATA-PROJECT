import { useState } from 'react';
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SignupForm, type RequestAccessPrefill } from '@/components/auth/SignupForm';
import { useToast } from '@/hooks/use-toast';
import ContactContent from '@/components/modals/Contact';

interface SignupContentProps {
    onSuccess: () => void;
    onSwitchToLogin: () => void;
}

export default function SignupContent({ onSuccess, onSwitchToLogin }: SignupContentProps) {
    const { toast } = useToast();
    const [requestAccessPrefill, setRequestAccessPrefill] = useState<RequestAccessPrefill | null>(
        null,
    );

    // Swap dialog content: show Contact form in place of Signup form
    if (requestAccessPrefill) {
        return (
            <ContactContent
                onClose={() => setRequestAccessPrefill(null)}
                onSuccess={() => {
                    toast({
                        title: 'Request Received',
                        description: 'We will get back to you shortly.',
                    });
                }}
                defaultSubject="Request Access"
                defaultFirstName={requestAccessPrefill.firstName}
                defaultLastName={requestAccessPrefill.lastName}
                defaultEmail={requestAccessPrefill.email}
                defaultMessage="I would like to request access to ARV DATA."
            />
        );
    }

    return (
        <>
            <DialogHeader>
                <DialogTitle data-testid="heading-signup">Create Your Account</DialogTitle>
                <DialogDescription>
                    Sign up to access all property listings and save your searches.
                </DialogDescription>
            </DialogHeader>

            <SignupForm
                onSuccess={onSuccess}
                onSwitchToLogin={onSwitchToLogin}
                onRequestAccess={setRequestAccessPrefill}
            />
        </>
    );
}
