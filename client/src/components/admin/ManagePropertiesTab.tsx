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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Input } from "@/components/ui/input";
import { Database, Loader2, Pencil, Search, Trash2, X, Plus, CloudUpload } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";

interface ManagePropertiesTabProps {
  properties: Property[];
  isLoading: boolean;
  onOpenUpload: () => void;
  onEditProperty: (property: Property) => void;
}

export default function ManagePropertiesTab({
  properties,
  isLoading,
  onOpenUpload,
  onEditProperty,
}: ManagePropertiesTabProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [propertyToDelete, setPropertyToDelete] = useState<string | null>(null);

  // Filter properties based on search query
  const filteredProperties = properties.filter((property) => {
    if (!searchQuery.trim()) return true;

    const query = searchQuery.toLowerCase().trim();
    const searchableFields = [
      property.address,
      property.city,
      property.state,
      property.zipCode,
      property.propertyOwner,
    ].filter(Boolean);

    return searchableFields.some((field) =>
      field?.toLowerCase().includes(query),
    );
  });

  const deleteSingleMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/properties/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
      toast({
        title: "Success",
        description: "Property has been deleted",
      });
      setPropertyToDelete(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete property",
        variant: "destructive",
      });
    },
  });

  const handleDeleteSingle = (id: string) => {
    deleteSingleMutation.mutate(id);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Manage Properties</CardTitle>
          <CardDescription>
            View, edit, and delete individual properties from your database
          </CardDescription>
        </div>
        <Button onClick={onOpenUpload} data-testid="button-add-property">
          <Plus className="w-4 h-4 mr-2" />
          Add Property
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : !properties || properties.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Database className="w-16 h-16 text-muted-foreground" />
            <p className="text-muted-foreground">No properties in database</p>
            <Button
              variant="outline"
              onClick={onOpenUpload}
              data-testid="button-upload-first"
            >
              <CloudUpload className="w-4 h-4 mr-2" />
              Upload Properties
            </Button>
          </div>
        ) : (
          <div>
            <div className="mb-4 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by address, city, state, zip code, or owner..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-9"
                  data-testid="input-search-properties"
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => setSearchQuery("")}
                    data-testid="button-clear-search"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {searchQuery ? (
                  <>
                    Showing {filteredProperties.length} of {properties.length}{" "}
                    propert{properties.length === 1 ? "y" : "ies"}
                  </>
                ) : (
                  <>
                    Total: {properties.length} propert
                    {properties.length === 1 ? "y" : "ies"}
                  </>
                )}
              </p>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <div className="max-h-[600px] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead className="min-w-[200px]">Address</TableHead>
                      <TableHead className="min-w-[100px]">City</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-center">Beds</TableHead>
                      <TableHead className="text-center">Baths</TableHead>
                      <TableHead className="w-[120px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProperties.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="text-center py-8 text-muted-foreground"
                        >
                          No properties match your search
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredProperties.map((property) => (
                        <TableRow
                          key={property.id}
                          data-testid={`row-property-${property.id}`}
                        >
                          <TableCell className="font-medium">
                            <div>{property.address}</div>
                            <div className="text-xs text-muted-foreground">
                              {property.state} {property.zipCode}
                            </div>
                          </TableCell>
                          <TableCell>{property.city}</TableCell>
                          <TableCell className="text-right font-semibold">
                            ${property.price?.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-center">
                            {property.bedrooms}
                          </TableCell>
                          <TableCell className="text-center">
                            {property.bathrooms}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => onEditProperty(property)}
                                data-testid={`button-edit-${property.id}`}
                              >
                                <Pencil className="w-4 h-4 text-muted-foreground" />
                              </Button>
                              <AlertDialog
                                open={propertyToDelete === property.id}
                                onOpenChange={(open) => {
                                  if (!open) setPropertyToDelete(null);
                                }}
                              >
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() =>
                                      setPropertyToDelete(property.id)
                                    }
                                    data-testid={`button-delete-${property.id}`}
                                  >
                                    <Trash2 className="w-4 h-4 text-destructive" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>
                                      Delete Property?
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete{" "}
                                      {property.address}? This action cannot be
                                      undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel data-testid="button-cancel-delete">
                                      Cancel
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() =>
                                        handleDeleteSingle(property.id)
                                      }
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      data-testid="button-confirm-delete"
                                    >
                                      {deleteSingleMutation.isPending ? (
                                        <>
                                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                          Deleting...
                                        </>
                                      ) : (
                                        "Delete"
                                      )}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
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

