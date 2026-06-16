import { useEffect, useRef, useState } from 'react';
import { useSearch } from 'wouter';
import { Loader2 } from 'lucide-react';
import Header from '@/components/Header';
import FilterHeader from '@/components/data/FilterHeader';
import CompanyDirectory from '@/components/data/CompanyDirectory';
import PropertyMap from '@/components/data/property/PropertyMap';
import GridView from '@/components/data/views/GridView';
import TableView from '@/components/data/views/TableView';
import PropertyDetailPanel from '@/components/data/property/PropertyDetailPanel';
import PropertyModalContent from '@/components/data/property/PropertyModal';
import AppDialog from '@/components/modals/Dialog';
import { InfoDialog } from '@/components/data/InfoDialog';
import { LeaderboardDialog } from '@/components/data/LeaderboardDialog';
import { AppAccessLocked } from '@/components/auth/AppAccessGate';
import { useAuth } from '@/hooks/use-auth';
import { FiltersProvider, useFilters } from '@/hooks/useFilters';
import { useView } from '@/hooks/useView';
import { useDataNav } from '@/hooks/useDataNav';
import { PropertiesProvider } from '@/hooks/useProperties';
import { CompaniesProvider, useCompanies } from '@/hooks/useCompanies';
import { MapProvider, useGeoMap } from '@/hooks/useMap';
import { PropertyProvider, useProperty } from '@/hooks/useProperty';

function HomeContent() {
    const { filters, setFilters } = useFilters();
    const { view, sidebarView } = useView();
    const { loadCompanies, companySelectionInProgressRef, company, handleCompanyClick } =
        useCompanies();
    const [showLeaderboard, setShowLeaderboard] = useState(false);
    const [showInfo, setShowInfo] = useState(false);
    const [showProperty, setShowProperty] = useState(false);
    const { user, canAccessApp, isLoading: authLoading, isAdminStatusLoading } = useAuth();
    const { property, setProperty, fetchProperty } = useProperty();
    const nav = useDataNav();

    const initializedRef = useRef(false);

    // On mount: sync URL county → filters, and load property/company from URL params
    useEffect(() => {
        if (initializedRef.current) return;
        initializedRef.current = true;

        // Sync URL county to filters if different from default
        const urlCounty = nav.county;
        if (urlCounty && urlCounty !== filters.county) {
            setFilters((f) => ({ ...f, county: urlCounty, zipCode: '', city: undefined }));
        }

        // Load property from URL param
        if (nav.propertyId) {
            fetchProperty(nav.propertyId);
        }

        // Load company from URL param
        if (nav.companyId) {
            handleCompanyClick('', nav.companyId);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Keep URL county in sync when nav.county changes (e.g. user default applied by useDataNav)
    useEffect(() => {
        const urlCounty = nav.county;
        if (urlCounty && urlCounty !== filters.county) {
            setFilters((f) => ({ ...f, county: urlCounty, zipCode: '', city: undefined }));
        }
    }, [nav.county]);

    // Sync selected property → URL param
    useEffect(() => {
        nav.setPropertyId(property?.id ?? null);
    }, [property?.id]);

    // Sync selected company → URL param
    useEffect(() => {
        nav.setCompanyId(company?.id ?? null);
    }, [company?.id]);

    // Open the property modal whenever a property is selected in table/grid views
    useEffect(() => {
        if (
            property !== null &&
            (view === 'table' || view === 'grid' || view === 'buyers-feed' || view === 'wholesale')
        ) {
            setShowProperty(true);
        }
    }, [property, view]);

    // Load companies on mount and when county filter changes. Skip when user just clicked a company
    // (e.g. wholesaler in grid, or company in property panel/modal) so that company can be shown via ensuredCompany.
    useEffect(() => {
        if (!companySelectionInProgressRef.current) {
            loadCompanies();
        }
    }, [filters.county, loadCompanies, companySelectionInProgressRef]);

    return (
        <div className="h-screen flex flex-col">
            <Header />

            {/* CSS grid: col 1 = sidebar (375px), col 2 = content (1fr).
          Row 1 height is auto — FilterHeader and "Investor Profiles" title share
          the same row so they always match height without hardcoded values. */}
            <div className="flex-1 grid grid-cols-[375px_1fr] grid-rows-[auto_1fr] overflow-hidden min-h-0">
                {/* [row 1, col 1] Sidebar title — height auto-tracks FilterHeader */}
                <div className="flex items-center px-4 border-b border-r border-border bg-background">
                    <h2 className="text-xl font-semibold">Investor Profiles</h2>
                </div>

                {/* [row 1, col 2] FilterHeader */}
                <FilterHeader />

                {/* [row 2, col 1] Company Directory */}
                <div className="border-r border-border overflow-hidden flex flex-col">
                    <CompanyDirectory />
                </div>

                {/* [row 2, col 2] Content views */}
                <div className="overflow-hidden flex min-h-0">
                    {view === 'map' ? (
                        <>
                            <PropertyDetailPanel />
                            <div className="flex-1">
                                <PropertyMap />
                            </div>
                        </>
                    ) : authLoading || isAdminStatusLoading ? (
                        // Don't decide access until auth resolves, so a subscriber deep-linking to
                        // a gated view doesn't flash the locked panel.
                        <div className="flex-1 flex items-center justify-center">
                            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : !canAccessApp ? (
                        // Map + directory stay public; the feeds and table require app access.
                        <AppAccessLocked />
                    ) : view === 'table' ? (
                        <TableView />
                    ) : (
                        <GridView sideBarView="none" />
                    )}
                </div>
            </div>
            {/* end grid */}

            <AppDialog
                open={showLeaderboard}
                onClose={() => setShowLeaderboard(false)}
                className="max-w-3xl max-h-[80vh] overflow-y-auto"
            >
                <LeaderboardDialog onClose={() => setShowLeaderboard(false)} />
            </AppDialog>

            <AppDialog open={showInfo} onClose={() => setShowInfo(false)} className="max-w-sm">
                {user?.relationshipManager && <InfoDialog onClose={() => setShowInfo(false)} />}
            </AppDialog>

            <AppDialog
                open={showProperty}
                onClose={() => {
                    setProperty(null);
                    setShowProperty(false);
                }}
                className="max-w-2xl max-h-[90vh] overflow-y-auto"
            >
                <PropertyModalContent
                    onClose={() => {
                        setProperty(null);
                        setShowProperty(false);
                    }}
                />
            </AppDialog>
        </div>
    );
}

export default function Home() {
    const search = useSearch();
    const { user, isLoading: authLoading } = useAuth();
    const urlCounty = new URLSearchParams(search).get('county') ?? undefined;

    // When the URL has no county yet (fresh visit), hold rendering until auth
    // resolves so FiltersProvider initializes with the user's actual county.
    // This eliminates the double-fetch that occurs when useDataNav later pushes
    // ?county=UserCounty and triggers a setFilters → re-fetch cycle.
    if (authLoading && !urlCounty) {
        return (
            <div className="h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const defaultCounty = urlCounty ?? user?.county ?? 'San Diego';

    return (
        <MapProvider>
            <FiltersProvider defaultOverrides={{ county: defaultCounty }}>
                <CompaniesProvider>
                    <PropertiesProvider>
                        <PropertyProvider>
                            <HomeContent />
                        </PropertyProvider>
                    </PropertiesProvider>
                </CompaniesProvider>
            </FiltersProvider>
        </MapProvider>
    );
}

// 728
