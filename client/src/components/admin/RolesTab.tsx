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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Users, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import ConfirmationDialog from "@/components/modals/ConfirmationDialog";

interface AdminUser {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  createdAt: string;
  roles: string[];
  relationshipManagers?: { id: string; firstName: string; lastName: string }[];
}

interface RoleOption {
  id: number;
  name: string;
}

interface RolesTabProps {
  isAdmin: boolean;
  isOwner?: boolean;
  currentUserId?: string | null;
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

/** Users with @arvfinance.com emails only; roles only (no relationship manager column or whitelist). */
export default function RolesTab({ isAdmin, isOwner = false, currentUserId = null }: RolesTabProps) {
  const { toast } = useToast();
  const [roleConfirm, setRoleConfirm] = useState<{
    open: boolean;
    userId: string;
    userName: string;
    roleName: string;
    action: "assign" | "remove";
  } | null>(null);
  const [addRoleSelectValue, setAddRoleSelectValue] = useState<Record<string, string>>({});

  const { data: users, isLoading: isLoadingUsers } = useQuery<AdminUser[]>({
    queryKey: ["/api/users/?domain=arvfinance.com"],
    enabled: isAdmin,
  });

  const { data: rolesList } = useQuery<RoleOption[]>({
    queryKey: ["/api/users/roles"],
    enabled: isAdmin,
  });

  const assignRoleMutation = useMutation({
    mutationFn: async ({ userId, roleName }: { userId: string; roleName: string }) => {
      const res = await apiRequest("POST", `/api/users/${userId}/roles`, { roleName });
      return res.json();
    },
    onSuccess: (_, { roleName }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/?domain=arvfinance.com"] });
      toast({ title: "Role assigned", description: `Role "${roleName}" has been assigned.` });
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

  const removeRoleMutation = useMutation({
    mutationFn: async ({ userId, roleName }: { userId: string; roleName: string }) => {
      const encodedRole = encodeURIComponent(roleName);
      const res = await apiRequest("DELETE", `/api/users/${userId}/roles/${encodedRole}`);
      return res.json();
    },
    onSuccess: (_, { roleName }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/?domain=arvfinance.com"] });
      toast({ title: "Role removed", description: `Role "${roleName}" has been removed.` });
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

  const handleRoleConfirm = () => {
    if (!roleConfirm) return;
    if (roleConfirm.action === "assign") {
      assignRoleMutation.mutate({ userId: roleConfirm.userId, roleName: roleConfirm.roleName });
    } else {
      removeRoleMutation.mutate({ userId: roleConfirm.userId, roleName: roleConfirm.roleName });
    }
  };

  const isRoleMutationPending =
    assignRoleMutation.isPending || removeRoleMutation.isPending;

  const assignableRoles = (rolesList ?? []).filter(
    (r) => r.name === "relationship-manager" || (isOwner && r.name === "admin")
  );

  const ROLE_LEVEL: Record<string, number> = {
    owner: 3,
    admin: 2,
    "relationship-manager": 1,
  };
  const getTargetLevel = (roleNames: string[]) => {
    if (!roleNames.length) return 0;
    return Math.max(...roleNames.map((name) => ROLE_LEVEL[name] ?? 0));
  };
  const callerLevel = isOwner ? 3 : 2;
  const canAlterUser = (user: AdminUser) =>
    (currentUserId != null && user.id === currentUserId) ||
    callerLevel > getTargetLevel(user.roles ?? []);

  const canRemoveRole = (roleName: string, user: AdminUser) => {
    if (!canAlterUser(user)) return false;
    if (roleName === "owner") return false;
    if (roleName === "admin") return isOwner;
    return true;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Internal Roles</CardTitle>
        <CardDescription>
          Manage roles for users with @arvfinance.com email addresses
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
              No @arvfinance.com users found
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
                      <TableHead>Roles</TableHead>
                      <TableHead className="w-[140px]">Add role</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id} data-testid={`row-role-user-${user.id}`}>
                        <TableCell className="font-medium">
                          {user.firstName} {user.lastName}
                        </TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>{user.phone}</TableCell>
                        <TableCell className="align-top">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {user.roles?.length
                              ? user.roles.map((roleName) => (
                                  <Badge
                                    key={roleName}
                                    variant="secondary"
                                    className={
                                      canRemoveRole(roleName, user)
                                        ? "gap-0.5 pr-0.5 font-normal"
                                        : "font-normal"
                                    }
                                  >
                                    {roleName}
                                    {canRemoveRole(roleName, user) && (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-4 w-4 rounded-full hover:bg-destructive/20 hover:text-destructive"
                                        aria-label={`Remove ${roleName}`}
                                        disabled={isRoleMutationPending}
                                        onClick={() =>
                                          setRoleConfirm({
                                            open: true,
                                            userId: user.id,
                                            userName: `${user.firstName} ${user.lastName}`,
                                            roleName,
                                            action: "remove",
                                          })
                                        }
                                      >
                                        <X className="h-3 w-3" />
                                      </Button>
                                    )}
                                  </Badge>
                                ))
                              : "-"}
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          {canAlterUser(user) &&
                          assignableRoles.some((r) => !user.roles?.includes(r.name)) ? (
                            <Select
                              value={addRoleSelectValue[user.id] ?? ""}
                              onValueChange={(value) => {
                                const roleName = assignableRoles.find(
                                  (r) => String(r.id) === value
                                )?.name;
                                if (roleName && !user.roles?.includes(roleName)) {
                                  setAddRoleSelectValue((prev) => ({ ...prev, [user.id]: "" }));
                                  setRoleConfirm({
                                    open: true,
                                    userId: user.id,
                                    userName: `${user.firstName} ${user.lastName}`,
                                    roleName,
                                    action: "assign",
                                  });
                                }
                              }}
                              disabled={isRoleMutationPending}
                            >
                              <SelectTrigger
                                className="h-7 w-[120px] border-dashed"
                                data-testid={`select-add-role-${user.id}`}
                              >
                                <SelectValue placeholder="Add role" />
                              </SelectTrigger>
                              <SelectContent>
                                {assignableRoles
                                  .filter((r) => !user.roles?.includes(r.name))
                                  .map((r) => (
                                    <SelectItem
                                      key={r.id}
                                      value={String(r.id)}
                                      data-testid={`option-role-${r.name}`}
                                    >
                                      {r.name}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )}

        <ConfirmationDialog
          open={roleConfirm?.open ?? false}
          onClose={() => setRoleConfirm(null)}
          onConfirm={handleRoleConfirm}
          title={
            roleConfirm?.action === "assign" ? "Assign role" : "Remove role"
          }
          description={
            roleConfirm
              ? roleConfirm.action === "assign"
                ? `Assign the role "${roleConfirm.roleName}" to ${roleConfirm.userName}?`
                : `Remove the role "${roleConfirm.roleName}" from ${roleConfirm.userName}?`
              : ""
          }
          confirmText={roleConfirm?.action === "assign" ? "Assign" : "Remove"}
          cancelText="Cancel"
          variant={roleConfirm?.action === "remove" ? "destructive" : "default"}
          isLoading={isRoleMutationPending}
        />
      </CardContent>
    </Card>
  );
}
