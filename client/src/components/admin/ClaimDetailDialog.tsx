import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import AppDialog from '@/components/modals/Dialog';
import { format } from 'date-fns';
import { formatCompanyName } from '@shared/utils/formatCompanyName';

export interface ClaimRow {
    id: string;
    status: 'pending' | 'approved' | 'rejected';
    type: 'claim' | 'dispute';
    userMessage: string | null;
    adminNotes: string | null;
    adminMessage: string | null;
    reviewedAt: string | null;
    createdAt: string;
    userId: string;
    userFirstName: string;
    userLastName: string;
    userEmail: string;
    companyId: string;
    companyName: string;
    reviewerFirstName: string | null;
    reviewerLastName: string | null;
}

interface ClaimDetailDialogProps {
    claim: ClaimRow | null;
    onClose: () => void;
}

export default function ClaimDetailDialog({ claim, onClose }: ClaimDetailDialogProps) {
    return (
        <AppDialog open={!!claim} onClose={onClose} className="max-w-md">
            {claim && (
                <>
                    <DialogHeader>
                        <DialogTitle>{formatCompanyName(claim.companyName)}</DialogTitle>
                        <DialogDescription>Claim details</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3">
                        <div className="flex flex-col gap-0.5">
                            <span className="field-label">User</span>
                            <span className="field-value">
                                {claim.userFirstName} {claim.userLastName}
                            </span>
                            <span className="field-value">{claim.userEmail}</span>
                        </div>

                        <div className="flex gap-3">
                            <div className="flex flex-col gap-0.5 flex-1">
                                <span className="field-label">Type</span>
                                <Badge
                                    variant={claim.type === 'dispute' ? 'destructive' : 'outline'}
                                    className="w-fit capitalize text-base lg:text-lg font-medium px-3 py-1"
                                >
                                    {claim.type}
                                </Badge>
                            </div>
                            <div className="flex flex-col gap-0.5 flex-1">
                                <span className="field-label">Status</span>
                                <Badge
                                    variant={
                                        claim.status === 'approved'
                                            ? 'default'
                                            : claim.status === 'rejected'
                                              ? 'destructive'
                                              : 'secondary'
                                    }
                                    className="w-fit capitalize text-base lg:text-lg font-medium px-3 py-1"
                                >
                                    {claim.status}
                                </Badge>
                            </div>
                        </div>

                        <div className="flex flex-col gap-0.5">
                            <span className="field-label">Submitted</span>
                            <span className="field-value">
                                {format(new Date(claim.createdAt), "MMM d, yyyy 'at' h:mm a")}
                            </span>
                        </div>

                        {claim.userMessage && (
                            <div className="flex flex-col gap-0.5">
                                <span className="field-label">Message from User</span>
                                <span className="field-value">{claim.userMessage}</span>
                            </div>
                        )}

                        {claim.status !== 'pending' && (
                            <>
                                <div className="flex flex-col gap-0.5">
                                    <span className="text-sm font-medium text-foreground">
                                        Reviewed by
                                    </span>
                                    <span className="text-sm text-foreground">
                                        {claim.reviewerFirstName
                                            ? `${claim.reviewerFirstName} ${claim.reviewerLastName}`
                                            : '—'}
                                    </span>
                                </div>

                                <div className="flex flex-col gap-0.5">
                                    <span className="text-sm font-medium text-foreground">
                                        Reviewed at
                                    </span>
                                    <span className="text-sm text-foreground">
                                        {claim.reviewedAt
                                            ? format(
                                                  new Date(claim.reviewedAt),
                                                  "MMM d, yyyy 'at' h:mm a",
                                              )
                                            : '—'}
                                    </span>
                                </div>

                                {claim.adminMessage && (
                                    <div className="flex flex-col gap-0.5">
                                        <span className="text-sm font-medium text-foreground">
                                            Message sent to user
                                        </span>
                                        <span className="text-sm text-foreground whitespace-pre-wrap">
                                            {claim.adminMessage}
                                        </span>
                                    </div>
                                )}

                                {claim.adminNotes && (
                                    <div className="flex flex-col gap-0.5">
                                        <span className="text-sm font-medium text-foreground">
                                            Internal notes
                                        </span>
                                        <span className="text-sm text-foreground whitespace-pre-wrap">
                                            {claim.adminNotes}
                                        </span>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    <div className="flex justify-end">
                        <Button variant="outline" onClick={onClose}>
                            Close
                        </Button>
                    </div>
                </>
            )}
        </AppDialog>
    );
}
