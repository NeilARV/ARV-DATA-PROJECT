import { useState } from 'react';
import { Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AppDialog from '@/components/modals/Dialog';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { formatCompanyName } from '@shared/utils/formatCompanyName';

interface ClaimCompanyDialogProps {
    open: boolean;
    onClose: () => void;
    companyId: string;
    companyName: string;
    /** When true the company already has an approved member — show dispute UI */
    isClaimed: boolean;
}

export function ClaimCompanyDialog({
    open,
    onClose,
    companyId,
    companyName,
    isClaimed,
}: ClaimCompanyDialogProps) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            await apiRequest('POST', `/api/companies/${companyId}/claim`);
            toast({
                title: isClaimed ? 'Dispute submitted' : 'Claim submitted',
                description: `Your ${isClaimed ? 'dispute' : 'claim'} for ${formatCompanyName(companyName)} has been submitted for review.`,
            });
            onClose();
        } catch (err) {
            const raw = err instanceof Error ? err.message : 'An error occurred';
            const bodyPart = raw.includes(': ') ? raw.split(': ').slice(1).join(': ') : raw;
            let displayMessage = bodyPart;
            try {
                const parsed = JSON.parse(bodyPart);
                if (parsed?.message) displayMessage = parsed.message;
            } catch {
                /* not JSON */
            }
            toast({
                title: 'Submission failed',
                description: displayMessage,
                variant: 'destructive',
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const formattedName = formatCompanyName(companyName);

    return (
        <AppDialog open={open} onClose={onClose} className="max-w-md">
            <div className="space-y-4 p-1">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-foreground">
                            {isClaimed ? 'Dispute Company Claim' : 'Claim This Company'}
                        </h2>
                        <p className="text-sm text-muted-foreground">{formattedName}</p>
                    </div>
                </div>

                <p className="text-sm text-muted-foreground">
                    {isClaimed
                        ? `This company already has a verified owner. If you believe you have a right to this company, submit a dispute and our team will review it.`
                        : `Submit a claim to associate your account with ${formattedName}. Our team will review your request and approve it if everything checks out.`}
                </p>

                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={isSubmitting}>
                        {isSubmitting
                            ? 'Submitting...'
                            : isClaimed
                              ? 'Submit Dispute'
                              : 'Submit Claim'}
                    </Button>
                </div>
            </div>
        </AppDialog>
    );
}
