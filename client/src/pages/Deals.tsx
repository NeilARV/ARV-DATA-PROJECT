import { Handshake } from 'lucide-react';
import Header from '@/components/Header';
import { MapProvider } from '@/hooks/useMap';
import { FiltersProvider } from '@/hooks/useFilters';
import { CompaniesProvider } from '@/hooks/useCompanies';
import { PropertiesProvider } from '@/hooks/useProperties';
import { PropertyProvider } from '@/hooks/useProperty';
import { AppAccessGate } from '@/components/auth/AppAccessGate';
import DealsPageContent from '@/components/deals/DealsPageContent';

function DealsInner() {
    return (
        <div className="h-dvh flex flex-col">
            <Header />
            <div className="flex-1 overflow-hidden min-h-0">
                <AppAccessGate redirect="/deals" icon={Handshake}>
                    <DealsPageContent />
                </AppAccessGate>
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
