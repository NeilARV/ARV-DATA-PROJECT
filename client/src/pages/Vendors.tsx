import { useLocation } from "wouter";
import { Loader2, AlertTriangle } from "lucide-react";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import Header from "@/components/Header";
import { MapProvider } from "@/hooks/useMap";
import { FiltersProvider } from "@/hooks/useFilters";
import { CompaniesProvider } from "@/hooks/useCompanies";
import { PropertiesProvider } from "@/hooks/useProperties";
import { PropertyProvider } from "@/hooks/useProperty";
import { ActivityFeed } from "@/components/vendors/ActivityFeed";
import { BrowseByCategory } from "@/components/vendors/BrowseByCategory";
import { useVendorNav } from "@/hooks/useVendorNav";
import { useAuth } from "@/hooks/use-auth";

function VendorsContent() {
    const nav = useVendorNav();
    const [, setLocation] = useLocation();
    const {
        isLoading: isLoadingUser,
        isAuthenticated: isUserAuthenticated,
        canAccessAdminPanel,
        isAdminStatusLoading,
    } = useAuth();

    const isVerifying = isLoadingUser || isAdminStatusLoading;
    const showAccessDenied = isUserAuthenticated && !canAccessAdminPanel && !isVerifying;

    if (isVerifying) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!isUserAuthenticated) {
        setLocation("/");
        return null;
    }

    if (showAccessDenied) {
        return (
            <AlertDialog
                open={showAccessDenied}
                onOpenChange={(open) => {
                    if (!open) setLocation("/");
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-destructive" />
                            Access Denied
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            You don't have permission to access the Vendors page. This feature is currently available to ARV team members only.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogAction onClick={() => setLocation("/")}>
                            Go to Home
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        );
    }

    return (
        <div className="h-screen flex flex-col">
            <Header />
            <div className="flex-1 flex overflow-hidden">
                <div className="w-[calc(30%-100px)] h-full border-r border-border flex flex-col overflow-hidden">
                    <ActivityFeed postFilters={nav.postFilters} />
                </div>
                <div className="flex-1 h-full flex flex-col overflow-hidden">
                    <BrowseByCategory
                        view={nav.view}
                        selectedCategory={nav.selectedCategory}
                        selectedVendor={nav.selectedVendor}
                        breadcrumbs={nav.breadcrumbs}
                        onSelectCategory={nav.selectCategory}
                        onSelectVendor={nav.selectVendor}
                        onGoBack={nav.goBack}
                    />
                </div>
            </div>
        </div>
    );
}

export default function Vendors() {
    return (
        <MapProvider>
            <FiltersProvider>
                <CompaniesProvider>
                    <PropertiesProvider>
                        <PropertyProvider>
                            <VendorsContent />
                        </PropertyProvider>
                    </PropertiesProvider>
                </CompaniesProvider>
            </FiltersProvider>
        </MapProvider>
    );
}
