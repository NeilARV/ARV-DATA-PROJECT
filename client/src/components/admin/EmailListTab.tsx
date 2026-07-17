import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { insertEmailSubscriptionListSchema } from '@database/inserts/users.insert';
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
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { CountySubscriptionAccordion } from '@/components/CountySubscriptionAccordion';
import { Loader2, Mail, Pencil, Plus, Trash2 } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { summarizeCountiesByMsa } from '@/lib/countySummary';
import { getMsaNameFromCounty } from '@/lib/county';
import { useToast } from '@/hooks/use-toast';
import AppDialog from '@/components/modals/Dialog';
import ConfirmationContent from '@/components/modals/Confirmation';
import type { RelationshipManager, WhitelistEntry } from '@shared/types/users';
import type { CountySubscriptionSelection } from '@database/validation/countySubscriptions.validation';

type EmailListTabProps = {
    isAdmin: boolean;
    canEditEntries?: boolean;
};

type WhitelistResponse = {
    data: WhitelistEntry[];
    count: number;
};

// San Diego County pre-selected so the common quick-add stays one click (issue #134).
const DEFAULT_ADD_COUNTIES: CountySubscriptionSelection[] = [{ county: 'San Diego', state: 'CA' }];

/** Per-MSA summary lines for a `(county, state)` selection, deriving each parent MSA client-side. */
function summarizeSelections(selections: CountySubscriptionSelection[]): string[] {
    return summarizeCountiesByMsa(
        selections.map(({ county }) => ({ county, msaName: getMsaNameFromCounty(county) ?? '' })),
    );
}

function parseApiError(error: unknown): string {
    let message = 'Something went wrong';
    if (error instanceof Error && error.message) {
        const match = error.message.match(/^\d+:\s*(.+)$/);
        if (match) {
            try {
                const parsed = JSON.parse(match[1]);
                message = parsed.message ?? message;
            } catch {
                message = match[1] || message;
            }
        } else {
            message = error.message;
        }
    }
    return message;
}

