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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Loader2, Mail, MoreVertical, Phone, Users } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import AppDialog from '@/components/modals/Dialog';
import ConfirmationContent from '@/components/modals/Confirmation';
import EditUserContent from '@/components/admin/EditUser';
import { formatPhoneNumber } from '@shared/utils/formatPhoneNumber';
import type {
    AdminUser,
    AccountTypeOption,
    RelationshipManager,
    UsersTabProps,
    UserListResponse,
} from '@/types/admin';

function parseRoleApiError(error: unknown): string {
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

export default function UsersTab({ isAdmin, canDeleteUser = false }: UsersTabProps) {
    const { toast } = useToast();
    const [editUser, setEditUser] = useState<AdminUser | null>(null);
    const [deleteUserConfirm, setDeleteUserConfirm] = useState<{
        userId: string;
        userName: string;
    } | null>(null);

    const { data: usersResponse, isLoading: isLoadingUsers } = useQuery<UserListResponse>({
        queryKey: ['/api/users/?excludeDomain=arvfinance.com'],
        enabled: isAdmin,
    });

    const users = usersResponse?.data;
    const userCount = usersResponse?.count ?? 0;

    const { data: relationshipManagers = [] } = useQuery<RelationshipManager[]>({
        queryKey: ['/api/users/relationship-managers'],
        enabled: isAdmin,
    });

    const { data: accountTypesList = [] } = useQuery<AccountTypeOption[]>({
        queryKey: ['/api/users/account-types'],
        enabled: isAdmin,
    });

    const deleteUserMutation = useMutation({
        mutationFn: async (userId: string) => {
            const res = await apiRequest('DELETE', `/api/users/${userId}`);
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: ['/api/users/?excludeDomain=arvfinance.com'],
            });
            toast({ title: 'User deleted', description: 'The user has been removed.' });
            setDeleteUserConfirm(null);
        },
        onError: (error: unknown) => {
            toast({
                title: 'Error',
                description: parseRoleApiError(error) || 'Failed to delete user',
                variant: 'destructive',
            });
        },
    });

    const handleDeleteUserConfirm = () => {
        if (!deleteUserConfirm) return;
        deleteUserMutation.mutate(deleteUserConfirm.userId);
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>
                    Registered Users{' '}
                    {userCount > 0 && (
                        <span className="text-muted-foreground font-normal text-base lg:text-lg">
                            ({userCount})
                        </span>
                    )}
                </CardTitle>
                <CardDescription>
                    View users who have signed up (excluding @arvfinance.com). Manage relationship
                    manager assignments.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {isLoadingUsers ? (
                    <div className="tab-loading">
                        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                    </div>
                ) : !users || users.length === 0 ? (
                    <div className="tab-empty-state">
                        <Users className="w-16 h-16 text-muted-foreground" />
                        <p className="text-muted-foreground">No users with other domains found</p>
                    </div>
                ) : (
                    <div className="table-scroll-wrapper">
                        <div className="table-scroll-body">
                            <Table>
                                <TableHeader className="sticky top-0 bg-background">
                                    <TableRow>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Contact Information</TableHead>
                                        <TableHead>Relationship Manager</TableHead>
                                        <TableHead>Account Tier</TableHead>
                                        <TableHead>Account Types</TableHead>
                                        {canDeleteUser && <TableHead />}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {users.map((user) => (
                                        <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                                            <TableCell className="font-medium">
                                                {user.firstName} {user.lastName}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col gap-1">
                                                    <span className="flex items-center gap-1.5 text-sm">
                                                        <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                                        {user.email}
                                                    </span>
                                                    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                                        <Phone className="w-3.5 h-3.5 shrink-0" />
                                                        {formatPhoneNumber(user.phone ?? '')}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {user.relationshipManagers?.length ? (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {user.relationshipManagers.map((rm) => (
                                                            <Badge
                                                                key={rm.id}
                                                                variant="secondary"
                                                                className="font-normal"
                                                            >
                                                                {rm.firstName} {rm.lastName}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="rm-label">—</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {user.subscriptionTier ? (
                                                    <Badge
                                                        variant="secondary"
                                                        className="font-normal"
                                                    >
                                                        {user.subscriptionTier}
                                                    </Badge>
                                                ) : (
                                                    <span className="rm-label">—</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {user.accountTypes?.length ? (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {user.accountTypes.map((typeName) => (
                                                            <Badge
                                                                key={typeName}
                                                                variant="secondary"
                                                                className="font-normal"
                                                            >
                                                                {typeName}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="rm-label">—</span>
                                                )}
                                            </TableCell>
                                            {canDeleteUser && (
                                                <TableCell className="text-right">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8"
                                                                aria-label="User actions"
                                                                data-testid={`button-user-actions-${user.id}`}
                                                            >
                                                                <MoreVertical className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem
                                                                onClick={() => setEditUser(user)}
                                                            >
                                                                Edit User
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem
                                                                className="text-destructive focus:text-destructive"
                                                                disabled={
                                                                    deleteUserMutation.isPending
                                                                }
                                                                onClick={() =>
                                                                    setDeleteUserConfirm({
                                                                        userId: user.id,
                                                                        userName: `${user.firstName} ${user.lastName}`,
                                                                    })
                                                                }
                                                                data-testid={`button-delete-user-${user.id}`}
                                                            >
                                                                Delete User
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </TableCell>
                                            )}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                )}

                <AppDialog
                    open={!!deleteUserConfirm}
                    onClose={() => setDeleteUserConfirm(null)}
                    className="max-w-md"
                >
                    <ConfirmationContent
                        onClose={() => setDeleteUserConfirm(null)}
                        onConfirm={handleDeleteUserConfirm}
                        title="Delete user"
                        description={
                            deleteUserConfirm
                                ? `Delete "${deleteUserConfirm.userName}"? This will permanently remove their account and cannot be undone.`
                                : ''
                        }
                        confirmText="Delete"
                        cancelText="Cancel"
                        variant="destructive"
                        isLoading={deleteUserMutation.isPending}
                    />
                </AppDialog>

                <AppDialog open={!!editUser} onClose={() => setEditUser(null)} className="max-w-md">
                    {editUser && (
                        <EditUserContent
                            user={editUser}
                            relationshipManagers={relationshipManagers}
                            accountTypesList={accountTypesList}
                            onClose={() => setEditUser(null)}
                        />
                    )}
                </AppDialog>
            </CardContent>
        </Card>
    );
}
