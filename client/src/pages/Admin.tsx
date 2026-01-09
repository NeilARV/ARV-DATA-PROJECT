import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Property } from "@shared/schema";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import AdminLogin from "@/components/AdminLogin";
import { useAuth } from "@/hooks/use-auth";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CloudUpload,
  Trash2,
  Loader2,
  Database,
  AlertTriangle,
  ArrowLeft,
  Users,
} from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import UploadDialog from "@/components/modals/UploadDialog";
import EditPropertyDialog from "@/components/modals/EditPropertyDialog";
import UploadDataTab from "@/components/admin/UploadDataTab";
import RetrieveDataTab from "@/components/admin/RetrieveDataTab";
import ManagePropertiesTab from "@/components/admin/ManagePropertiesTab";
import UsersTab from "@/components/admin/UsersTab";
import DeleteAllDataTab from "@/components/admin/DeleteAllDataTab";

export default function Admin() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { user, isLoading: isLoadingUser, isAuthenticated: isUserAuthenticated } = useAuth();
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [propertyToEdit, setPropertyToEdit] = useState<Property | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isVerifying, setIsVerifying] = useState(true);
  const [accessDeniedDialogOpen, setAccessDeniedDialogOpen] = useState(false);
  const [selectedCounty, setSelectedCounty] = useState<string>("San Diego");

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

  // Build query URL with county filter
  const propertiesQueryUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedCounty) {
      params.append('county', selectedCounty);
    }
    const queryString = params.toString();
    return queryString ? `/api/properties?${queryString}` : '/api/properties';
  }, [selectedCounty]);

  const { data: propertiesResponse, isLoading } = useQuery<{ properties: Property[]; total: number; hasMore: boolean }>({
    queryKey: [propertiesQueryUrl],
    queryFn: async () => {
      const res = await fetch(propertiesQueryUrl, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch properties: ${res.status}`);
      }
      return res.json();
    },
    enabled: isAdmin,
  });

  const properties = propertiesResponse?.properties ?? [];

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

      <Tabs defaultValue="upload" className="w-full">
        <TabsList className="grid w-full grid-cols-5 mb-8">
          <TabsTrigger value="upload" data-testid="tab-upload">
            <CloudUpload className="w-4 h-4 mr-2" />
            Upload Data
          </TabsTrigger>
          <TabsTrigger value="retrieve" data-testid="tab-retrieve">
            <Database className="w-4 h-4 mr-2" />
            Retrieve Data
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
          <UploadDataTab
            properties={properties}
            onOpenUpload={() => setUploadDialogOpen(true)}
          />
        </TabsContent>

        <TabsContent value="retrieve">
          <RetrieveDataTab properties={properties} />
        </TabsContent>

        <TabsContent value="manage">
          <ManagePropertiesTab
            properties={properties}
            isLoading={isLoading}
            onOpenUpload={() => setUploadDialogOpen(true)}
            onEditProperty={(property) => setPropertyToEdit(property)}
            selectedCounty={selectedCounty}
            onCountyChange={(county) => setSelectedCounty(county)}
          />
        </TabsContent>

        <TabsContent value="users">
          <UsersTab isAdmin={isAdmin} />
        </TabsContent>

        <TabsContent value="delete-all">
          <DeleteAllDataTab properties={properties} />
        </TabsContent>
      </Tabs>

      <UploadDialog
        open={uploadDialogOpen}
        onClose={() => setUploadDialogOpen(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ 
            predicate: (query) => {
              const key = query.queryKey[0];
              return typeof key === 'string' && key.startsWith('/api/properties');
            }
          });
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
