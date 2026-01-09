import { useState } from "react";
import { Property } from "@shared/schema";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";

interface DeleteAllDataTabProps {
  properties: Property[];
}

export default function DeleteAllDataTab({ properties }: DeleteAllDataTabProps) {
  const { toast } = useToast();
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);

  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/properties");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
      toast({
        title: "Success",
        description: "All properties have been deleted",
      });
      setDeleteAllDialogOpen(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete properties",
        variant: "destructive",
      });
    },
  });

  const handleDeleteAll = () => {
    deleteAllMutation.mutate();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Delete All Properties</CardTitle>
        <CardDescription>
          Remove all properties from your database
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-12 gap-6">
          <div className="rounded-full bg-destructive/10 p-6">
            <AlertTriangle className="w-12 h-12 text-destructive" />
          </div>
          <div className="text-center max-w-md">
            <h3 className="text-xl font-semibold mb-2">Danger Zone</h3>
            <p className="text-muted-foreground mb-6">
              This will permanently delete all {properties?.length || 0}{" "}
              properties from your database. This action cannot be undone.
            </p>
            {properties && properties.length > 0 ? (
              <AlertDialog
                open={deleteAllDialogOpen}
                onOpenChange={setDeleteAllDialogOpen}
              >
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    size="lg"
                    data-testid="button-open-delete-all"
                  >
                    <Trash2 className="w-5 h-5 mr-2" />
                    Delete All Properties
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Are you absolutely sure?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete all {properties.length}{" "}
                      properties from your database. This action cannot be
                      undone. You will need to re-upload your data if you want
                      to restore it.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="button-cancel-delete-all">
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteAll}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      data-testid="button-confirm-delete-all"
                    >
                      {deleteAllMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Deleting...
                        </>
                      ) : (
                        "Yes, Delete Everything"
                      )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <p className="text-muted-foreground">No properties to delete</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

