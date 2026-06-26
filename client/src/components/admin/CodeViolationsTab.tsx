import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Upload, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
    uploadCodeViolationCsv,
    fetchCodeViolationUpload,
    fetchCodeViolationViolations,
} from '@/api/codeViolations.api';

// Statuses where the upload is still being worked — drives the poll interval.
const ACTIVE_STATUSES = new Set(['pending', 'processing']);

function matchBadgeVariant(method: string | null): 'default' | 'secondary' | 'outline' {
    if (method === 'exact') return 'default';
    if (method === 'exact_no_zip') return 'secondary';
    return 'outline'; // fuzzy
}

function shortAddress(raw: string | null): string {
    if (!raw) return '—';
    return (raw.split(',')[0] ?? raw).trim();
}

export default function CodeViolationsTab() {
    const { toast } = useToast();
    const [file, setFile] = useState<File | null>(null);
    const [uploadId, setUploadId] = useState<string | null>(null);

    const uploadMutation = useMutation({
        mutationFn: (f: File) => uploadCodeViolationCsv(f),
        onSuccess: (data) => {
            setUploadId(data.uploadId);
            toast({ title: 'Upload received', description: 'Processing the file…' });
        },
        onError: (err: unknown) =>
            toast({
                title: 'Upload failed',
                description: err instanceof Error ? err.message : 'Unknown error',
                variant: 'destructive',
            }),
    });

    const statusQuery = useQuery({
        queryKey: ['cv-upload', uploadId],
        queryFn: () => {
            if (!uploadId) throw new Error('No upload selected');
            return fetchCodeViolationUpload(uploadId);
        },
        enabled: uploadId != null,
        refetchInterval: (query) => {
            const status = query.state.data?.upload.status;
            return status && ACTIVE_STATUSES.has(status) ? 1500 : false;
        },
    });

    const upload = statusQuery.data?.upload;
    const isDone = upload?.status === 'done';

    const violationsQuery = useQuery({
        queryKey: ['cv-violations', uploadId],
        queryFn: () => {
            if (!uploadId) throw new Error('No upload selected');
            return fetchCodeViolationViolations(uploadId);
        },
        enabled: uploadId != null && isDone,
    });

    const violations = violationsQuery.data?.violations ?? [];
    const matched = violations.filter((v) => v.matchMethod != null);

    function handleUpload() {
        if (!file) return;
        setUploadId(null);
        uploadMutation.mutate(file);
    }

    return (
        <div className="space-y-6">
            <div className="rounded-xl border border-card-border bg-card p-5">
                <h2 className="text-lg font-semibold text-foreground mb-1">
                    Upload code-violation CSV
                </h2>
                <p className="text-sm text-muted-foreground mb-4">
                    Upload the City of San Diego Accela “Code Enforcement” export. Confident matches
                    auto-notify their owners (in-app bell + email). Set{' '}
                    <code className="text-xs">CV_ALERT_OVERRIDE_EMAIL</code> on the server to route
                    every alert to one address while testing.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                    <input
                        type="file"
                        accept=".csv"
                        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                        className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-accent"
                        data-testid="input-cv-csv"
                    />
                    <Button
                        onClick={handleUpload}
                        disabled={!file || uploadMutation.isPending}
                        data-testid="button-cv-upload"
                    >
                        {uploadMutation.isPending ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                            <Upload className="w-4 h-4 mr-2" />
                        )}
                        Upload
                    </Button>
                </div>
            </div>

            {uploadId && upload && (
                <div className="rounded-xl border border-card-border bg-card p-5">
                    <div className="flex items-center gap-3 mb-3">
                        {upload.status === 'failed' ? (
                            <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0" />
                        ) : isDone ? (
                            <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
                        ) : (
                            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                                {upload.fileName ?? 'Upload'}
                            </p>
                            <p className="text-xs text-muted-foreground capitalize">
                                {upload.status}
                            </p>
                        </div>
                    </div>

                    {upload.status === 'failed' && upload.error && (
                        <p className="text-sm text-destructive">{upload.error}</p>
                    )}

                    {isDone && (
                        <div className="flex flex-wrap gap-2">
                            <Badge variant="secondary">{upload.rowCount ?? 0} rows</Badge>
                            <Badge variant="default">{upload.matchedCount ?? 0} matched</Badge>
                            <Badge variant="outline">
                                {(upload.rowCount ?? 0) - (upload.matchedCount ?? 0)} unmatched
                            </Badge>
                        </div>
                    )}
                </div>
            )}

            {isDone &&
                (matched.length > 0 ? (
                    <div className="rounded-xl border border-card-border bg-card overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                                    <th className="px-4 py-2 font-medium">Date</th>
                                    <th className="px-4 py-2 font-medium">Record #</th>
                                    <th className="px-4 py-2 font-medium">Address</th>
                                    <th className="px-4 py-2 font-medium">Type</th>
                                    <th className="px-4 py-2 font-medium">Match</th>
                                    <th className="px-4 py-2 font-medium">Owner</th>
                                    <th className="px-4 py-2 font-medium">Alerted</th>
                                </tr>
                            </thead>
                            <tbody>
                                {matched.map((v) => (
                                    <tr
                                        key={v.id}
                                        className="border-b border-border last:border-0"
                                        data-testid={`row-cv-${v.recordNumber}`}
                                    >
                                        <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                                            {v.violationDate ?? '—'}
                                        </td>
                                        <td className="px-4 py-2 whitespace-nowrap">
                                            {v.recordNumber}
                                        </td>
                                        <td className="px-4 py-2">{shortAddress(v.rawAddress)}</td>
                                        <td className="px-4 py-2 text-muted-foreground">
                                            {v.applicationName ?? '—'}
                                        </td>
                                        <td className="px-4 py-2">
                                            <Badge variant={matchBadgeVariant(v.matchMethod)}>
                                                {v.matchMethod}
                                                {v.matchConfidence
                                                    ? ` ${Math.round(Number(v.matchConfidence) * 100)}%`
                                                    : ''}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-2">
                                            {v.ownerCompany ?? (
                                                <span className="text-muted-foreground">
                                                    unclaimed
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2">
                                            {v.notified ? (
                                                <Badge variant="default">sent</Badge>
                                            ) : v.recipientCount > 0 ? (
                                                <span className="text-xs text-muted-foreground">
                                                    pending
                                                </span>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">
                                                    no users
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        No matched violations in this upload.
                    </p>
                ))}
        </div>
    );
}
