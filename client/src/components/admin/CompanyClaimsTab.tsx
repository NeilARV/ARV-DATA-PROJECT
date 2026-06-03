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
import { format } from 'date-fns';
import { formatCompanyName } from '@shared/utils/formatCompanyName';

interface ClaimRow {
    id: string;
    status: 'pending' | 'approved' | 'rejected';
    type: 'claim' | 'dispute';
    adminNotes: string | null;
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

type ReviewAction = 'approve' | 'reject';

interface ReviewDialogState {
    claimId: string;
    action: ReviewAction;
    claimType: 'claim' | 'dispute';
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
        }: {
            claimId: string;
            action: ReviewAction;
            notes: string;
        }) => {
            const res = await apiRequest('PATCH', `/api/claims/${claimId}`, {
                action,
                adminNotes: notes.trim() || undefined,
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
        setReviewDialog({
            claimId: claim.id,
            action,
            claimType: claim.type,
            companyName: claim.companyName,
            userName: `${claim.userFirstName} ${claim.userLastName}`,
        });
    };

    const claims = data?.data ?? [];
    const isPending = statusFilter === 'pending';

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
                        <div className="flex justify-center py-12">
                            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : claims.length === 0 ? (
                        <div className="text-center text-muted-foreground py-12 text-sm">
                            No {statusFilter} claims.
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>User</TableHead>
                                    <TableHead>Company</TableHead>
                                    <TableHead>Submitted</TableHead>
                                    <TableHead>Type</TableHead>
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
                                            {format(new Date(claim.createdAt), 'MMM d, yyyy')}
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant={
                                                    claim.type === 'dispute'
                                                        ? 'destructive'
                                                        : 'outline'
                                                }
                                                className="capitalize"
                                            >
                                                {claim.type}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant={
                                                    claim.status === 'approved'
                                                        ? 'default'
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
                                                {isPending ? (
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
                                                ) : (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => setDetailClaim(claim)}
                                                        data-testid={`button-view-claim-${claim.id}`}
                                                    >
                                                        <Eye className="w-4 h-4 mr-1" />
                                                        View
                                                    </Button>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Approve / Reject confirmation dialog */}
            <AppDialog
                open={!!reviewDialog}
                onClose={() => {
                    setReviewDialog(null);
                    setAdminNotes('');
                }}
                className="max-w-md"
            >
                {reviewDialog && (
                    <div className="space-y-4 p-1">
                        <div>
                            <h2 className="text-lg font-semibold text-foreground">
                                {reviewDialog.action === 'approve'
                                    ? reviewDialog.claimType === 'dispute'
                                        ? 'Approve Dispute'
                                        : 'Approve Claim'
                                    : 'Reject Claim'}
                            </h2>
                            <p className="text-sm text-muted-foreground mt-1">
                                {reviewDialog.action === 'approve' &&
                                reviewDialog.claimType === 'dispute'
                                    ? `Approving this dispute will remove the current owner and make ${reviewDialog.userName} the new owner of ${formatCompanyName(reviewDialog.companyName)}. This cannot be undone.`
                                    : reviewDialog.action === 'approve'
                                      ? `Approve ${reviewDialog.userName}'s claim to ${formatCompanyName(reviewDialog.companyName)}? This will make them the owner.`
                                      : `Reject ${reviewDialog.userName}'s claim to ${formatCompanyName(reviewDialog.companyName)}?`}
                            </p>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-foreground">
                                Admin notes{' '}
                                <span className="text-muted-foreground font-normal">
                                    (optional)
                                </span>
                            </label>
                            <Textarea
                                placeholder={
                                    reviewDialog.action === 'reject'
                                        ? 'Reason for rejection...'
                                        : 'Any notes about this approval...'
                                }
                                value={adminNotes}
                                onChange={(e) => setAdminNotes(e.target.value)}
                                rows={3}
                                maxLength={1000}
                            />
                        </div>

                        <div className="flex justify-end gap-2">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setReviewDialog(null);
                                    setAdminNotes('');
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
                    </div>
                )}
            </AppDialog>

            {/* Claim detail modal (approved / rejected views) */}
            <AppDialog
                open={!!detailClaim}
                onClose={() => setDetailClaim(null)}
                className="max-w-md"
            >
                {detailClaim && (
                    <div className="space-y-4 p-1">
                        <div>
                            <h2 className="text-lg font-semibold text-foreground">Claim Details</h2>
                            <p className="text-sm text-muted-foreground mt-0.5">
                                {formatCompanyName(detailClaim.companyName)}
                            </p>
                        </div>

                        <div className="space-y-3 text-sm">
                            <div className="flex flex-col gap-0.5">
                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                    Claimant
                                </span>
                                <span className="text-foreground font-medium">
                                    {detailClaim.userFirstName} {detailClaim.userLastName}
                                </span>
                                <span className="text-muted-foreground text-xs">
                                    {detailClaim.userEmail}
                                </span>
                            </div>

                            <div className="flex flex-col gap-0.5">
                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                    Status
                                </span>
                                <Badge
                                    variant={
                                        detailClaim.status === 'approved'
                                            ? 'default'
                                            : 'destructive'
                                    }
                                    className="w-fit capitalize"
                                >
                                    {detailClaim.status}
                                </Badge>
                            </div>

                            <div className="flex flex-col gap-0.5">
                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                    Submitted
                                </span>
                                <span className="text-foreground">
                                    {format(
                                        new Date(detailClaim.createdAt),
                                        "MMM d, yyyy 'at' h:mm a",
                                    )}
                                </span>
                            </div>

                            <div className="flex flex-col gap-0.5">
                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                    Reviewed By
                                </span>
                                <span className="text-foreground">
                                    {detailClaim.reviewerFirstName
                                        ? `${detailClaim.reviewerFirstName} ${detailClaim.reviewerLastName}`
                                        : '—'}
                                </span>
                            </div>

                            <div className="flex flex-col gap-0.5">
                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                    Reviewed At
                                </span>
                                <span className="text-foreground">
                                    {detailClaim.reviewedAt
                                        ? format(
                                              new Date(detailClaim.reviewedAt),
                                              "MMM d, yyyy 'at' h:mm a",
                                          )
                                        : '—'}
                                </span>
                            </div>

                            <div className="flex flex-col gap-0.5">
                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                    Admin Notes
                                </span>
                                <span className="text-foreground whitespace-pre-wrap">
                                    {detailClaim.adminNotes ?? '—'}
                                </span>
                            </div>
                        </div>

                        <div className="flex justify-end pt-1">
                            <Button variant="outline" onClick={() => setDetailClaim(null)}>
                                Close
                            </Button>
                        </div>
                    </div>
                )}
            </AppDialog>
        </>
    );
}
