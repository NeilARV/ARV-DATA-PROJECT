import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Property } from "@shared/schema";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import AdminLogin from "@/components/AdminLogin";
import { useAuth } from "@/hooks/use-auth";
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
import {
  CloudUpload,
  Trash2,
  Loader2,
  Database,
  AlertTriangle,
  ArrowLeft,
  Pencil,
  Search,
  X,
  Users,
  Plus,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import UploadDialog from "@/components/UploadDialog";
import EditPropertyDialog from "@/components/EditPropertyDialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { format } from "date-fns";

interface AdminUser {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  createdAt: string;
}

export default function Admin() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { user, isLoading: isLoadingUser, isAuthenticated: isUserAuthenticated } = useAuth();
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);
  const [propertyToDelete, setPropertyToDelete] = useState<string | null>(null);
  const [propertyToEdit, setPropertyToEdit] = useState<Property | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isVerifying, setIsVerifying] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [accessDeniedDialogOpen, setAccessDeniedDialogOpen] = useState(false);

  useEffect(() => {
    const checkAdminStatus = async () => {
      try {
        const response = await fetch("/api/admin/status", {
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setIsAdmin(data.isAdmin ?? false);
        
        // If user is logged in but not admin, show dialog
        if (data.authenticated && !data.isAdmin) {
          setAccessDeniedDialogOpen(true);
        }
      } catch (error) {
        console.error("Error checking admin status:", error);
        setIsAdmin(false);
      } finally {
        setIsVerifying(false);
      }
    };
    
    // Wait for user auth to load first, then check admin status
    if (!isLoadingUser) {
      checkAdminStatus();
    }
    // If isLoadingUser is true, we'll wait for it to become false
    // The effect will re-run when isLoadingUser changes
  }, [isLoadingUser]);

  // Ensure dialog opens if user becomes authenticated but not admin
  useEffect(() => {
    if (isUserAuthenticated && !isAdmin && !isVerifying) {
      setAccessDeniedDialogOpen(true);
    }
  }, [isUserAuthenticated, isAdmin, isVerifying]);

  const { data: properties, isLoading } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
    enabled: isAdmin,
  });

  const { data: users, isLoading: isLoadingUsers } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
    enabled: isAdmin,
  });

  // Filter properties based on search query
  const filteredProperties =
    properties?.filter((property) => {
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
    }) ?? [];

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

  const handleDeleteAll = () => {
    deleteAllMutation.mutate();
  };

  const handleDeleteSingle = (id: string) => {
    deleteSingleMutation.mutate(id);
  };

  const handleLogout = async () => {
    try {
      // Use the regular user logout endpoint
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });

      if (response.ok) {
        setIsAdmin(false);
        // Clear all cached queries on logout
        queryClient.clear();
        toast({
          title: "Logged Out",
          description: "You have been logged out",
        });
        setLocation("/");
      }
    } catch (error) {
      console.error("Error logging out:", error);
      toast({
        title: "Error",
        description: "Failed to log out",
        variant: "destructive",
      });
    }
  };

  if (isVerifying || isLoadingUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Show AdminLogin only if user is not authenticated
  // If authenticated but not admin, we'll show the access denied dialog
  if (!isUserAuthenticated) {
    return <AdminLogin />;
  }

  // If user is authenticated but not admin, show dialog and don't render admin content
  if (!isAdmin && isUserAuthenticated) {
    return (
      <AlertDialog 
        open={accessDeniedDialogOpen} 
        onOpenChange={(open) => {
          if (!open) {
            // Redirect when dialog is closed (by any means)
            setLocation("/");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Access Denied
            </AlertDialogTitle>
            <AlertDialogDescription>
              You do not have admin privileges to access this page. Please contact an administrator if you believe this is an error.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                setAccessDeniedDialogOpen(false);
                setLocation("/");
              }}
            >
              Go to Home Page
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <Button
            variant="ghost"
            onClick={() => setLocation("/")}
            data-testid="button-back-home"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Properties
          </Button>
          <Button
            variant="outline"
            onClick={handleLogout}
            data-testid="button-logout"
          >
            Logout
          </Button>
        </div>
        <h1 className="text-3xl font-bold mb-2" data-testid="heading-admin">
          Admin Panel
        </h1>
        <p className="text-muted-foreground">
          Manage your property data: upload, view, and delete properties
        </p>
      </div>

      {/* <button 
        className="bg-red-600 text-white px-4 py-2 rounded mb-4"
        onClick={async () => {
          try {
            const res = await apiRequest("GET", "/api/sfr/data");
            const data = await res.json();
            console.log("SFR Data Response:", data);
          } catch (error) {
            console.error("Error fetching SRF data:", error);
          }
        }}
      >
        TEST SRF API
      </button> */}

      <Tabs defaultValue="upload" className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-8">
          <TabsTrigger value="upload" data-testid="tab-upload">
            <CloudUpload className="w-4 h-4 mr-2" />
            Upload Data
          </TabsTrigger>
          <TabsTrigger value="manage" data-testid="tab-manage">
            <Database className="w-4 h-4 mr-2" />
            Manage Properties
          </TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-users">
            <Users className="w-4 h-4 mr-2" />
            Users
          </TabsTrigger>
          <TabsTrigger value="delete-all" data-testid="tab-delete-all">
            <Trash2 className="w-4 h-4 mr-2" />
            Delete All Data
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload">
          <Card>
            <CardHeader>
              <CardTitle>Upload Property Data</CardTitle>
              <CardDescription>
                Import properties from CSV or Excel files, or add them manually
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <CloudUpload className="w-16 h-16 text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold">Upload Properties</h3>
                <p className="text-muted-foreground text-center max-w-md">
                  Click the button below to upload a CSV or Excel file
                  containing property data, or manually enter individual
                  properties.
                </p>
                <Button
                  size="lg"
                  onClick={() => setUploadDialogOpen(true)}
                  data-testid="button-open-upload"
                >
                  <CloudUpload className="w-5 h-5 mr-2" />
                  Upload Properties
                </Button>
                {properties && (
                  <p className="text-sm text-muted-foreground mt-4">
                    Current database: {properties.length} propert
                    {properties.length === 1 ? "y" : "ies"}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="manage">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Manage Properties</CardTitle>
                <CardDescription>
                  View, edit, and delete individual properties from your database
                </CardDescription>
              </div>
              <Button
                onClick={() => setUploadDialogOpen(true)}
                data-testid="button-add-property"
              >
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
                  <p className="text-muted-foreground">
                    No properties in database
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setUploadDialogOpen(true)}
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
                          Showing {filteredProperties.length} of{" "}
                          {properties.length} propert
                          {properties.length === 1 ? "y" : "ies"}
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
                            <TableHead className="min-w-[200px]">
                              Address
                            </TableHead>
                            <TableHead className="min-w-[100px]">
                              City
                            </TableHead>
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
                                      onClick={() =>
                                        setPropertyToEdit(property)
                                      }
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
                                            {property.address}? This action
                                            cannot be undone.
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
        </TabsContent>

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>Registered Users</CardTitle>
              <CardDescription>
                View all users who have signed up for an account
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
                                {format(
                                  new Date(user.createdAt),
                                  "MMM d, yyyy h:mm a",
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
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="delete-all">
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
                            undone. You will need to re-upload your data if you
                            want to restore it.
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
                    <p className="text-muted-foreground">
                      No properties to delete
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <UploadDialog
        open={uploadDialogOpen}
        onClose={() => setUploadDialogOpen(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
        }}
      />

      <EditPropertyDialog
        property={propertyToEdit}
        open={!!propertyToEdit}
        onClose={() => setPropertyToEdit(null)}
      />
    </div>
  );
}
