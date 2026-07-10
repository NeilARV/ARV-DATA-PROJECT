import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { Boxes, Loader2, Plus, Settings2 } from 'lucide-react';
import { formatCompanyName } from '@shared/utils/formatCompanyName';
import CreateGroupDialog from '@/components/admin/CreateGroupDialog';
import GroupDetailDialog from '@/components/admin/GroupDetailDialog';
import type { GroupSummary } from '@shared/types/groups';

/** Admin Groups tab: list operator groups, create new ones, and open one to manage it. */
export default function GroupsTab() {
    const [createOpen, setCreateOpen] = useState(false);
    const [manageGroupId, setManageGroupId] = useState<string | null>(null);

    const { data, isLoading } = useQuery<{ data: GroupSummary[] }>({
        queryKey: ['/api/groups'],
    });

    const groups = data?.data ?? [];

    return (
        <>
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Boxes className="h-5 w-5" />
                                Company Groups
                            </CardTitle>
                            <CardDescription>
                                Group an operator's companies together and manage its members.
                            </CardDescription>
                        </div>
                        <Button onClick={() => setCreateOpen(true)} data-testid="button-new-group">
                            <Plus className="mr-2 h-4 w-4" />
                            New Group
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="tab-loading">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : groups.length === 0 ? (
                        <div className="tab-empty-state">
                            <Boxes className="h-16 w-16 text-muted-foreground" />
                            <p className="text-muted-foreground">
                                No groups yet. Create one to get started.
                            </p>
                        </div>
                    ) : (
                        <div className="table-scroll-wrapper">
                            <div className="table-scroll-body">
                                <Table>
                                    <TableHeader className="sticky top-0 bg-background">
                                        <TableRow>
                                            <TableHead>Name</TableHead>
                                            <TableHead>Description</TableHead>
                                            <TableHead>Companies</TableHead>
                                            <TableHead>Members</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {groups.map((group) => (
                                            <TableRow
                                                key={group.id}
                                                data-testid={`row-group-${group.id}`}
                                            >
                                                <TableCell className="font-medium text-sm">
                                                    {formatCompanyName(group.name)}
                                                </TableCell>
                                                <TableCell className="text-sm text-muted-foreground">
                                                    {group.description || '—'}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge
                                                        variant="secondary"
                                                        className="font-normal"
                                                    >
                                                        {group.companyCount}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge
                                                        variant="secondary"
                                                        className="font-normal"
                                                    >
                                                        {group.memberCount}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => setManageGroupId(group.id)}
                                                        data-testid={`button-manage-group-${group.id}`}
                                                    >
                                                        <Settings2 className="mr-1 h-4 w-4" />
                                                        Manage
                                                    </Button>
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

            <CreateGroupDialog open={createOpen} onClose={() => setCreateOpen(false)} />
            <GroupDetailDialog groupId={manageGroupId} onClose={() => setManageGroupId(null)} />
        </>
    );
}