export default function EmailListTab({ isAdmin, canEditEntries = false }: EmailListTabProps) {
    const { toast } = useToast();
    const [whitelistEmail, setWhitelistEmail] = useState('');
    const [addCounties, setAddCounties] =
        useState<CountySubscriptionSelection[]>(DEFAULT_ADD_COUNTIES);
    const [whitelistRelationshipManagerId, setWhitelistRelationshipManagerId] =
        useState<string>('none');
    const [emailError, setEmailError] = useState<string | null>(null);
    // The county dialog serves both flows: entryId null edits the add form's selection; an id
    // edits that entry's counties (confirmed via editConfirm before the mutation fires).
    const [countyDialog, setCountyDialog] = useState<{
        entryId: number | null;
        email: string | null;
        selections: CountySubscriptionSelection[];
    } | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; email: string } | null>(null);
    const [editConfirm, setEditConfirm] = useState<{
        id: number;
        email: string;
        counties: CountySubscriptionSelection[];
    } | null>(null);
    const [removeRmConfirm, setRemoveRmConfirm] = useState<{
        id: number;
        email: string;
        managerName: string;
    } | null>(null);
    const [addRmConfirm, setAddRmConfirm] = useState<{
        id: number;
        email: string;
        relationshipManagerId: string;
        managerName: string;
    } | null>(null);

    const { data: whitelistResponse, isLoading } = useQuery<WhitelistResponse>({
        queryKey: ['/api/admin/whitelist'],
        enabled: isAdmin,
    });

    const whitelist = whitelistResponse?.data ?? [];
    const whitelistCount = whitelistResponse?.count ?? 0;

    const { data: relationshipManagers = [] } = useQuery<RelationshipManager[]>({
        queryKey: ['/api/users/relationship-managers'],
        enabled: isAdmin,
    });

    const addWhitelistMutation = useMutation({
        mutationFn: async (payload: {
            email: string;
            counties: CountySubscriptionSelection[];
            relationshipManagerId?: string | null;
        }) => {
            const response = await apiRequest('POST', '/api/admin/whitelist', payload);
            const data = await response.json();
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['/api/admin/whitelist'] });
            toast({
                title: 'Success',
                description: 'Email added to whitelist',
            });
            setWhitelistEmail('');
            setAddCounties(DEFAULT_ADD_COUNTIES);
            setWhitelistRelationshipManagerId('none');
            setEmailError(null);
        },
        onError: (error: unknown) => {
            toast({
                title: 'Error',
                description: parseApiError(error) || 'Failed to add email to whitelist',
                variant: 'destructive',
            });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: number) => {
            const res = await apiRequest('DELETE', `/api/admin/whitelist/${id}`);
            return res.json();
        },
        onSuccess: (_, id) => {
            queryClient.invalidateQueries({ queryKey: ['/api/admin/whitelist'] });
            toast({
                title: 'Removed from whitelist',
                description: 'Email has been removed from the whitelist.',
            });
            setDeleteConfirm(null);
        },
        onError: (error: unknown) => {
            toast({
                title: 'Error',
                description: parseApiError(error) || 'Failed to remove from whitelist',
                variant: 'destructive',
            });
        },
    });

    const updateWhitelistMutation = useMutation({
        mutationFn: async ({
            id,
            counties,
            relationshipManagerId,
        }: {
            id: number;
            counties?: CountySubscriptionSelection[];
            relationshipManagerId?: string | null;
        }) => {
            const res = await apiRequest('PATCH', `/api/admin/whitelist/${id}`, {
                ...(counties !== undefined && { counties }),
                ...(relationshipManagerId !== undefined && { relationshipManagerId }),
            });
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['/api/admin/whitelist'] });
            toast({
                title: 'Whitelist entry updated',
                description: 'The whitelist entry has been updated.',
            });
            setEditConfirm(null);
            setRemoveRmConfirm(null);
            setAddRmConfirm(null);
        },
        onError: (error: unknown) => {
            toast({
                title: 'Error',
                description: parseApiError(error) || 'Failed to update whitelist entry',
                variant: 'destructive',
            });
        },
    });

    const handleAddWhitelist = () => {
        const trimmed = whitelistEmail.trim();
        if (!trimmed) return;
        setEmailError(null);
        const relationshipManagerId =
            whitelistRelationshipManagerId && whitelistRelationshipManagerId !== 'none'
                ? whitelistRelationshipManagerId
                : undefined;
        const result = insertEmailSubscriptionListSchema.safeParse({
            email: trimmed,
            counties: addCounties,
            relationshipManagerId: relationshipManagerId ?? null,
        });
        if (!result.success) {
            const msg =
                result.error.flatten().fieldErrors.email?.[0] ??
                result.error.flatten().fieldErrors.counties?.[0] ??
                'Please enter a valid email and select at least one county';
            setEmailError(msg);
            return;
        }
        addWhitelistMutation.mutate({
            email: result.data.email,
            counties: result.data.counties,
            ...(result.data.relationshipManagerId && {
                relationshipManagerId: result.data.relationshipManagerId,
            }),
        });
    };

    const handleConfirmDelete = () => {
        if (!deleteConfirm) return;
        deleteMutation.mutate(deleteConfirm.id);
    };

    const handleConfirmEdit = () => {
        if (!editConfirm) return;
        updateWhitelistMutation.mutate({
            id: editConfirm.id,
            counties: editConfirm.counties,
        });
    };

    const handleConfirmRemoveRm = () => {
        if (!removeRmConfirm) return;
        updateWhitelistMutation.mutate({
            id: removeRmConfirm.id,
            relationshipManagerId: null,
        });
    };

    const handleConfirmAddRm = () => {
        if (!addRmConfirm) return;
        updateWhitelistMutation.mutate({
            id: addRmConfirm.id,
            relationshipManagerId: addRmConfirm.relationshipManagerId,
        });
    };

    const handleCountyDialogSave = () => {
        if (!countyDialog) return;
        if (countyDialog.entryId === null) {
            setAddCounties(countyDialog.selections);
        } else {
            setEditConfirm({
                id: countyDialog.entryId,
                email: countyDialog.email ?? '',
                counties: countyDialog.selections,
            });
        }
        setCountyDialog(null);
    };

    const addCountiesSummary = summarizeSelections(addCounties).join('; ');

    return (
        <Card>
            <CardHeader>
                <CardTitle>
                    Email Subscription List{' '}
                    {whitelistCount > 0 && (
                        <span className="text-base font-normal text-muted-foreground">
                            ({whitelistCount})
                        </span>
                    )}
                </CardTitle>
                <CardDescription>
                    Emails on this list will receieve buyers feed updates and deal notifications
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="mb-6 p-4 border rounded-lg bg-muted/50">
                    <h3 className="text-sm font-semibold mb-3">Add Email to Whitelist</h3>
                    <div className="flex flex-wrap gap-x-4 gap-y-4 items-end">
                        <div className="flex flex-col gap-1.5 flex-1 min-w-0 max-w-[280px]">
                            <Label htmlFor="whitelist-email" className="ml-1 text-left">
                                Email
                            </Label>
                            <Input
                                id="whitelist-email"
                                type="email"
                                placeholder="Enter email address"
                                value={whitelistEmail}
                                onChange={(e) => {
                                    setWhitelistEmail(e.target.value);
                                    setEmailError(null);
                                }}
                                onKeyDown={(e) => {
                                    if (
                                        e.key === 'Enter' &&
                                        whitelistEmail.trim() &&
                                        !addWhitelistMutation.isPending
                                    ) {
                                        handleAddWhitelist();
                                    }
                                }}
                                disabled={addWhitelistMutation.isPending}
                                className="w-full"
                                data-testid="input-whitelist-email"
                                aria-invalid={!!emailError}
                                aria-describedby={emailError ? 'whitelist-email-error' : undefined}
                            />
                        </div>
                        <div className="flex flex-col gap-1.5 flex-[1] min-w-[280px]">
                            <Label htmlFor="whitelist-counties" className="ml-1 text-left">
                                County Subscriptions
                            </Label>
                            <Button
                                id="whitelist-counties"
                                type="button"
                                variant="outline"
                                className="w-full justify-start font-normal"
                                disabled={addWhitelistMutation.isPending}
                                onClick={() =>
                                    setCountyDialog({
                                        entryId: null,
                                        email: null,
                                        selections: addCounties,
                                    })
                                }
                                data-testid="button-whitelist-counties"
                            >
                                <span className="truncate">
                                    {addCountiesSummary || 'Select counties'}
                                </span>
                            </Button>
                        </div>
                        <div className="flex flex-col gap-1.5 flex-[1] min-w-[240px]">
                            <Label
                                htmlFor="whitelist-relationship-manager"
                                className="ml-1 text-left"
                            >
                                Relationship Manager
                            </Label>
                            <Select
                                value={whitelistRelationshipManagerId}
                                onValueChange={setWhitelistRelationshipManagerId}
                                disabled={addWhitelistMutation.isPending}
                            >
                                <SelectTrigger
                                    id="whitelist-relationship-manager"
                                    className="w-full"
                                    data-testid="select-whitelist-relationship-manager"
                                >
                                    <SelectValue placeholder="Relationship manager" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none" data-testid="option-rm-none">
                                        None
                                    </SelectItem>
                                    {relationshipManagers.map((rm) => (
                                        <SelectItem
                                            key={rm.id}
                                            value={rm.id}
                                            data-testid={`option-rm-${rm.id}`}
                                        >
                                            {rm.firstName} {rm.lastName} — {rm.email}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex flex-col gap-1.5 shrink-0">
                            <Label className="text-left opacity-0 select-none" aria-hidden="true">
                                Add
                            </Label>
                            <Button
                                onClick={handleAddWhitelist}
                                disabled={!whitelistEmail.trim() || addWhitelistMutation.isPending}
                                className="shrink-0"
                                data-testid="button-add-whitelist"
                            >
                                {addWhitelistMutation.isPending ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Adding...
                                    </>
                                ) : (
                                    <>
                                        <Plus className="w-4 h-4 mr-2" />
                                        Add
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                    {emailError && (
                        <p
                            id="whitelist-email-error"
                            className="text-sm text-destructive mt-2"
                            role="alert"
                        >
                            {emailError}
                        </p>
                    )}
                </div>

                {isLoading ? (
                    <div className="tab-loading">
                        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                    </div>
                ) : !whitelist.length ? (
                    <div className="tab-empty-state">
                        <Mail className="w-16 h-16 text-muted-foreground" />
                        <p className="text-muted-foreground">No emails on the whitelist</p>
                    </div>
                ) : (
                    <div>
                        <div className="mb-4">
                            <p className="rm-label">
                                Total: {whitelistCount} email{whitelistCount === 1 ? '' : 's'}
                            </p>
                        </div>
                        <div className="table-scroll-wrapper">
                            <div className="table-scroll-body">
                                <Table>
                                    <TableHeader className="sticky top-0 bg-background">
                                        <TableRow>
                                            <TableHead>Email</TableHead>
                                            <TableHead>County Subscriptions</TableHead>
                                            <TableHead>Relationship Manager</TableHead>
                                            {canEditEntries && (
                                                <TableHead className="w-[100px] text-right">
                                                    Actions
                                                </TableHead>
                                            )}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {whitelist.map((entry) => {
                                            const summary = summarizeCountiesByMsa(entry.counties);
                                            return (
                                                <TableRow
                                                    key={entry.id}
                                                    data-testid={`row-whitelist-${entry.id}`}
                                                >
                                                    <TableCell className="font-medium">
                                                        {entry.email}
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-start gap-1.5">
                                                            <div className="text-sm">
                                                                {summary.length ? (
                                                                    summary.map((line) => (
                                                                        <p key={line}>{line}</p>
                                                                    ))
                                                                ) : (
                                                                    <span className="text-muted-foreground">
                                                                        —
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {canEditEntries && (
                                                                <Button
                                                                    type="button"
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-6 w-6 shrink-0 text-muted-foreground"
                                                                    aria-label={`Edit counties for ${entry.email}`}
                                                                    disabled={
                                                                        updateWhitelistMutation.isPending
                                                                    }
                                                                    onClick={() =>
                                                                        setCountyDialog({
                                                                            entryId: entry.id,
                                                                            email: entry.email,
                                                                            selections:
                                                                                entry.counties.map(
                                                                                    ({
                                                                                        county,
                                                                                        state,
                                                                                    }) => ({
                                                                                        county,
                                                                                        state,
                                                                                    }),
                                                                                ),
                                                                        })
                                                                    }
                                                                    data-testid={`button-edit-counties-${entry.id}`}
                                                                >
                                                                    <Pencil className="h-3.5 w-3.5" />
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="align-top">
                                                        <div className="flex flex-wrap items-center gap-1.5">
                                                            {entry.relationshipManagerId ? (
                                                                (() => {
                                                                    const rm =
                                                                        relationshipManagers.find(
                                                                            (r) =>
                                                                                r.id ===
                                                                                entry.relationshipManagerId,
                                                                        );
                                                                    return rm ? (
                                                                        <Badge
                                                                            variant="secondary"
                                                                            className="font-normal"
                                                                            data-testid={`button-remove-rm-${entry.id}`}
                                                                            removeLabel={`Remove ${rm.firstName} ${rm.lastName}`}
                                                                            onRemove={
                                                                                canEditEntries &&
                                                                                !updateWhitelistMutation.isPending
                                                                                    ? () =>
                                                                                          setRemoveRmConfirm(
                                                                                              {
                                                                                                  id: entry.id,
                                                                                                  email: entry.email,
                                                                                                  managerName: `${rm.firstName} ${rm.lastName}`,
                                                                                              },
                                                                                          )
                                                                                    : undefined
                                                                            }
                                                                        >
                                                                            {rm.firstName}{' '}
                                                                            {rm.lastName}
                                                                        </Badge>
                                                                    ) : (
                                                                        <span className="rm-label">
                                                                            —
                                                                        </span>
                                                                    );
                                                                })()
                                                            ) : canEditEntries &&
                                                              relationshipManagers.length > 0 ? (
                                                                <Select
                                                                    value=""
                                                                    onValueChange={(value) => {
                                                                        if (!value) return;
                                                                        const rm =
                                                                            relationshipManagers.find(
                                                                                (r) =>
                                                                                    r.id === value,
                                                                            );
                                                                        if (!rm) return;
                                                                        setAddRmConfirm({
                                                                            id: entry.id,
                                                                            email: entry.email,
                                                                            relationshipManagerId:
                                                                                value,
                                                                            managerName: `${rm.firstName} ${rm.lastName}`,
                                                                        });
                                                                    }}
                                                                    disabled={
                                                                        updateWhitelistMutation.isPending
                                                                    }
                                                                >
                                                                    <SelectTrigger
                                                                        className="h-7 w-[140px] border-dashed"
                                                                        data-testid={`select-add-manager-${entry.id}`}
                                                                    >
                                                                        <SelectValue placeholder="Add Manager" />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        {relationshipManagers.map(
                                                                            (rm) => (
                                                                                <SelectItem
                                                                                    key={rm.id}
                                                                                    value={rm.id}
                                                                                    hideIndicator
                                                                                    data-testid={`option-manager-${entry.id}-${rm.id}`}
                                                                                >
                                                                                    {rm.firstName}{' '}
                                                                                    {rm.lastName}
                                                                                </SelectItem>
                                                                            ),
                                                                        )}
                                                                    </SelectContent>
                                                                </Select>
                                                            ) : (
                                                                <span className="rm-label">—</span>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    {canEditEntries && (
                                                        <TableCell className="text-right">
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                                                aria-label={`Remove ${entry.email} from whitelist`}
                                                                disabled={deleteMutation.isPending}
                                                                onClick={() =>
                                                                    setDeleteConfirm({
                                                                        id: entry.id,
                                                                        email: entry.email,
                                                                    })
                                                                }
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </TableCell>
                                                    )}
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    </div>
                )}

                <AppDialog
                    open={!!countyDialog}
                    onClose={() => setCountyDialog(null)}
                    className="max-w-xl"
                >
                    {countyDialog && (
                        <div className="space-y-4">
                            <div>
                                <h2 className="text-lg font-semibold">County Subscriptions</h2>
                                <p className="text-sm text-muted-foreground">
                                    {countyDialog.entryId === null
                                        ? 'Select the counties the new whitelist entry will receive email for — an MSA’s header checkbox selects its whole metro.'
                                        : `Select the counties "${countyDialog.email}" will receive email for — an MSA’s header checkbox selects its whole metro.`}
                                </p>
                            </div>
                            <div className="max-h-[50vh] overflow-y-auto pr-2">
                                <CountySubscriptionAccordion
                                    selections={countyDialog.selections}
                                    onSelectionsChange={(selections) =>
                                        setCountyDialog({ ...countyDialog, selections })
                                    }
                                />
                            </div>
                            {countyDialog.selections.length === 0 && (
                                <p className="text-sm text-destructive" role="alert">
                                    Select at least one county.
                                </p>
                            )}
                            <div className="flex justify-end gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setCountyDialog(null)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="button"
                                    onClick={handleCountyDialogSave}
                                    disabled={countyDialog.selections.length === 0}
                                    data-testid="button-save-counties"
                                >
                                    Save
                                </Button>
                            </div>
                        </div>
                    )}
                </AppDialog>

                <AppDialog
                    open={!!deleteConfirm}
                    onClose={() => setDeleteConfirm(null)}
                    className="max-w-md"
                >
                    <ConfirmationContent
                        onClose={() => setDeleteConfirm(null)}
                        onConfirm={handleConfirmDelete}
                        title="Remove from whitelist"
                        description={
                            deleteConfirm
                                ? `Remove "${deleteConfirm.email}" from the whitelist? This email will no longer be able to register.`
                                : ''
                        }
                        confirmText="Remove"
                        cancelText="Cancel"
                        variant="destructive"
                        isLoading={deleteMutation.isPending}
                    />
                </AppDialog>

                <AppDialog
                    open={!!removeRmConfirm}
                    onClose={() => setRemoveRmConfirm(null)}
                    className="max-w-md"
                >
                    <ConfirmationContent
                        onClose={() => setRemoveRmConfirm(null)}
                        onConfirm={handleConfirmRemoveRm}
                        title="Remove relationship manager"
                        description={
                            removeRmConfirm
                                ? `Remove ${removeRmConfirm.managerName} from "${removeRmConfirm.email}"? This whitelist entry will have no relationship manager.`
                                : ''
                        }
                        confirmText="Remove"
                        cancelText="Cancel"
                        variant="destructive"
                        isLoading={updateWhitelistMutation.isPending}
                    />
                </AppDialog>

                <AppDialog
                    open={!!addRmConfirm}
                    onClose={() => setAddRmConfirm(null)}
                    className="max-w-md"
                >
                    <ConfirmationContent
                        onClose={() => setAddRmConfirm(null)}
                        onConfirm={handleConfirmAddRm}
                        title="Add relationship manager"
                        description={
                            addRmConfirm
                                ? `Add ${addRmConfirm.managerName} as relationship manager for "${addRmConfirm.email}"?`
                                : ''
                        }
                        confirmText="Add"
                        cancelText="Cancel"
                        variant="default"
                        isLoading={updateWhitelistMutation.isPending}
                    />
                </AppDialog>

                <AppDialog
                    open={!!editConfirm}
                    onClose={() => setEditConfirm(null)}
                    className="max-w-md"
                >
                    <ConfirmationContent
                        onClose={() => setEditConfirm(null)}
                        onConfirm={handleConfirmEdit}
                        title="Update whitelist entry"
                        description={
                            editConfirm
                                ? `Update "${editConfirm.email}"? County subscriptions will be set to "${summarizeSelections(editConfirm.counties).join('; ')}".`
                                : ''
                        }
                        confirmText="Update"
                        cancelText="Cancel"
                        variant="default"
                        isLoading={updateWhitelistMutation.isPending}
                    />
                </AppDialog>
            </CardContent>
        </Card>
    );
}
