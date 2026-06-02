import { useState } from 'react';
import Header from '@/components/Header';
import { MapProvider } from '@/hooks/useMap';
import { FiltersProvider } from '@/hooks/useFilters';
import { CompaniesProvider } from '@/hooks/useCompanies';
import { PropertiesProvider } from '@/hooks/useProperties';
import { PropertyProvider } from '@/hooks/useProperty';
import { ActivityFeed } from '@/components/vendors/ActivityFeed';
import { BrowseByCategory } from '@/components/vendors/BrowseByCategory';
import { useVendorNav } from '@/hooks/useVendorNav';

function VendorsContent() {
    const nav = useVendorNav();
    const [mobileTab, setMobileTab] = useState<'feed' | 'browse'>('browse');

    return (
        <div className="h-dvh flex flex-col">
            <Header />

            {/* Mobile tab bar — hidden on md+ */}
            <div className="md:hidden flex-shrink-0 flex border-b border-border bg-background">
                <button
                    onClick={() => setMobileTab('browse')}
                    className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                        mobileTab === 'browse'
                            ? 'text-primary border-b-2 border-primary -mb-px'
                            : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                    Browse
                </button>
                <button
                    onClick={() => setMobileTab('feed')}
                    className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                        mobileTab === 'feed'
                            ? 'text-primary border-b-2 border-primary -mb-px'
                            : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                    Activity Feed
                </button>
            </div>

            <div className="flex-1 flex overflow-hidden min-h-0">
                {/* Activity Feed — full-width on mobile (tab-controlled), fixed sidebar on md+ */}
                <div
                    className={`h-full flex-col overflow-hidden border-border ${
                        mobileTab === 'feed' ? 'flex flex-1' : 'hidden'
                    } md:flex md:flex-none w-[480px] md:border-r`}
                >
                    <ActivityFeed postFilters={nav.postFilters} />
                </div>

                {/* Browse — full-width on mobile (tab-controlled), fills remaining space on md+ */}
                <div
                    className={`h-full flex-col overflow-hidden flex-1 ${
                        mobileTab === 'browse' ? 'flex' : 'hidden'
                    } md:flex`}
                >
                    <BrowseByCategory
                        view={nav.view}
                        categoryId={nav.categoryId}
                        vendorId={nav.vendorId}
                        onSelectCategory={(cat) => nav.selectCategory(cat.id)}
                        onSelectVendor={(vendor) => nav.selectVendor(vendor.id)}
                        onGoBack={nav.goBack}
                        onReset={nav.reset}
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
