import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, CheckCircle, XCircle, Building2, Eye } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import AppDialog from '@/components/modals/Dialog';
import { DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { formatCompanyName } from '@shared/utils/formatCompanyName';
import ClaimDetailDialog from '@/components/admin/ClaimDetailDialog';
import type { ClaimRow } from '@/types/admin';

type ReviewAction = 'approve' | 'reject';

interface ReviewDialogState {
    claimId: string;
    action: ReviewAction;
    companyName: string;
    userName: string;
}

export default function CompanyClaimsTab() {
    const { toast } = useToast();
    const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected'>(
        'pending',
    );
    const [reviewDialog, setReviewDialog] = useState<ReviewDialogState | null>(null);
    const [adminNotes, setAdminNotes] = useState('');
    const [adminMessage, setAdminMessage] = useState('');
    const [detailClaim, setDetailClaim] = useState<ClaimRow | null>(null);

    const { data, isLoading } = useQuery<{ data: ClaimRow[]; count: number }>({
        queryKey: ['/api/claims', statusFilter],
        queryFn: async () => {
            const res = await fetch(`/api/claims?status=${statusFilter}`, {
                credentials: 'include',
            });
            if (!res.ok) throw new Error(`Failed to fetch claims: ${res.status}`);
            return res.json();
        },
    });

    const reviewMutation = useMutation({
        mutationFn: async ({
            claimId,
            action,
            notes,
            message,
        }: {
            claimId: string;
            action: ReviewAction;
            notes: string;
            message: string;
        }) => {
            const res = await apiRequest('PATCH', `/api/claims/${claimId}`, {
                action,
                adminNotes: notes.trim() || undefined,
                adminMessage: message.trim() || undefined,
            });
            return res.json();
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['/api/claims'] });
            toast({
                title: variables.action === 'approve' ? 'Claim approved' : 'Claim rejected',
                description:
                    variables.action === 'approve'
                        ? 'The user has been linked to the company.'
                        : 'The claim has been rejected.',
            });
            setReviewDialog(null);
            setAdminNotes('');
            setAdminMessage('');
        },
        onError: (err) => {
            const raw = err instanceof Error ? err.message : 'An error occurred';
            const bodyPart = raw.includes(': ') ? raw.split(': ').slice(1).join(': ') : raw;
            let displayMessage = bodyPart;
            try {
                const parsed = JSON.parse(bodyPart);
                if (parsed?.message) displayMessage = parsed.message;
            } catch {
                /* not JSON */
            }
            toast({ title: 'Action failed', description: displayMessage, variant: 'destructive' });
        },
    });

    const openReview = (claim: ClaimRow, action: ReviewAction) => {
        setAdminNotes('');
        setAdminMessage('');
        setReviewDialog({
            claimId: claim.id,
            action,
            companyName: claim.companyName,
            userName: `${claim.userFirstName} ${claim.userLastName}`,
        });
    };

    const claims = data?.data ?? [];

    return (
        <>
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Building2 className="w-5 h-5" />
                                Company Claims
                            </CardTitle>
                            <CardDescription>
                                Review and approve or reject user claims to companies.
                            </CardDescription>
                        </div>
                        <div className="flex gap-2">
                            {(['pending', 'approved', 'rejected'] as const).map((s) => (
                                <Button
                                    key={s}
                                    variant={statusFilter === s ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => setStatusFilter(s)}
                                    className="capitalize"
                                >
                                    {s}
                                </Button>
                            ))}
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="tab-loading">
                            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : claims.length === 0 ? (
                        <div className="tab-empty-state">
                            <Building2 className="w-16 h-16 text-muted-foreground" />
                            <p className="text-muted-foreground">No {statusFilter} claims.</p>
                        </div>
                    ) : (
                        <div className="table-scroll-wrapper">
                            <div className="table-scroll-body">
                                <Table>
                                    <TableHeader className="sticky top-0 bg-background">
                                        <TableRow>
                                            <TableHead>User</TableHead>
                                            <TableHead>Company</TableHead>
                                            <TableHead>Submitted</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {claims.map((claim) => (
                                            <TableRow key={claim.id}>
                                                <TableCell>
                                                    <div className="font-medium text-sm">
                                                        {claim.userFirstName} {claim.userLastName}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {claim.userEmail}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="font-medium text-sm">
                                                    {formatCompanyName(claim.companyName)}
                                                </TableCell>
                                                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                                                    {format(
                                                        new Date(claim.createdAt),
                                                        'MMM d, yyyy',
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge
                                                        variant={
                                                            claim.status === 'approved'
                                                                ? 'green'
                                                                : claim.status === 'rejected'
                                                                  ? 'destructive'
                                                                  : 'secondary'
                                                        }
                                                        className="capitalize"
                                                    >
                                                        {claim.status}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex justify-end gap-2">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => setDetailClaim(claim)}
                                                            data-testid={`button-view-claim-${claim.id}`}
                                                        >
                                                            <Eye className="w-4 h-4 mr-1" />
                                                            View
                                                        </Button>
                                                        {claim.status === 'pending' && (
                                                            <>
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    className="text-green-600 border-green-600 hover:bg-green-50 dark:hover:bg-green-950"
                                                                    onClick={() =>
                                                                        openReview(claim, 'approve')
                                                                    }
                                                                    data-testid={`button-approve-claim-${claim.id}`}
                                                                >
                                                                    <CheckCircle className="w-4 h-4 mr-1" />
                                                                    Approve
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    className="text-destructive border-destructive hover:bg-destructive/10"
                                                                    onClick={() =>
                                                                        openReview(claim, 'reject')
                                                                    }
                                                                    data-testid={`button-reject-claim-${claim.id}`}
                                                                >
                                                                    <XCircle className="w-4 h-4 mr-1" />
                                                                    Reject
                                                                </Button>
                                                            </>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Approve / Reject confirmation dialog */}
            <AppDialog
                open={!!reviewDialog}
                onClose={() => {
                    setReviewDialog(null);
                    setAdminNotes('');
                    setAdminMessage('');
                }}
                className="max-w-md"
            >
                {reviewDialog && (
                    <>
                        <DialogHeader>
                            <DialogTitle>{formatCompanyName(reviewDialog.companyName)}</DialogTitle>
                            <DialogDescription>
                                {reviewDialog.action === 'approve'
                                    ? 'Approve join request'
                                    : 'Reject join request'}
                            </DialogDescription>
                        </DialogHeader>

                        <p className="rm-label">
                            {reviewDialog.action === 'approve'
                                ? `Approve ${reviewDialog.userName}'s request to join this company? They will be added as a member.`
                                : `Reject ${reviewDialog.userName}'s request to join this company?`}
                        </p>

                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-foreground">
                                Message to user{' '}
                                <span className="text-muted-foreground font-normal">
                                    (optional — sent in email)
                                </span>
                            </label>
                            <Textarea
                                placeholder={
                                    reviewDialog.action === 'reject'
                                        ? 'Explain why the claim was rejected...'
                                        : 'Any message to include in the approval email...'
                                }
                                value={adminMessage}
                                onChange={(e) => setAdminMessage(e.target.value)}
                                rows={3}
                                maxLength={1000}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-foreground">
                                Internal notes{' '}
                                <span className="text-muted-foreground font-normal">
                                    (optional — not sent to user)
                                </span>
                            </label>
                            <Textarea
                                placeholder="Private notes for the admin team..."
                                value={adminNotes}
                                onChange={(e) => setAdminNotes(e.target.value)}
                                rows={2}
                                maxLength={1000}
                            />
                        </div>

                        <div className="flex justify-end gap-2">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setReviewDialog(null);
                                    setAdminNotes('');
                                    setAdminMessage('');
                                }}
                                disabled={reviewMutation.isPending}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant={
                                    reviewDialog.action === 'reject' ? 'destructive' : 'default'
                                }
                                onClick={() =>
                                    reviewMutation.mutate({
                                        claimId: reviewDialog.claimId,
                                        action: reviewDialog.action,
                                        notes: adminNotes,
                                        message: adminMessage,
                                    })
                                }
                                disabled={reviewMutation.isPending}
                                data-testid="button-confirm-review"
                            >
                                {reviewMutation.isPending ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        {reviewDialog.action === 'approve'
                                            ? 'Approving...'
                                            : 'Rejecting...'}
                                    </>
                                ) : reviewDialog.action === 'approve' ? (
                                    'Approve'
                                ) : (
                                    'Reject'
                                )}
                            </Button>
                        </div>
                    </>
                )}
            </AppDialog>

            <ClaimDetailDialog claim={detailClaim} onClose={() => setDetailClaim(null)} />
        </>
    );
}
