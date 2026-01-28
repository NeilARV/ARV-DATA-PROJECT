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
import { Loader2, Plus, Users } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface AdminUser {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  createdAt: string;
}

interface UsersTabProps {
  isAdmin: boolean;
}

export default function UsersTab({ isAdmin }: UsersTabProps) {
  const { toast } = useToast();
  const [whitelistEmail, setWhitelistEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);

  const { data: users, isLoading: isLoadingUsers } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
    enabled: isAdmin,
  });

  const addWhitelistMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await apiRequest("POST", "/api/admin/whitelist", {
        email,
      });
      const data = await response.json();
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Email added to whitelist",
      });
      setWhitelistEmail("");
      setEmailError(null);
    },
    onError: (error: any) => {
      // Parse error message from apiRequest format: "STATUS_CODE: JSON_STRING"
      let errorMessage = "Failed to add email to whitelist";
      if (error?.message) {
        const match = error.message.match(/^\d+:\s*(.+)$/);
        if (match) {
          try {
            const parsed = JSON.parse(match[1]);
            errorMessage = parsed.message || errorMessage;
          } catch {
            errorMessage = match[1] || errorMessage;
          }
        } else {
          errorMessage = error.message;
        }
      }
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const handleAddWhitelist = () => {
    const trimmed = whitelistEmail.trim();
    if (!trimmed) return;
    setEmailError(null);
    const result = insertEmailWhitelistSchema.safeParse({ email: trimmed });
    if (!result.success) {
      const msg =
        result.error.flatten().fieldErrors.email?.[0] ??
        "Please enter a valid email address";
      setEmailError(msg);
      return;
    }
    addWhitelistMutation.mutate(result.data.email);
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
          <div className="flex gap-2 items-center">
            <Input
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
              className={`flex-1`}
              data-testid="input-whitelist-email"
              aria-invalid={!!emailError}
              aria-describedby={emailError ? "whitelist-email-error" : undefined}
            />
            <Button
              onClick={handleAddWhitelist}
              disabled={
                !whitelistEmail.trim() || addWhitelistMutation.isPending
              }
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
                      <TableHead>Signed Up</TableHead>
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
                        <TableCell className="text-muted-foreground">
                          {format(new Date(user.createdAt), "MMM d, yyyy h:mm a")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

