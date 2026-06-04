import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
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
    const [userMessage, setUserMessage] = useState('');

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            await apiRequest('POST', `/api/companies/${companyId}/claim`, {
                userMessage: userMessage.trim() || undefined,
            });
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
                <div>
                    <h2 className="text-lg font-semibold text-foreground">{formattedName}</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        {isClaimed ? 'Dispute company claim' : 'Claim this company'}
                    </p>
                </div>

                <p className="text-sm text-muted-foreground">
                    {isClaimed
                        ? `This company already has a verified owner. If you believe you have a right to this company, submit a dispute and our team will review it.`
                        : `Submit a claim to associate your account with ${formattedName}. Our team will review your request and approve it if everything checks out.`}
                </p>

                <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">
                        Message{' '}
                        <span className="text-muted-foreground font-normal">(optional)</span>
                    </label>
                    <Textarea
                        placeholder={
                            isClaimed
                                ? 'Explain why you have a right to this company...'
                                : 'Add any context that might help us verify your claim...'
                        }
                        value={userMessage}
                        onChange={(e) => setUserMessage(e.target.value)}
                        rows={3}
                        maxLength={1000}
                        disabled={isSubmitting}
                    />
                </div>

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
