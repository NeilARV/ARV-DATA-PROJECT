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
import { Loader2, Trash2, Users, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import ConfirmationDialog from "@/components/modals/ConfirmationDialog";
import { formatPhoneNumber } from "@/utils/formatPhoneNumber";

interface RelationshipManagerAssignment {
  id: string;
  firstName: string;
  lastName: string;
}

interface AdminUser {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  createdAt: string;
  relationshipManagers: RelationshipManagerAssignment[];
}

/** From GET /api/users/relationship-managers */
interface RelationshipManager {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  roles: string[];
}

interface UsersTabProps {
  isAdmin: boolean;
  /** When true (admin/owner), show delete user button and allow delete. */
  canDeleteUser?: boolean;
}

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

export default function UsersTab({ isAdmin, canDeleteUser = false }: UsersTabProps) {
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

  const { data: users, isLoading: isLoadingUsers } = useQuery<AdminUser[]>({
    queryKey: ["/api/users/?excludeDomain=arvfinance.com"],
    enabled: isAdmin,
  });

  const { data: relationshipManagers = [] } = useQuery<RelationshipManager[]>({
    queryKey: ["/api/users/relationship-managers"],
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
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Relationship Manager</TableHead>
                      {canDeleteUser && (
                        <TableHead className="w-[80px] text-right">Actions</TableHead>
                      )}
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
                        <TableCell>{user.email}</TableCell>
                        <TableCell>{formatPhoneNumber(user.phone ?? "")}</TableCell>
                        <TableCell className="align-top">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {user.relationshipManagers?.length
                              ? user.relationshipManagers.map((rm) => (
                                  <Badge
                                    key={rm.id}
                                    variant="secondary"
                                    className="gap-0.5 pr-0.5 font-normal"
                                  >
                                    {rm.firstName} {rm.lastName}
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
                                  </Badge>
                                ))
                              : null}
                            {!user.relationshipManagers?.length &&
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
                        {canDeleteUser && (
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              aria-label={`Delete user ${user.firstName} ${user.lastName}`}
                              disabled={deleteUserMutation.isPending}
                              onClick={() =>
                                setDeleteUserConfirm({
                                  userId: user.id,
                                  userName: `${user.firstName} ${user.lastName}`,
                                })
                              }
                              data-testid={`button-delete-user-${user.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )}

        <ConfirmationDialog
          open={managerConfirm?.open ?? false}
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

        <ConfirmationDialog
          open={!!deleteUserConfirm}
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
      </CardContent>
    </Card>
  );
}

