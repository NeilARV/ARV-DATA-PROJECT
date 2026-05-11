import Header from "@/components/Header";
import { MapProvider } from "@/hooks/useMap";
import { FiltersProvider } from "@/hooks/useFilters";
import { CompaniesProvider } from "@/hooks/useCompanies";
import { PropertiesProvider } from "@/hooks/useProperties";
import { PropertyProvider } from "@/hooks/useProperty";
import { ActivityFeed } from "@/components/vendors/ActivityFeed";
import { BrowseByCategory } from "@/components/vendors/BrowseByCategory";
import { useVendorNav } from "@/hooks/useVendorNav";

function VendorsContent() {
    const nav = useVendorNav();

    return (
        <div className="h-screen flex flex-col">
            <Header />
            <div className="flex-1 flex overflow-hidden">
                <div className="w-2/5 border-r border-border flex flex-col overflow-hidden">
                    <ActivityFeed postFilters={nav.postFilters} />
                </div>
                <div className="flex-1 flex flex-col overflow-hidden">
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
