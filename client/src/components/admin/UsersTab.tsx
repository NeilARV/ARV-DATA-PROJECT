import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { insertEmailWhitelistSchema } from "@database/inserts/users.insert";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Users, X } from "lucide-react";
import { MSA } from "@/constants/filters.constants";
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
}

interface RoleOption {
  id: number;
  name: string;
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
  /** True when current user has owner role (can assign/remove admin; can remove owner only from others is blocked by API). */
  isOwner?: boolean;
  /** Current user's id so we can allow editing your own roles (e.g. add/remove relationship-manager from yourself). */
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

export default function UsersTab({ isAdmin, isOwner = false, currentUserId = null }: UsersTabProps) {
  const { toast } = useToast();
  const [whitelistEmail, setWhitelistEmail] = useState("");
  const [whitelistMsa, setWhitelistMsa] = useState<string>(MSA[0]);
  const [whitelistRelationshipManagerId, setWhitelistRelationshipManagerId] = useState<string>("none");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [roleConfirm, setRoleConfirm] = useState<{
    open: boolean;
    userId: string;
    userName: string;
    roleName: string;
    action: "assign" | "remove";
  } | null>(null);
  const [addRoleSelectValue, setAddRoleSelectValue] = useState<Record<string, string>>({});

  const { data: users, isLoading: isLoadingUsers } = useQuery<AdminUser[]>({
    queryKey: ["/api/users/"],
    enabled: isAdmin,
  });

  const { data: rolesList } = useQuery<RoleOption[]>({
    queryKey: ["/api/users/roles"],
    enabled: isAdmin,
  });

  const { data: relationshipManagers = [] } = useQuery<RelationshipManager[]>({
    queryKey: ["/api/users/relationship-managers"],
    enabled: isAdmin,
  });

  const addWhitelistMutation = useMutation({
    mutationFn: async (payload: { email: string; msaName: string }) => {
      const response = await apiRequest("POST", "/api/admin/whitelist", payload);
      const data = await response.json();
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Email added to whitelist",
      });
      setWhitelistEmail("");
      setWhitelistMsa(MSA[0]);
      setWhitelistRelationshipManagerId("none");
      setEmailError(null);
    },
    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: parseRoleApiError(error) || "Failed to add email to whitelist",
        variant: "destructive",
      });
    },
  });

  const assignRoleMutation = useMutation({
    mutationFn: async ({ userId, roleName }: { userId: string; roleName: string }) => {
      const res = await apiRequest("POST", `/api/users/${userId}/roles`, { roleName });
      return res.json();
    },
    onSuccess: (_, { roleName }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/users/"] });
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

  const handleAddWhitelist = () => {
    const trimmed = whitelistEmail.trim();
    if (!trimmed) return;
    setEmailError(null);
    const result = insertEmailWhitelistSchema.safeParse({
      email: trimmed,
      msaName: whitelistMsa,
    });
    if (!result.success) {
      const msg =
        result.error.flatten().fieldErrors.email?.[0] ??
        result.error.flatten().fieldErrors.msaName?.[0] ??
        "Please enter a valid email and select an MSA";
      setEmailError(msg);
      return;
    }
    addWhitelistMutation.mutate({
      email: result.data.email,
      msaName: result.data.msaName,
    });
  };

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

  // Owner can assign admin + relationship-manager; admin can only assign relationship-manager
  const assignableRoles = (rolesList ?? []).filter((r) =>
    r.name === "relationship-manager" || (isOwner && r.name === "admin")
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
    if (!canAlterUser(user)) return false; // Cannot alter users with equal or higher privilege
    if (roleName === "owner") return false; // No one can remove owner via UI/API
    if (roleName === "admin") return isOwner; // Only owner can remove admin
    return true; // relationship-manager: both owner and admin can remove
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registered Users</CardTitle>
        <CardDescription>
          View all users who have signed up for an account
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
                    e.key === "Enter" &&
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
                aria-describedby={emailError ? "whitelist-email-error" : undefined}
              />
            </div>
            <div className="flex flex-col gap-1.5 flex-[1] min-w-[280px]">
              <Label htmlFor="whitelist-msa" className="ml-1 text-left">
                MSA Subscription
              </Label>
              <Select
                value={whitelistMsa}
                onValueChange={setWhitelistMsa}
                disabled={addWhitelistMutation.isPending}
              >
                <SelectTrigger id="whitelist-msa" className="w-full" data-testid="select-whitelist-msa">
                  <SelectValue placeholder="Initial MSA subscription" />
                </SelectTrigger>
                <SelectContent>
                  {MSA.map((msaName) => (
                    <SelectItem key={msaName} value={msaName}>
                      {msaName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5 flex-[1] min-w-[240px]">
              <Label htmlFor="whitelist-relationship-manager" className="ml-1 text-left">
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
                      {rm.first_name} {rm.last_name} — {rm.email}
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
              disabled={
                !whitelistEmail.trim() || addWhitelistMutation.isPending
              }
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
        {isLoadingUsers ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : !users || users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Users className="w-16 h-16 text-muted-foreground" />
            <p className="text-muted-foreground">
              No users have signed up yet
            </p>
          </div>
        ) : (
          <div>
            <div className="mb-4">
              <p className="text-sm text-muted-foreground">
                Total: {users.length} user{users.length === 1 ? "" : "s"}
              </p>
            </div>
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
                      <TableRow
                        key={user.id}
                        data-testid={`row-user-${user.id}`}
                      >
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
            roleConfirm?.action === "assign"
              ? "Assign role"
              : "Remove role"
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

