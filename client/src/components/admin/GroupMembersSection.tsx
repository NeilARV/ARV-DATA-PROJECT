import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Users, X } from 'lucide-react';
import { parseApiError } from '@/utils/apiError';
import AsyncSearchSelect, { type SearchOption } from '@/components/admin/AsyncSearchSelect';
import type { GroupMemberDetail, GroupMemberRole } from '@shared/types/groups';
import type { AdminUser } from '@/types/admin';

type UserListResponse = { data: AdminUser[]; count: number };

type GroupMembersSectionProps = {
    groupId: string;
    members: GroupMemberDetail[];
};

const SEARCH_DEBOUNCE_MS = 300;

/** Members of a group: an add-by-search picker plus a list with per-member role and removal. */
export default function GroupMembersSection({ groupId, members }: GroupMembersSectionProps) {
    const { toast } = useToast();
    const [search, setSearch] = useState('');
    const debounced = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);

    const { data: userResults, isFetching } = useQuery<UserListResponse>({
        queryKey: [`/api/users/?search=${encodeURIComponent(debounced)}`],
        enabled: debounced.length >= 2,
    });

    const addMutation = useMutation({
        mutationFn: async (userId: string) => {
            const res = await apiRequest('POST', `/api/groups/${groupId}/members`, { userId });
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['/api/groups'] });
            setSearch('');
            toast({ title: 'Member added to group' });
        },
        onError: (error) =>
            toast({
                title: 'Could not add member',
                description: parseApiError(error),
                variant: 'destructive',
            }),
    });

    const removeMutation = useMutation({
        mutationFn: async (userId: string) => {
            const res = await apiRequest('DELETE', `/api/groups/${groupId}/members/${userId}`);
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['/api/groups'] });
            toast({ title: 'Member removed from group' });
        },
        onError: (error) =>
            toast({
                title: 'Could not remove member',
                description: parseApiError(error),
                variant: 'destructive',
            }),
    });

    const roleMutation = useMutation({
        mutationFn: async ({ userId, role }: { userId: string; role: GroupMemberRole }) => {
            const res = await apiRequest('PATCH', `/api/groups/${groupId}/members/${userId}`, {
                role,
            });
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['/api/groups'] });
            toast({ title: 'Member role updated' });
        },
        onError: (error) =>
            toast({
                title: 'Could not update role',
                description: parseApiError(error),
                variant: 'destructive',
            }),
    });

    // Hide users who are already members from the picker.
    const existingIds = new Set(members.map((m) => m.userId));
    const options: SearchOption[] = (userResults?.data ?? [])
        .filter((u) => !existingIds.has(u.id))
        .map((u) => ({
            id: u.id,
            label: `${u.firstName} ${u.lastName}`.trim() || u.email,
            sublabel: u.email,
        }));

    return (
        <section className="space-y-3">
            <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Members ({members.length})</h3>
            </div>

            <AsyncSearchSelect
                placeholder="Search users to add..."
                search={search}
                onSearchChange={setSearch}
                options={options}
                onSelect={(option) => addMutation.mutate(option.id)}
                isLoading={isFetching}
                disabled={addMutation.isPending}
                emptyText={debounced.length < 2 ? 'Type at least 2 characters' : 'No users found'}
            />

            {members.length === 0 ? (
                <p className="text-sm text-muted-foreground">No members in this group yet.</p>
            ) : (
                <ul className="divide-y divide-border rounded-md border border-border">
                    {members.map((member) => (
                        <li
                            key={member.userId}
                            className="flex items-center justify-between gap-2 px-3 py-2"
                        >
                            <div className="min-w-0">
                                <div className="truncate text-sm font-medium">
                                    {`${member.firstName} ${member.lastName}`.trim() ||
                                        member.email}
                                </div>
                                <div className="truncate text-xs text-muted-foreground">
                                    {member.email}
                                </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                <Select
                                    value={member.role ?? undefined}
                                    onValueChange={(role) =>
                                        roleMutation.mutate({
                                            userId: member.userId,
                                            role: role as GroupMemberRole,
                                        })
                                    }
                                    disabled={roleMutation.isPending}
                                >
                                    <SelectTrigger className="h-8 w-28" aria-label="Member role">
                                        <SelectValue placeholder="Set role" />
                                    </SelectTrigger>
                                    {/* z-[10001]: portaled to body; must sit above the dialog (z-[10000]) or it's hidden behind it */}
                                    <SelectContent className="z-[10001]">
                                        <SelectItem value="owner">Owner</SelectItem>
                                        <SelectItem value="member">Member</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                    aria-label={`Remove ${member.firstName} ${member.lastName}`}
                                    disabled={removeMutation.isPending}
                                    onClick={() => removeMutation.mutate(member.userId)}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
