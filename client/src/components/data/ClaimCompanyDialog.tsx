import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import AppDialog from '@/components/modals/Dialog';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { formatCompanyName } from '@shared/utils/formatCompanyName';

interface ClaimCompanyDialogProps {
    open: boolean;
    onClose: () => void;
    companyId: string;
    companyName: string;
}

export function ClaimCompanyDialog({
    open,
    onClose,
    companyId,
    companyName,
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
                title: 'Request submitted',
                description: `Your request to join ${formatCompanyName(companyName)} has been submitted for review.`,
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
            <DialogHeader>
                <DialogTitle>{formattedName}</DialogTitle>
                <DialogDescription>Request to join this company</DialogDescription>
            </DialogHeader>

            <p className="text-sm text-muted-foreground">
                Submit a request to associate your account with {formattedName}. Our team will
                review your request and approve it if everything checks out.
            </p>

            <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">
                    Message <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <Textarea
                    placeholder="Add any context that might help us verify your request..."
                    value={userMessage}
                    onChange={(e) => setUserMessage(e.target.value)}
                    rows={3}
                    maxLength={1000}
                    disabled={isSubmitting}
                />
            </div>

            <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                    Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={isSubmitting}>
                    {isSubmitting ? 'Submitting...' : 'Request to Join'}
                </Button>
            </div>
        </AppDialog>
    );
}
