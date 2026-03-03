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
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Mail, Plus, Trash2, X } from "lucide-react";
import { MSA } from "@/constants/filters.constants";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import ConfirmationDialog from "@/components/modals/ConfirmationDialog";
import type { WhitelistEntry, RelationshipManager, EmailListTabProps } from "@/types/admin";

function parseApiError(error: unknown): string {
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

export default function EmailListTab({ isAdmin }: EmailListTabProps) {
  const { toast } = useToast();
  const [whitelistEmail, setWhitelistEmail] = useState("");
  const [whitelistMsa, setWhitelistMsa] = useState<string>(MSA[0]);
  const [whitelistRelationshipManagerId, setWhitelistRelationshipManagerId] =
    useState<string>("none");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{id: string; email: string;} | null>(null);
  const [editConfirm, setEditConfirm] = useState<{id: string; email: string; msaName: string; relationshipManagerId: string | null;} | null>(null);
  const [removeRmConfirm, setRemoveRmConfirm] = useState<{id: string; email: string; msaName: string; managerName: string;} | null>(null);
  const [addRmConfirm, setAddRmConfirm] = useState<{id: string; email: string; msaName: string; relationshipManagerId: string; managerName: string;} | null>(null);

  const { data: whitelist = [], isLoading } = useQuery<WhitelistEntry[]>({
    queryKey: ["/api/admin/whitelist"],
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
      queryClient.invalidateQueries({ queryKey: ["/api/admin/whitelist"] });
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
        description: parseApiError(error) || "Failed to add email to whitelist",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/whitelist/${id}`);
      return res.json();
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/whitelist"] });
      toast({
        title: "Removed from whitelist",
        description: "Email has been removed from the whitelist.",
      });
      setDeleteConfirm(null);
    },
    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: parseApiError(error) || "Failed to remove from whitelist",
        variant: "destructive",
      });
    },
  });

  const updateWhitelistMutation = useMutation({
    mutationFn: async ({
      id,
      msaName,
      relationshipManagerId,
    }: {
      id: string;
      msaName: string;
      relationshipManagerId: string | null;
    }) => {
      const res = await apiRequest("PATCH", `/api/admin/whitelist/${id}`, {
        msaName,
        relationshipManagerId,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/whitelist"] });
      toast({ title: "Whitelist entry updated", description: "MSA and relationship manager have been updated." });
      setEditConfirm(null);
      setRemoveRmConfirm(null);
      setAddRmConfirm(null);
    },
    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: parseApiError(error) || "Failed to update whitelist entry",
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

  const handleConfirmDelete = () => {
    if (!deleteConfirm) return;
    deleteMutation.mutate(deleteConfirm.id);
  };

  const handleConfirmEdit = () => {
    if (!editConfirm) return;
    updateWhitelistMutation.mutate({
      id: editConfirm.id,
      msaName: editConfirm.msaName,
      relationshipManagerId: editConfirm.relationshipManagerId,
    });
  };

  const handleConfirmRemoveRm = () => {
    if (!removeRmConfirm) return;
    updateWhitelistMutation.mutate({
      id: removeRmConfirm.id,
      msaName: removeRmConfirm.msaName,
      relationshipManagerId: null,
    });
  };

  const handleConfirmAddRm = () => {
    if (!addRmConfirm) return;
    updateWhitelistMutation.mutate({
      id: addRmConfirm.id,
      msaName: addRmConfirm.msaName,
      relationshipManagerId: addRmConfirm.relationshipManagerId,
    });
  };

  const handleMsaChange = (entry: WhitelistEntry, newMsaName: string) => {
    const currentMsa = entry.msaName ?? MSA[0];
    if (newMsaName === currentMsa) return;
    setEditConfirm({
      id: entry.id,
      email: entry.email,
      msaName: newMsaName,
      relationshipManagerId: entry.relationshipManagerId ?? null,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email Whitelist</CardTitle>
        <CardDescription>
          Emails allowed to register. Add new emails or remove existing ones.
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
                <SelectTrigger
                  id="whitelist-msa"
                  className="w-full"
                  data-testid="select-whitelist-msa"
                >
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

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : !whitelist.length ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Mail className="w-16 h-16 text-muted-foreground" />
            <p className="text-muted-foreground">No emails on the whitelist</p>
          </div>
        ) : (
          <div>
            <div className="mb-4">
              <p className="text-sm text-muted-foreground">
                Total: {whitelist.length} email{whitelist.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <div className="max-h-[600px] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>MSA Subscription</TableHead>
                      <TableHead>Relationship Manager</TableHead>
                      <TableHead className="w-[100px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {whitelist.map((entry) => (
                      <TableRow key={entry.id} data-testid={`row-whitelist-${entry.id}`}>
                        <TableCell className="font-medium">{entry.email}</TableCell>
                        <TableCell>
                          <Select
                            value={entry.msaName ?? MSA[0]}
                            onValueChange={(value) => handleMsaChange(entry, value)}
                            disabled={updateWhitelistMutation.isPending}
                          >
                            <SelectTrigger
                              className="h-8 w-full max-w-[200px]"
                              data-testid={`select-whitelist-msa-${entry.id}`}
                            >
                              <SelectValue placeholder="MSA" />
                            </SelectTrigger>
                            <SelectContent>
                              {MSA.map((msaName) => (
                                <SelectItem key={msaName} value={msaName}>
                                  {msaName}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {entry.relationshipManagerId ? (
                              (() => {
                                const rm = relationshipManagers.find(
                                  (r) => r.id === entry.relationshipManagerId
                                );
                                return rm ? (
                                  <Badge
                                    variant="secondary"
                                    className="gap-0.5 pr-0.5 font-normal"
                                  >
                                    {rm.first_name} {rm.last_name}
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-4 w-4 rounded-full hover:bg-destructive/20 hover:text-destructive"
                                      aria-label={`Remove ${rm.first_name} ${rm.last_name}`}
                                      disabled={updateWhitelistMutation.isPending}
                                      onClick={() =>
                                        setRemoveRmConfirm({
                                          id: entry.id,
                                          email: entry.email,
                                          msaName: entry.msaName ?? MSA[0],
                                          managerName: `${rm.first_name} ${rm.last_name}`,
                                        })
                                      }
                                      data-testid={`button-remove-rm-${entry.id}`}
                                    >
                                      <X className="h-3 w-3" />
                                    </Button>
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground text-sm">—</span>
                                );
                              })()
                            ) : (
                              relationshipManagers.length > 0 && (
                                <Select
                                  value=""
                                  onValueChange={(value) => {
                                    if (!value) return;
                                    const rm = relationshipManagers.find((r) => r.id === value);
                                    if (!rm) return;
                                    setAddRmConfirm({
                                      id: entry.id,
                                      email: entry.email,
                                      msaName: entry.msaName ?? MSA[0],
                                      relationshipManagerId: value,
                                      managerName: `${rm.first_name} ${rm.last_name}`,
                                    });
                                  }}
                                  disabled={updateWhitelistMutation.isPending}
                                >
                                  <SelectTrigger
                                    className="h-7 w-[140px] border-dashed"
                                    data-testid={`select-add-manager-${entry.id}`}
                                  >
                                    <SelectValue placeholder="Add Manager" />
                                  </SelectTrigger>
                                  <SelectContent>
{relationshipManagers.map((rm) => (
                                    <SelectItem
                                      key={rm.id}
                                      value={rm.id}
                                      hideIndicator
                                      data-testid={`option-manager-${entry.id}-${rm.id}`}
                                    >
                                      {rm.first_name} {rm.last_name}
                                    </SelectItem>
                                  ))}
                                  </SelectContent>
                                </Select>
                              )
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            aria-label={`Remove ${entry.email} from whitelist`}
                            disabled={deleteMutation.isPending}
                            onClick={() =>
                              setDeleteConfirm({ id: entry.id, email: entry.email })
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
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
          open={!!deleteConfirm}
          onClose={() => setDeleteConfirm(null)}
          onConfirm={handleConfirmDelete}
          title="Remove from whitelist"
          description={
            deleteConfirm
              ? `Remove "${deleteConfirm.email}" from the whitelist? This email will no longer be able to register.`
              : ""
          }
          confirmText="Remove"
          cancelText="Cancel"
          variant="destructive"
          isLoading={deleteMutation.isPending}
        />

        <ConfirmationDialog
          open={!!removeRmConfirm}
          onClose={() => setRemoveRmConfirm(null)}
          onConfirm={handleConfirmRemoveRm}
          title="Remove relationship manager"
          description={
            removeRmConfirm
              ? `Remove ${removeRmConfirm.managerName} from "${removeRmConfirm.email}"? This whitelist entry will have no relationship manager.`
              : ""
          }
          confirmText="Remove"
          cancelText="Cancel"
          variant="destructive"
          isLoading={updateWhitelistMutation.isPending}
        />

        <ConfirmationDialog
          open={!!addRmConfirm}
          onClose={() => setAddRmConfirm(null)}
          onConfirm={handleConfirmAddRm}
          title="Add relationship manager"
          description={
            addRmConfirm
              ? `Add ${addRmConfirm.managerName} as relationship manager for "${addRmConfirm.email}"?`
              : ""
          }
          confirmText="Add"
          cancelText="Cancel"
          variant="default"
          isLoading={updateWhitelistMutation.isPending}
        />

        <ConfirmationDialog
          open={!!editConfirm}
          onClose={() => setEditConfirm(null)}
          onConfirm={handleConfirmEdit}
          title="Update whitelist entry"
          description={
            editConfirm
              ? (() => {
                  const rmId = editConfirm.relationshipManagerId;
                  const rm =
                    rmId === null
                      ? null
                      : relationshipManagers.find((r) => r.id === rmId);
                  const rmLabel = rm ? `${rm.first_name} ${rm.last_name}` : "None";
                  return `Update "${editConfirm.email}"? MSA subscription will be set to "${editConfirm.msaName}" and relationship manager to "${rmLabel}".`;
                })()
              : ""
          }
          confirmText="Update"
          cancelText="Cancel"
          variant="default"
          isLoading={updateWhitelistMutation.isPending}
        />
      </CardContent>
    </Card>
  );
}
