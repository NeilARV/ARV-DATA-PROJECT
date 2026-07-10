import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import AppDialog from '@/components/modals/Dialog';
import ConfirmationContent from '@/components/modals/Confirmation';
import { DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Loader2 } from 'lucide-react';
import { formatCompanyName } from '@shared/utils/formatCompanyName';
import { parseApiError } from '@/utils/apiError';
import GroupDetailsForm from '@/components/admin/GroupDetailsForm';
import GroupCompaniesSection from '@/components/admin/GroupCompaniesSection';
import GroupMembersSection from '@/components/admin/GroupMembersSection';
import type { GroupDetail, GroupSummary } from '@shared/types/groups';

type GroupDetailDialogProps = {
    groupId: string | null;
    onClose: () => void;
};

type MergeResult = { companiesMoved: number; membersMoved: number };

/** Manage a single group: details, companies, members, merge-into-another, and disband. */
export default function GroupDetailDialog({ groupId, onClose }: GroupDetailDialogProps) {
    const { toast } = useToast();
    const [mergeTargetId, setMergeTargetId] = useState('');
    const [confirmMerge, setConfirmMerge] = useState(false);
    const [confirmDisband, setConfirmDisband] = useState(false);

    const { data: detail, isLoading } = useQuery<GroupDetail>({
        queryKey: ['/api/groups', groupId],
        enabled: !!groupId,
    });

    const { data: groupList } = useQuery<{ data: GroupSummary[] }>({
        queryKey: ['/api/groups'],
        enabled: !!groupId,
    });

    const mergeMutation = useMutation({
        mutationFn: async () => {
            const res = await apiRequest('POST', `/api/groups/${groupId}/merge`, {
                targetGroupId: mergeTargetId,
            });
            return res.json() as Promise<MergeResult>;
        },
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: ['/api/groups'] });
            toast({
                title: 'Groups merged',
                description: `${result.companiesMoved} companies and ${result.membersMoved} members moved.`,
            });
            setConfirmMerge(false);
            setMergeTargetId('');
            onClose(); // the source group was deleted — close its dialog
        },
        onError: (error) => {
            setConfirmMerge(false);
            toast({
                title: 'Could not merge groups',
                description: parseApiError(error),
                variant: 'destructive',
            });
        },
    });

    const disbandMutation = useMutation({
        mutationFn: async () => {
            const res = await apiRequest('DELETE', `/api/groups/${groupId}`);
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['/api/groups'] });
            toast({ title: 'Group disbanded' });
            setConfirmDisband(false);
            onClose();
        },
        onError: (error) => {
            setConfirmDisband(false);
            toast({
                title: 'Could not disband group',
                description: parseApiError(error),
                variant: 'destructive',
            });
        },
    });

    const mergeTargets = (groupList?.data ?? []).filter((g) => g.id !== groupId);
    const groupName = detail ? (formatCompanyName(detail.group.name) ?? detail.group.name) : '';
    const targetName = (() => {
        const target = mergeTargets.find((g) => g.id === mergeTargetId);
        return target ? (formatCompanyName(target.name) ?? target.name) : '';
    })();

    return (
        <>
            <AppDialog
                open={!!groupId}
                onClose={onClose}
                className="max-w-2xl max-h-[90vh] overflow-y-auto"
            >
                {isLoading || !detail ? (
                    <div className="flex justify-center py-10">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <div className="space-y-6">
                        <DialogHeader>
                            <DialogTitle>{groupName}</DialogTitle>
                            <DialogDescription>
                                Manage this operator group's details, companies, and members.
                            </DialogDescription>
                        </DialogHeader>

                        <GroupDetailsForm key={detail.group.id} group={detail.group} />
                        <Separator />
                        <GroupCompaniesSection
                            groupId={detail.group.id}
                            companies={detail.companies}
                        />
                        <Separator />
                        <GroupMembersSection groupId={detail.group.id} members={detail.members} />
                        <Separator />

                        {/* Temporarily disabled: "Merge into another group". Restore this block to re-enable group merging.
                        <section className="space-y-2">
                            <h3 className="text-sm font-semibold">Merge into another group</h3>
                            <p className="text-sm text-muted-foreground">
                                Moves this group's companies and members into the target, then
                                deletes this group.
                            </p>
                            <div className="flex gap-2">
                                <Select value={mergeTargetId} onValueChange={setMergeTargetId}>
                                    <SelectTrigger className="flex-1" aria-label="Merge target group">
                                        <SelectValue placeholder="Select target group..." />
                                    </SelectTrigger>
                                    z-[10001]: portaled to body; must sit above the dialog (z-[10000]) or it's hidden behind it
                                    <SelectContent className="z-[10001]">
                                        {mergeTargets.length === 0 ? (
                                            <div className="px-2 py-2 text-sm text-muted-foreground">
                                                No other groups
                                            </div>
                                        ) : (
                                            mergeTargets.map((g) => (
                                                <SelectItem key={g.id} value={g.id}>
                                                    {formatCompanyName(g.name)}
                                                </SelectItem>
                                            ))
                                        )}
                                    </SelectContent>
                                </Select>
                                <Button
                                    variant="outline"
                                    disabled={!mergeTargetId}
                                    onClick={() => setConfirmMerge(true)}
                                >
                                    Merge
                                </Button>
                            </div>
                        </section>

                        <Separator />
                        */}

                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <h3 className="text-sm font-semibold text-destructive">
                                    Disband group
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                    Companies revert to ungrouped; memberships end.
                                </p>
                            </div>
                            <Button variant="destructive" onClick={() => setConfirmDisband(true)}>
                                Disband
                            </Button>
                        </div>
                    </div>
                )}
            </AppDialog>

            <AppDialog
                open={confirmMerge}
                onClose={() => setConfirmMerge(false)}
                className="max-w-md"
                nested
            >
                <ConfirmationContent
                    onClose={() => setConfirmMerge(false)}
                    onConfirm={() => mergeMutation.mutate()}
                    title="Merge groups?"
                    description={`This moves all companies and members into "${targetName}", then permanently deletes "${groupName}". This cannot be undone.`}
                    confirmText="Merge"
                    cancelText="Cancel"
                    isLoading={mergeMutation.isPending}
                />
            </AppDialog>

            <AppDialog
                open={confirmDisband}
                onClose={() => setConfirmDisband(false)}
                className="max-w-md"
                nested
            >
                <ConfirmationContent
                    onClose={() => setConfirmDisband(false)}
                    onConfirm={() => disbandMutation.mutate()}
                    title="Disband group?"
                    description={`"${groupName}" will be deleted. Its companies revert to ungrouped and all memberships end. This cannot be undone.`}
                    confirmText="Disband"
                    cancelText="Cancel"
                    variant="destructive"
                    isLoading={disbandMutation.isPending}
                />
            </AppDialog>
        </>
    );
}
