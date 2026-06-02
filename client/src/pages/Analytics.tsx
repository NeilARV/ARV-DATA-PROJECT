import Header from '@/components/Header';
import { MapProvider } from '@/hooks/useMap';
import { FiltersProvider } from '@/hooks/useFilters';
import { CompaniesProvider } from '@/hooks/useCompanies';
import { PropertiesProvider } from '@/hooks/useProperties';
import { PropertyProvider } from '@/hooks/useProperty';

function AnalyticsContent() {
    return (
        <div className="h-screen flex flex-col">
            <Header />
            <div className="flex-1 flex items-center justify-center">
                <p className="text-2xl font-semibold text-muted-foreground">Coming Soon</p>
            </div>
        </div>
    );
}

export default function Analytics() {
    return (
        <MapProvider>
            <FiltersProvider>
                <CompaniesProvider>
                    <PropertiesProvider>
                        <PropertyProvider>
                            <AnalyticsContent />
                        </PropertyProvider>
                    </PropertiesProvider>
                </CompaniesProvider>
            </FiltersProvider>
        </MapProvider>
    );
}
