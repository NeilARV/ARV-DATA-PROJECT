import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
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
import { Eye, FileWarning, Loader2, Upload } from 'lucide-react';
import { format } from 'date-fns';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
    fetchCodeViolationUpload,
    fetchCodeViolationUploads,
    uploadCodeViolationCsv,
} from '@/api/code-violations.api';
import { CV_UPLOAD_STATUS_BADGE, isUploadInFlight } from '@/constants/codeViolations.constants';
import type { CvUploadDetailResponse, CvUploadListResponse } from '@shared/types/code-violations';
import CodeViolationUploadDetail from '@/components/admin/CodeViolationUploadDetail';

/**
 * Admin tab for the Code Violations feature: upload a San Diego Accela CSV export, watch each ingest
 * run drain through the consumer, and open a run to review matches and approve notifications (§4.6).
 */
export default function CodeViolationsTab() {
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [file, setFile] = useState<File | null>(null);
    const [detailUploadId, setDetailUploadId] = useState<string | null>(null);
    // The just-uploaded run we're waiting on: the Upload button stays in its loading state and the
    // detail dialog is held back until this run finishes draining, so the admin never sees the
    // transient enqueued/processing screen — only a loading button, then the settled review dialog.
    const [pendingUploadId, setPendingUploadId] = useState<string | null>(null);

    const { data, isLoading } = useQuery<CvUploadListResponse>({
        queryKey: ['/api/code-violations/uploads'],
        queryFn: fetchCodeViolationUploads,
        refetchInterval: (query) =>
            (query.state.data?.uploads ?? []).some((u) => isUploadInFlight(u.status))
                ? 4000
                : false,
    });

    // Poll the just-uploaded run until it settles (review/completed/failed), then open it.
    const { data: pendingData } = useQuery<CvUploadDetailResponse>({
        queryKey: ['/api/code-violations/uploads', pendingUploadId],
        queryFn: () => fetchCodeViolationUpload(pendingUploadId as string),
        enabled: pendingUploadId !== null,
        refetchInterval: (query) => {
            const status = query.state.data?.upload.status;
            return status && isUploadInFlight(status) ? 2000 : false;
        },
    });

    useEffect(() => {
        if (pendingUploadId === null) return;
        const status = pendingData?.upload.status;
        if (status && !isUploadInFlight(status)) {
            setDetailUploadId(pendingUploadId);
            setPendingUploadId(null);
            queryClient.invalidateQueries({ queryKey: ['/api/code-violations/uploads'] });
        }
    }, [pendingUploadId, pendingData]);

    const uploadMutation = useMutation({
        mutationFn: uploadCodeViolationCsv,
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: ['/api/code-violations/uploads'] });
            setFile(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
            toast({
                title: 'CSV uploaded',
                description: `${result.violationsNew} new complaint${result.violationsNew === 1 ? '' : 's'} of ${result.rowsTotal} parsed${result.skipped > 0 ? ` (${result.skipped} skipped)` : ''}. Processing…`,
            });
            // Hold the dialog back until the run drains (see pendingUploadId) rather than opening it
            // onto the transient enqueued/processing screen.
            setPendingUploadId(result.uploadId);
        },
        onError: (err) => {
            toast({
                title: 'Upload failed',
                description: err instanceof Error ? err.message : 'Could not ingest the CSV.',
                variant: 'destructive',
            });
        },
    });

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        setFile(e.target.files?.[0] ?? null);
    }

    function handleUpload() {
        if (file) uploadMutation.mutate(file);
    }

    const uploads = data?.uploads ?? [];
    // Busy = the upload request is in flight OR the run is still draining (pendingUploadId set), so
    // the button keeps loading right through processing until the run reaches its review state.
    const isProcessing = pendingUploadId !== null;
    const isBusy = uploadMutation.isPending || isProcessing;

    return (
        <>
            <Card className="mb-6">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FileWarning className="w-5 h-5" />
                        Code Violations
                    </CardTitle>
                    <CardDescription>
                        Upload a San Diego Accela code-enforcement CSV export. Each complaint is
                        matched to a tracked property and its owner; matched complaints are held for
                        your review before any email is sent.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap items-center gap-3">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv,text/csv,application/vnd.ms-excel"
                            onChange={handleFileChange}
                            className="hidden"
                            data-testid="input-cv-csv"
                        />
                        <Button
                            variant="outline"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isBusy}
                        >
                            Choose CSV
                        </Button>
                        <span className="text-sm text-muted-foreground truncate max-w-xs">
                            {file ? file.name : 'No file selected'}
                        </span>
                        <Button
                            onClick={handleUpload}
                            disabled={!file || isBusy}
                            data-testid="button-cv-upload"
                        >
                            {uploadMutation.isPending ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Uploading…
                                </>
                            ) : isProcessing ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Processing…
                                </>
                            ) : (
                                <>
                                    <Upload className="w-4 h-4 mr-2" />
                                    Upload
                                </>
                            )}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Upload history</CardTitle>
                    <CardDescription>
                        Each run updates as the consumer drains its complaints. Open one to review
                        matches and approve notifications.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="tab-loading">
                            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : uploads.length === 0 ? (
                        <div className="tab-empty-state">
                            <FileWarning className="w-16 h-16 text-muted-foreground" />
                            <p className="text-muted-foreground">No uploads yet.</p>
                        </div>
                    ) : (
                        <div className="table-scroll-wrapper">
                            <div className="table-scroll-body">
                                <Table>
                                    <TableHeader className="sticky top-0 bg-background">
                                        <TableRow>
                                            <TableHead>File</TableHead>
                                            <TableHead>Uploaded</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead className="text-right">New</TableHead>
                                            <TableHead className="text-right">Matched</TableHead>
                                            <TableHead className="text-right">Unmatched</TableHead>
                                            <TableHead className="text-right">Emailed</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {uploads.map((u) => {
                                            const badge = CV_UPLOAD_STATUS_BADGE[u.status];
                                            return (
                                                <TableRow key={u.id}>
                                                    <TableCell className="font-medium text-sm max-w-[220px] truncate">
                                                        {u.fileName}
                                                    </TableCell>
                                                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                                                        {format(
                                                            new Date(u.createdAt),
                                                            'MMM d, yyyy h:mm a',
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant={badge.variant}>
                                                            {badge.label}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right text-sm">
                                                        {u.violationsNew}
                                                    </TableCell>
                                                    <TableCell className="text-right text-sm">
                                                        {u.rowsMatched}
                                                    </TableCell>
                                                    <TableCell className="text-right text-sm">
                                                        {u.rowsUnmatched}
                                                    </TableCell>
                                                    <TableCell className="text-right text-sm">
                                                        {u.notificationsSent}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => setDetailUploadId(u.id)}
                                                            data-testid={`button-view-upload-${u.id}`}
                                                        >
                                                            <Eye className="w-4 h-4 mr-1" />
                                                            {u.status === 'review'
                                                                ? 'Review'
                                                                : 'View'}
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            <CodeViolationUploadDetail
                uploadId={detailUploadId}
                onClose={() => setDetailUploadId(null)}
            />
        </>
    );
}
