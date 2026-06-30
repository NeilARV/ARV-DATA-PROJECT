import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
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
import { AlertTriangle, CheckCircle2, Loader2, Mail } from 'lucide-react';
import { format } from 'date-fns';
import AppDialog from '@/components/modals/Dialog';
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { approveCodeViolationUpload, fetchCodeViolationUpload } from '@/api/code-violations.api';
import {
    CV_PROCESSING_STATUS_BADGE,
    CV_UPLOAD_STATUS_BADGE,
    isUploadInFlight,
} from '@/constants/codeViolations.constants';
import type {
    CvProcessingStatus,
    CvUploadDetailResponse,
    CvViolationDetail,
} from '@shared/types/code-violations';

type CodeViolationUploadDetailProps = {
    /** The upload to show; the dialog is open whenever this is non-null. */
    uploadId: string | null;
    onClose: () => void;
};

// Render order: rows needing a human first (awaiting review, then ambiguous/failed), settled last.
const STATUS_SORT: Record<CvProcessingStatus, number> = {
    awaiting_review: 0,
    ambiguous: 1,
    failed: 2,
    processing: 3,
    pending: 4,
    complete: 5,
    no_match: 6,
};

function plural(n: number, noun: string): string {
    return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/**
 * Detail / dry-run panel for one ingest run (§4.6): shows every complaint the upload introduced with
 * its per-complaint status, resolved owner, and the recipients an approve would email — and, while
 * the run is in `review`, an Approve & Notify action that fires those held emails.
 */
export default function CodeViolationUploadDetail({
    uploadId,
    onClose,
}: CodeViolationUploadDetailProps) {
    const { toast } = useToast();
    const [confirmingApprove, setConfirmingApprove] = useState(false);

    const { data, isLoading } = useQuery<CvUploadDetailResponse>({
        queryKey: ['/api/code-violations/uploads', uploadId],
        queryFn: () => fetchCodeViolationUpload(uploadId as string),
        enabled: uploadId !== null,
        refetchInterval: (query) => {
            const status = query.state.data?.upload.status;
            return status && isUploadInFlight(status) ? 3000 : false;
        },
    });

    const approveMutation = useMutation({
        mutationFn: () => approveCodeViolationUpload(uploadId as string),
        onSuccess: (result) => {
            // Partial-key invalidation refreshes both this detail and the history list.
            queryClient.invalidateQueries({ queryKey: ['/api/code-violations/uploads'] });
            setConfirmingApprove(false);
            toast({
                title: 'Notifications sent',
                description: `Emailed ${plural(result.emailsSent, 'email')} across ${plural(result.violationsNotified, 'complaint')}.`,
            });
        },
        onError: (err) => {
            toast({
                title: 'Approval failed',
                description: err instanceof Error ? err.message : 'Could not send notifications.',
                variant: 'destructive',
            });
        },
    });

    const upload = data?.upload ?? null;
    const violations = useMemo(
        () =>
            [...(data?.violations ?? [])].sort(
                (a, b) => STATUS_SORT[a.processingStatus] - STATUS_SORT[b.processingStatus],
            ),
        [data?.violations],
    );

    const matched = violations.filter((v) => v.propertyId !== null).length;
    const issues = violations.filter(
        (v) =>
            v.processingStatus === 'no_match' ||
            v.processingStatus === 'ambiguous' ||
            v.processingStatus === 'failed',
    ).length;
    const awaitingReview = violations.filter((v) => v.processingStatus === 'awaiting_review');
    const emailedCount = violations.filter((v) => v.notified).length;
    // One email is sent per (complaint, recipient); the distinct recipient count is smaller when a
    // user owns several awaiting-review complaints. Track both so the copy doesn't conflate them.
    const pendingEmailCount = awaitingReview.reduce((sum, v) => sum + v.recipients.length, 0);
    const distinctRecipientCount = new Set(
        awaitingReview.flatMap((v) => v.recipients.map((r) => r.userId)),
    ).size;

    const isReview = upload?.status === 'review';
    const uploadBadge = upload ? CV_UPLOAD_STATUS_BADGE[upload.status] : null;

    function handleClose() {
        setConfirmingApprove(false);
        onClose();
    }

    return (
        <AppDialog
            open={uploadId !== null}
            onClose={handleClose}
            className="max-w-4xl max-h-[85vh] flex flex-col overflow-hidden"
        >
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                    <span className="truncate">{upload?.fileName ?? 'Upload'}</span>
                    {uploadBadge && (
                        <Badge variant={uploadBadge.variant}>{uploadBadge.label}</Badge>
                    )}
                </DialogTitle>
                <DialogDescription>
                    {upload
                        ? `Uploaded ${format(new Date(upload.createdAt), 'MMM d, yyyy h:mm a')}`
                        : 'Loading run…'}
                </DialogDescription>
            </DialogHeader>

            {isLoading || !upload ? (
                <div className="tab-loading">
                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
            ) : (
                <div className="flex flex-col min-h-0 flex-1 gap-5">
                    {upload.status === 'failed' && upload.errorMessage && (
                        <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm shrink-0">
                            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                            <span>{upload.errorMessage}</span>
                        </div>
                    )}

                    {/* Review is the first actionable section — the dialog opens straight into it. */}
                    {isReview && (
                        <div className="rounded-lg border border-border bg-accent/40 p-4 space-y-3 shrink-0">
                            <div className="flex items-start gap-2">
                                <Mail className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                                <div>
                                    <p className="text-sm font-medium text-foreground">
                                        {plural(awaitingReview.length, 'complaint')} ready to notify
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        Approving sends {plural(pendingEmailCount, 'email')} to{' '}
                                        {plural(distinctRecipientCount, 'recipient')} across the
                                        owning companies below. This sends real emails and cannot be
                                        undone.
                                    </p>
                                </div>
                            </div>
                            {confirmingApprove ? (
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-medium">
                                        Send {plural(pendingEmailCount, 'email')} now?
                                    </span>
                                    <Button
                                        size="sm"
                                        onClick={() => approveMutation.mutate()}
                                        disabled={approveMutation.isPending}
                                        data-testid="button-cv-confirm-approve"
                                    >
                                        {approveMutation.isPending ? (
                                            <>
                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                Sending…
                                            </>
                                        ) : (
                                            'Confirm & Send'
                                        )}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setConfirmingApprove(false)}
                                        disabled={approveMutation.isPending}
                                    >
                                        Cancel
                                    </Button>
                                </div>
                            ) : (
                                <Button
                                    onClick={() => setConfirmingApprove(true)}
                                    data-testid="button-cv-approve"
                                >
                                    <Mail className="w-4 h-4 mr-2" />
                                    Approve &amp; Notify
                                </Button>
                            )}
                        </div>
                    )}

                    {/* Counters derived from the per-complaint rows so they stay self-consistent. */}
                    <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm shrink-0">
                        <Stat label="Complaints" value={violations.length} />
                        <Stat label="Matched" value={matched} />
                        <Stat label="Unmatched / issues" value={issues} />
                        <Stat label="Awaiting review" value={awaitingReview.length} />
                        <Stat label="Emailed" value={emailedCount} />
                    </div>

                    {violations.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-6 text-center shrink-0">
                            This upload introduced no new complaints — every row was already seen in
                            an earlier upload.
                        </p>
                    ) : (
                        // The single scroll region: fills the dialog's remaining height and is the only
                        // thing that scrolls (the dialog itself is overflow-hidden), so there's no
                        // nested double-scrollbar.
                        <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-border">
                            <Table>
                                <TableHeader className="sticky top-0 bg-background">
                                    <TableRow>
                                        <TableHead>Complaint</TableHead>
                                        <TableHead>Owner</TableHead>
                                        <TableHead>Would email</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Emailed</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {violations.map((v) => (
                                        <ViolationRow key={v.id} violation={v} />
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </div>
            )}
        </AppDialog>
    );
}

type StatProps = { label: string; value: number };

/** One labeled count in the detail summary row. */
function Stat({ label, value }: StatProps) {
    return (
        <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className="text-lg font-bold text-foreground">{value}</span>
        </div>
    );
}

type ViolationRowProps = { violation: CvViolationDetail };

/** One complaint row in the detail table: identity, resolved owner, recipients, and queue status. */
function ViolationRow({ violation }: ViolationRowProps) {
    const badge = CV_PROCESSING_STATUS_BADGE[violation.processingStatus];
    const owner = violation.ownerCompanyName ?? violation.ownerName;

    return (
        <TableRow>
            <TableCell className="align-top">
                <div className="font-medium text-sm">{violation.rawAddress}</div>
                <div className="text-xs text-muted-foreground">
                    {violation.recordNumber}
                    {violation.recordType ? ` · ${violation.recordType}` : ''}
                    {violation.statusText ? ` · ${violation.statusText}` : ''}
                </div>
            </TableCell>
            <TableCell className="align-top text-sm">
                {owner ?? <span className="text-muted-foreground">—</span>}
            </TableCell>
            <TableCell className="align-top">
                {violation.recipients.length > 0 ? (
                    <div className="flex flex-col gap-0.5">
                        {violation.recipients.map((r) => (
                            <span key={r.userId} className="text-xs text-muted-foreground">
                                {r.email}
                            </span>
                        ))}
                    </div>
                ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                )}
            </TableCell>
            <TableCell className="align-top">
                <Badge variant={badge.variant}>{badge.label}</Badge>
            </TableCell>
            <TableCell className="align-top">
                {violation.notified ? (
                    <Badge variant="green" className="gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Emailed
                    </Badge>
                ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                )}
            </TableCell>
        </TableRow>
    );
}
