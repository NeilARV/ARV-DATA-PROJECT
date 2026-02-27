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
import { Loader2, Mail, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import ConfirmationDialog from "@/components/modals/ConfirmationDialog";

interface WhitelistEntry {
  id: string;
  email: string;
}

interface EmailListTabProps {
  isAdmin: boolean;
}

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
  const [deleteConfirm, setDeleteConfirm] = useState<{
    id: string;
    email: string;
  } | null>(null);

  const { data: whitelist = [], isLoading } = useQuery<WhitelistEntry[]>({
    queryKey: ["/api/admin/whitelist"],
    enabled: isAdmin,
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

  const handleConfirmDelete = () => {
    if (!deleteConfirm) return;
    deleteMutation.mutate(deleteConfirm.id);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email Whitelist</CardTitle>
        <CardDescription>
          Emails allowed to register. Remove an email to revoke access.
        </CardDescription>
      </CardHeader>
      <CardContent>
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
                      <TableHead className="w-[100px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {whitelist.map((entry) => (
                      <TableRow key={entry.id} data-testid={`row-whitelist-${entry.id}`}>
                        <TableCell className="font-medium">{entry.email}</TableCell>
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
      </CardContent>
    </Card>
  );
}
