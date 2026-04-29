import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loader2, Mail, MoreVertical, Phone, Users, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import AppDialog from "@/components/modals/Dialog";
import ConfirmationContent from "@/components/modals/Confirmation";
import { formatPhoneNumber } from "@shared/utils/formatPhoneNumber";
import type { AdminUser, AccountTypeOption, RelationshipManager, UsersTabProps } from "@/types/admin";

function parseRoleApiError(error: unknown): string {
  let message = "Something went wrong";
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

const SUBSCRIPTION_TIERS = ["basic", "pro", "premium"] as const;

export default function UsersTab({ isAdmin, canDeleteUser = false, canManageSubscriptionTier = false, canManageRelationshipManagers = false, canManageAccountTypes = false }: UsersTabProps) {
  const { toast } = useToast();
  const [addManagerSelectValue, setAddManagerSelectValue] = useState<Record<string, string>>({});
  const [managerConfirm, setManagerConfirm] = useState<{
    open: boolean;
    userId: string;
    userName: string;
    relationshipManagerId: string;
    managerName: string;
    action: "assign" | "remove";
  } | null>(null);
  const [deleteUserConfirm, setDeleteUserConfirm] = useState<{
    userId: string;
    userName: string;
  } | null>(null);
  const [roleConfirm, setRoleConfirm] = useState<{
    open: boolean;
    userId: string;
    userName: string;
    roleName: string;
    action: "assign" | "remove";
  } | null>(null);
  const [accountTypeConfirm, setAccountTypeConfirm] = useState<{
    open: boolean;
    userId: string;
    userName: string;
    accountTypeName: string;
    action: "assign" | "remove";
  } | null>(null);

  const { data: users, isLoading: isLoadingUsers } = useQuery<AdminUser[]>({
    queryKey: ["/api/users/?excludeDomain=arvfinance.com"],
    enabled: isAdmin,
  });

  const { data: relationshipManagers = [] } = useQuery<RelationshipManager[]>({
    queryKey: ["/api/users/relationship-managers"],
    enabled: isAdmin,
  });

  const { data: accountTypesList = [] } = useQuery<AccountTypeOption[]>({
    queryKey: ["/api/users/account-types"],
    enabled: isAdmin,
  });

  const assignRelationshipManagerMutation = useMutation({
    mutationFn: async ({
      userId,
      relationshipManagerId,
    }: {
      userId: string;
      relationshipManagerId: string;
    }) => {
      const res = await apiRequest("POST", `/api/users/${userId}/relationship-managers`, {
        relationshipManagerId,
      });
      return res.json();
    },
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/?excludeDomain=arvfinance.com"] });
      toast({ title: "Relationship manager assigned", description: "Manager has been assigned." });
      setAddManagerSelectValue((prev) => ({ ...prev, [userId]: "" }));
      setManagerConfirm(null);
    },
    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: parseRoleApiError(error) || "Failed to assign relationship manager",
        variant: "destructive",
      });
    },
  });

  const removeRelationshipManagerMutation = useMutation({
    mutationFn: async ({
      userId,
      relationshipManagerId,
    }: {
      userId: string;
      relationshipManagerId: string;
    }) => {
      const res = await apiRequest(
        "DELETE",
        `/api/users/${userId}/relationship-managers/${relationshipManagerId}`
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/?excludeDomain=arvfinance.com"] });
      toast({ title: "Relationship manager removed", description: "Manager has been removed." });
      setManagerConfirm(null);
    },
    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: parseRoleApiError(error) || "Failed to remove relationship manager",
        variant: "destructive",
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("DELETE", `/api/users/${userId}`);
      return res.json();
    },
    onSuccess: (_, userId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/?excludeDomain=arvfinance.com"] });
      toast({ title: "User deleted", description: "The user has been removed." });
      setDeleteUserConfirm(null);
    },
    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: parseRoleApiError(error) || "Failed to delete user",
        variant: "destructive",
      });
    },
  });

  const assignTierMutation = useMutation({
    mutationFn: async ({ userId, tier }: { userId: string; tier: string }) => {
      const res = await apiRequest("POST", `/api/users/${userId}/subscription-tier`, { role: tier });
      return res.json();
    },
    onSuccess: (_, { tier }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/?excludeDomain=arvfinance.com"] });
      toast({ title: "Subscription tier assigned", description: `Tier "${tier}" has been assigned.` });
      setRoleConfirm(null);
    },
    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: parseRoleApiError(error),
        variant: "destructive",
      });
    },
  });

  const removeTierMutation = useMutation({
    mutationFn: async ({ userId }: { userId: string; roleName: string }) => {
      const res = await apiRequest("DELETE", `/api/users/${userId}/subscription-tier`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/?excludeDomain=arvfinance.com"] });
      toast({ title: "Subscription tier removed" });
      setRoleConfirm(null);
    },
    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: parseRoleApiError(error),
        variant: "destructive",
      });
    },
  });

  const assignAccountTypeMutation = useMutation({
    mutationFn: async ({ userId, accountTypeName }: { userId: string; accountTypeName: string }) => {
      const res = await apiRequest("POST", `/api/users/${userId}/account-types`, { accountTypeName });
      return res.json();
    },
    onSuccess: (_, { accountTypeName }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/?excludeDomain=arvfinance.com"] });
      toast({ title: "Account type assigned", description: `"${accountTypeName}" has been assigned.` });
      setAccountTypeConfirm(null);
    },
    onError: (error: unknown) => {
      toast({ title: "Error", description: parseRoleApiError(error), variant: "destructive" });
    },
  });

  const removeAccountTypeMutation = useMutation({
    mutationFn: async ({ userId, accountTypeName }: { userId: string; accountTypeName: string }) => {
      const encoded = encodeURIComponent(accountTypeName);
      const res = await apiRequest("DELETE", `/api/users/${userId}/account-types/${encoded}`);
      return res.json();
    },
    onSuccess: (_, { accountTypeName }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/?excludeDomain=arvfinance.com"] });
      toast({ title: "Account type removed", description: `"${accountTypeName}" has been removed.` });
      setAccountTypeConfirm(null);
    },
    onError: (error: unknown) => {
      toast({ title: "Error", description: parseRoleApiError(error), variant: "destructive" });
    },
  });

  const handleAccountTypeConfirm = () => {
    if (!accountTypeConfirm) return;
    if (accountTypeConfirm.action === "assign") {
      assignAccountTypeMutation.mutate({ userId: accountTypeConfirm.userId, accountTypeName: accountTypeConfirm.accountTypeName });
    } else {
      removeAccountTypeMutation.mutate({ userId: accountTypeConfirm.userId, accountTypeName: accountTypeConfirm.accountTypeName });
    }
  };

  const isAccountTypeMutationPending = assignAccountTypeMutation.isPending || removeAccountTypeMutation.isPending;

  const handleRoleConfirm = () => {
    if (!roleConfirm) return;
    if (roleConfirm.action === "assign") {
      assignTierMutation.mutate({ userId: roleConfirm.userId, tier: roleConfirm.roleName });
    } else {
      removeTierMutation.mutate({ userId: roleConfirm.userId, roleName: roleConfirm.roleName });
    }
  };

  const isRoleMutationPending = assignTierMutation.isPending || removeTierMutation.isPending;

  const handleManagerConfirm = () => {
    if (!managerConfirm) return;
    if (managerConfirm.action === "assign") {
      assignRelationshipManagerMutation.mutate({
        userId: managerConfirm.userId,
        relationshipManagerId: managerConfirm.relationshipManagerId,
      });
    } else {
      removeRelationshipManagerMutation.mutate({
        userId: managerConfirm.userId,
        relationshipManagerId: managerConfirm.relationshipManagerId,
      });
    }
  };

  const handleDeleteUserConfirm = () => {
    if (!deleteUserConfirm) return;
    deleteUserMutation.mutate(deleteUserConfirm.userId);
  };

  const isManagerMutationPending =
    assignRelationshipManagerMutation.isPending || removeRelationshipManagerMutation.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registered Users</CardTitle>
        <CardDescription>
          View users who have signed up (excluding @arvfinance.com). Manage relationship manager assignments.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoadingUsers ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : !users || users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Users className="w-16 h-16 text-muted-foreground" />
            <p className="text-muted-foreground">
              No users with other domains found
            </p>
          </div>
        ) : (
          <div>
            <div className="border rounded-lg overflow-hidden">
              <div className="max-h-[600px] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Contact Information</TableHead>
                      <TableHead>Relationship Manager</TableHead>
                      <TableHead className="w-[140px]">Account Tier</TableHead>
                      <TableHead>Account Types</TableHead>
                      <TableHead className="w-[60px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow
                        key={user.id}
                        data-testid={`row-user-${user.id}`}
                      >
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
                              {formatPhoneNumber(user.phone ?? "")}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {user.relationshipManagers?.length
                              ? user.relationshipManagers.map((rm) => (
                                  <Badge
                                    key={rm.id}
                                    variant="secondary"
                                    className={canManageRelationshipManagers ? "gap-0.5 pr-0.5 font-normal" : "font-normal"}
                                  >
                                    {rm.firstName} {rm.lastName}
                                    {canManageRelationshipManagers && (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-4 w-4 rounded-full hover:bg-destructive/20 hover:text-destructive"
                                        aria-label={`Remove ${rm.firstName} ${rm.lastName}`}
                                        disabled={isManagerMutationPending}
                                        onClick={() =>
                                          setManagerConfirm({
                                            open: true,
                                            userId: user.id,
                                            userName: `${user.firstName} ${user.lastName}`,
                                            relationshipManagerId: rm.id,
                                            managerName: `${rm.firstName} ${rm.lastName}`,
                                            action: "remove",
                                          })
                                        }
                                      >
                                        <X className="h-3 w-3" />
                                      </Button>
                                    )}
                                  </Badge>
                                ))
                              : null}
                            {canManageRelationshipManagers &&
                              !user.relationshipManagers?.length &&
                              relationshipManagers.filter((rm) => rm.id !== user.id).length > 0 && (
                              <Select
                                value={addManagerSelectValue[user.id] ?? ""}
                                onValueChange={(value) => {
                                  if (!value) return;
                                  const rm = relationshipManagers.find((r) => r.id === value);
                                  if (!rm) return;
                                  setAddManagerSelectValue((prev) => ({ ...prev, [user.id]: "" }));
                                  setManagerConfirm({
                                    open: true,
                                    userId: user.id,
                                    userName: `${user.firstName} ${user.lastName}`,
                                    relationshipManagerId: value,
                                    managerName: `${rm.first_name} ${rm.last_name}`,
                                    action: "assign",
                                  });
                                }}
                                disabled={isManagerMutationPending}
                              >
                                <SelectTrigger
                                  className="h-7 w-[140px] border-dashed"
                                  data-testid={`select-add-manager-${user.id}`}
                                >
                                  <SelectValue placeholder="Add Manager" />
                                </SelectTrigger>
                                <SelectContent>
                                  {relationshipManagers
                                    .filter((rm) => rm.id !== user.id)
                                    .map((rm) => (
                                      <SelectItem
                                        key={rm.id}
                                        value={rm.id}
                                        hideIndicator
                                        data-testid={`option-manager-${rm.id}`}
                                      >
                                        {rm.first_name} {rm.last_name}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {user.subscriptionTier ? (
                              <Badge
                                variant="secondary"
                                className={canManageSubscriptionTier ? "gap-0.5 pr-0.5 font-normal" : "font-normal"}
                              >
                                {user.subscriptionTier}
                                {canManageSubscriptionTier && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-4 w-4 rounded-full hover:bg-destructive/20 hover:text-destructive"
                                    aria-label={`Remove ${user.subscriptionTier} tier`}
                                    disabled={isRoleMutationPending}
                                    onClick={() =>
                                      setRoleConfirm({
                                        open: true,
                                        userId: user.id,
                                        userName: `${user.firstName} ${user.lastName}`,
                                        roleName: user.subscriptionTier!,
                                        action: "remove",
                                      })
                                    }
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                )}
                              </Badge>
                            ) : canManageSubscriptionTier ? (
                              <Select
                                value=""
                                onValueChange={(value) => {
                                  if (!value) return;
                                  setRoleConfirm({
                                    open: true,
                                    userId: user.id,
                                    userName: `${user.firstName} ${user.lastName}`,
                                    roleName: value,
                                    action: "assign",
                                  });
                                }}
                                disabled={isRoleMutationPending}
                              >
                                <SelectTrigger
                                  className="h-7 w-[120px] border-dashed"
                                  data-testid={`select-add-tier-${user.id}`}
                                >
                                  <SelectValue placeholder="Add tier" />
                                </SelectTrigger>
                                <SelectContent>
                                  {SUBSCRIPTION_TIERS.map((tier) => (
                                    <SelectItem key={tier} value={tier} hideIndicator data-testid={`option-tier-${tier}`}>
                                      {tier}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {user.accountTypes?.map((typeName) => (
                              <Badge
                                key={typeName}
                                variant="secondary"
                                className={canManageAccountTypes ? "gap-0.5 pr-0.5 font-normal" : "font-normal"}
                              >
                                {typeName}
                                {canManageAccountTypes && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-4 w-4 rounded-full hover:bg-destructive/20 hover:text-destructive"
                                    aria-label={`Remove ${typeName}`}
                                    disabled={isAccountTypeMutationPending}
                                    onClick={() =>
                                      setAccountTypeConfirm({
                                        open: true,
                                        userId: user.id,
                                        userName: `${user.firstName} ${user.lastName}`,
                                        accountTypeName: typeName,
                                        action: "remove",
                                      })
                                    }
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                )}
                              </Badge>
                            ))}
                            {canManageAccountTypes &&
                              accountTypesList.some((t) => !user.accountTypes?.includes(t.name)) && (
                              <Select
                                value=""
                                onValueChange={(value) => {
                                  if (!value) return;
                                  setAccountTypeConfirm({
                                    open: true,
                                    userId: user.id,
                                    userName: `${user.firstName} ${user.lastName}`,
                                    accountTypeName: value,
                                    action: "assign",
                                  });
                                }}
                                disabled={isAccountTypeMutationPending}
                              >
                                <SelectTrigger
                                  className="h-7 w-[120px] border-dashed"
                                  data-testid={`select-add-account-type-${user.id}`}
                                >
                                  <SelectValue placeholder="Add type" />
                                </SelectTrigger>
                                <SelectContent>
                                  {accountTypesList
                                    .filter((t) => !user.accountTypes?.includes(t.name))
                                    .map((t) => (
                                      <SelectItem key={t.id} value={t.name} hideIndicator data-testid={`option-account-type-${t.name}`}>
                                        {t.name}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            )}
                            {!canManageAccountTypes && !user.accountTypes?.length && (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </div>
                        </TableCell>
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
                              <DropdownMenuItem>
                                Edit User
                              </DropdownMenuItem>
                              {canDeleteUser && (
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  disabled={deleteUserMutation.isPending}
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
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )}

        <AppDialog open={managerConfirm?.open ?? false} onClose={() => setManagerConfirm(null)} className="max-w-md">
          <ConfirmationContent
            onClose={() => setManagerConfirm(null)}
            onConfirm={handleManagerConfirm}
            title={
              managerConfirm?.action === "assign"
                ? "Assign relationship manager"
                : "Remove relationship manager"
            }
            description={
              managerConfirm
                ? managerConfirm.action === "assign"
                  ? `Assign ${managerConfirm.managerName} as relationship manager for ${managerConfirm.userName}?`
                  : `Remove ${managerConfirm.managerName} as relationship manager from ${managerConfirm.userName}?`
                : ""
            }
            confirmText={managerConfirm?.action === "assign" ? "Assign" : "Remove"}
            cancelText="Cancel"
            variant={managerConfirm?.action === "remove" ? "destructive" : "default"}
            isLoading={isManagerMutationPending}
          />
        </AppDialog>

        <AppDialog open={accountTypeConfirm?.open ?? false} onClose={() => setAccountTypeConfirm(null)} className="max-w-md">
          <ConfirmationContent
            onClose={() => setAccountTypeConfirm(null)}
            onConfirm={handleAccountTypeConfirm}
            title={accountTypeConfirm?.action === "assign" ? "Assign account type" : "Remove account type"}
            description={
              accountTypeConfirm
                ? accountTypeConfirm.action === "assign"
                  ? `Assign the "${accountTypeConfirm.accountTypeName}" type to ${accountTypeConfirm.userName}?`
                  : `Remove the "${accountTypeConfirm.accountTypeName}" type from ${accountTypeConfirm.userName}?`
                : ""
            }
            confirmText={accountTypeConfirm?.action === "assign" ? "Assign" : "Remove"}
            cancelText="Cancel"
            variant={accountTypeConfirm?.action === "remove" ? "destructive" : "default"}
            isLoading={isAccountTypeMutationPending}
          />
        </AppDialog>

        <AppDialog open={roleConfirm?.open ?? false} onClose={() => setRoleConfirm(null)} className="max-w-md">
          <ConfirmationContent
            onClose={() => setRoleConfirm(null)}
            onConfirm={handleRoleConfirm}
            title={roleConfirm?.action === "assign" ? "Assign subscription tier" : "Remove subscription tier"}
            description={
              roleConfirm
                ? roleConfirm.action === "assign"
                  ? `Assign the "${roleConfirm.roleName}" tier to ${roleConfirm.userName}?`
                  : `Remove the "${roleConfirm.roleName}" tier from ${roleConfirm.userName}?`
                : ""
            }
            confirmText={roleConfirm?.action === "assign" ? "Assign" : "Remove"}
            cancelText="Cancel"
            variant={roleConfirm?.action === "remove" ? "destructive" : "default"}
            isLoading={isRoleMutationPending}
          />
        </AppDialog>

        <AppDialog open={!!deleteUserConfirm} onClose={() => setDeleteUserConfirm(null)} className="max-w-md">
          <ConfirmationContent
            onClose={() => setDeleteUserConfirm(null)}
            onConfirm={handleDeleteUserConfirm}
            title="Delete user"
            description={
              deleteUserConfirm
                ? `Delete "${deleteUserConfirm.userName}"? This will permanently remove their account and cannot be undone.`
                : ""
            }
            confirmText="Delete"
            cancelText="Cancel"
            variant="destructive"
            isLoading={deleteUserMutation.isPending}
          />
        </AppDialog>
      </CardContent>
    </Card>
  );
}

