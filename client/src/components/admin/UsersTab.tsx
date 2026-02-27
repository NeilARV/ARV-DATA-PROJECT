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

export default function UsersTab({ isAdmin }: UsersTabProps) {
  const { toast } = useToast();
  const [whitelistEmail, setWhitelistEmail] = useState("");
  const [whitelistMsa, setWhitelistMsa] = useState<string>(MSA[0]);
  const [whitelistRelationshipManagerId, setWhitelistRelationshipManagerId] = useState<string>("none");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [addManagerSelectValue, setAddManagerSelectValue] = useState<Record<string, string>>({});
  const [managerConfirm, setManagerConfirm] = useState<{
    open: boolean;
    userId: string;
    userName: string;
    relationshipManagerId: string;
    managerName: string;
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

  const addWhitelistMutation = useMutation({
    mutationFn: async (payload: {
      email: string;
      msaName: string;
      relationshipManagerId?: string | null;
    }) => {
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

  const handleAddWhitelist = () => {
    const trimmed = whitelistEmail.trim();
    if (!trimmed) return;
    setEmailError(null);
    const relationshipManagerId =
      whitelistRelationshipManagerId && whitelistRelationshipManagerId !== "none"
        ? whitelistRelationshipManagerId
        : undefined;
    const result = insertEmailWhitelistSchema.safeParse({
      email: trimmed,
      msaName: whitelistMsa,
      relationshipManagerId: relationshipManagerId ?? null,
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
      ...(result.data.relationshipManagerId && {
        relationshipManagerId: result.data.relationshipManagerId,
      }),
    });
  };

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

  const isManagerMutationPending =
    assignRelationshipManagerMutation.isPending || removeRelationshipManagerMutation.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registered Users</CardTitle>
        <CardDescription>
          View users who have signed up (excluding @arvfinance.com). Manage relationship manager assignments and whitelist.
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
              No users with other domains found
            </p>
          </div>
        ) : (
          <div>
            <div className="mb-4">
              <p className="text-sm text-muted-foreground">
                Total: {users.length} user{users.length === 1 ? "" : "s"} (excluding @arvfinance.com)
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
                      <TableHead>Relationship Manager</TableHead>
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
      </CardContent>
    </Card>
  );
}

