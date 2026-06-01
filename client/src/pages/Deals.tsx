import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import Header from "@/components/Header";
import { MapProvider } from "@/hooks/useMap";
import { FiltersProvider } from "@/hooks/useFilters";
import { CompaniesProvider } from "@/hooks/useCompanies";
import { PropertiesProvider } from "@/hooks/useProperties";
import { PropertyProvider } from "@/hooks/useProperty";
import { useAuth } from "@/hooks/use-auth";
import { useDialogs } from "@/hooks/useDialogs";
import DealsPageContent from "@/components/deals/DealsPageContent";

function DealsInner() {
    const { isLoading, isAuthenticated } = useAuth();
    const { openDialog } = useDialogs();

    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            openDialog({ type: "login" });
        }
    }, [isLoading, isAuthenticated]);

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="h-dvh flex flex-col">
            <Header />
            <div className="flex-1 overflow-hidden min-h-0">
                <DealsPageContent />
            </div>
        </div>
    );
}

export default function Deals() {
    return (
        <MapProvider>
            <FiltersProvider>
                <CompaniesProvider>
                    <PropertiesProvider>
                        <PropertyProvider>
                            <DealsInner />
                        </PropertyProvider>
                    </PropertiesProvider>
                </CompaniesProvider>
            </FiltersProvider>
        </MapProvider>
    );
}
