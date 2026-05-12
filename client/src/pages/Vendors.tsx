import { useState } from "react";
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
    const [mobileTab, setMobileTab] = useState<"feed" | "browse">("browse");
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

            {/* Mobile tab bar — hidden on md+ */}
            <div className="md:hidden flex-shrink-0 flex border-b border-border bg-background">
                <button
                    onClick={() => setMobileTab("browse")}
                    className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                        mobileTab === "browse"
                            ? "text-primary border-b-2 border-primary -mb-px"
                            : "text-muted-foreground hover:text-foreground"
                    }`}
                >
                    Browse
                </button>
                <button
                    onClick={() => setMobileTab("feed")}
                    className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                        mobileTab === "feed"
                            ? "text-primary border-b-2 border-primary -mb-px"
                            : "text-muted-foreground hover:text-foreground"
                    }`}
                >
                    Activity Feed
                </button>
            </div>

            <div className="flex-1 flex overflow-hidden min-h-0">
                {/* Activity Feed — full-width on mobile (tab-controlled), fixed sidebar on md+ */}
                <div className={`h-full flex-col overflow-hidden border-border ${
                    mobileTab === "feed" ? "flex flex-1" : "hidden"
                } md:flex md:flex-none md:w-72 lg:w-80 xl:w-96 2xl:w-[480px] md:border-r`}>
                    <ActivityFeed postFilters={nav.postFilters} />
                </div>

                {/* Browse — full-width on mobile (tab-controlled), fills remaining space on md+ */}
                <div className={`h-full flex-col overflow-hidden flex-1 ${
                    mobileTab === "browse" ? "flex" : "hidden"
                } md:flex`}>
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
