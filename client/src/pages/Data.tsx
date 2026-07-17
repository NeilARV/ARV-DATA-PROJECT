import { useEffect, useRef, useState } from 'react';
import { useSearch } from 'wouter';
import { Database } from 'lucide-react';
import { MarketingHeader } from '@/components/MarketingHeader';
import { PageLoader } from '@/components/PageLoader';
import FilterHeader from '@/components/data/FilterHeader';
import { DirectoryPanel } from '@/components/data/DirectoryPanel';
import PropertyMap from '@/components/data/property/PropertyMap';
import GridView from '@/components/data/views/GridView';
import TableView from '@/components/data/views/TableView';
import PropertyDetailPanel from '@/components/data/property/PropertyDetailPanel';
import PropertyModalContent from '@/components/data/property/PropertyModal';
import AppDialog from '@/components/modals/Dialog';
import { InfoDialog } from '@/components/data/InfoDialog';
import { LeaderboardDialog } from '@/components/data/LeaderboardDialog';
import { AppAccessGate } from '@/components/auth/AppAccessGate';
import { useAuth } from '@/hooks/use-auth';
import { useFilters } from '@/hooks/useFilters';
import {
    defaultSelectionForUser,
    isSameSelection,
    parseMsaCountyParams,
} from '@/lib/msaCountySelection';
import { useView } from '@/hooks/useView';
import { useDataNav } from '@/hooks/useNav';
import { useCompanies } from '@/hooks/useCompanies';
import { useProperty } from '@/hooks/useProperty';
import { DataProviders } from '@/components/DataProviders';

function DataContent() {
    const { filters, setFilters } = useFilters();
    const { view, sidebarView } = useView();
    const {
        loadCompanies,
        companySelectionInProgressRef,
        company,
        handleCompanyClick,
        group,
        ensureGroup,
    } = useCompanies();
    const [showLeaderboard, setShowLeaderboard] = useState(false);
    const [showInfo, setShowInfo] = useState(false);
    const [showProperty, setShowProperty] = useState(false);
    const { user } = useAuth();
    const { property, setProperty, fetchProperty } = useProperty();
    const nav = useDataNav();

    const initializedRef = useRef(false);

    // Applies the URL's MSA/county selection to filters when they differ.
    const syncSelectionToFilters = () => {
        const selection = nav.selection;
        if (!isSameSelection(selection, { msa: filters.msa, counties: filters.counties })) {
            setFilters((f) => ({
                ...f,
                msa: selection.msa,
                counties: selection.counties,
                zipCode: '',
                city: undefined,
            }));
        }
    };

    // On mount: sync URL selection → filters, and load property/company from URL params
    useEffect(() => {
        if (initializedRef.current) return;
        initializedRef.current = true;

        syncSelectionToFilters();

        // Load property from URL param
        if (nav.propertyId) {
            fetchProperty(nav.propertyId);
        }

        // Load company from URL param (wins over the group param — see useDataNav)
        if (nav.companyId) {
            handleCompanyClick('', nav.companyId);
        } else if (nav.groupId) {
            // A stale group link (disbanded / under two members / no county activity) deselects
            // gracefully: clear the param and land on the Groups tab unselected.
            const staleGroupId = nav.groupId;
            void ensureGroup(staleGroupId).then((found) => {
                if (!found) nav.setGroupId(null);
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Keep filters in sync when the URL selection changes (e.g. user default applied by useDataNav)
    const navSelectionKey = `${nav.selection.msa}|${nav.selection.counties.join(',')}`;
    useEffect(() => {
        syncSelectionToFilters();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [navSelectionKey]);

    // Sync selected property → URL param
    useEffect(() => {
        nav.setPropertyId(property?.id ?? null);
    }, [property?.id]);

    // Sync selected company → URL param
    useEffect(() => {
        nav.setCompanyId(company?.id ?? null);
    }, [company?.id]);

    // Mirror group selection → URL param. Only selection syncs here: every deselect path writes
    // the URL itself, and the mount-time ensureGroup fetch must not be raced by a clearing write
    // while `group` is still null.
    useEffect(() => {
        if (group) nav.setGroupId(group.id);
    }, [group?.id]);

    // Open the property modal whenever a property is selected in table/grid views
    useEffect(() => {
        if (
            property !== null &&
            (view === 'table' || view === 'grid' || view === 'buyers-feed' || view === 'wholesale')
        ) {
            setShowProperty(true);
        }
    }, [property, view]);

    // Load companies on mount and when the county selection changes. Skip when user just clicked a
    // company (e.g. wholesaler in grid, or company in property panel/modal) so that company can be
    // shown via ensuredCompany.
    useEffect(() => {
        if (!companySelectionInProgressRef.current) {
            loadCompanies();
        }
    }, [filters.counties, loadCompanies, companySelectionInProgressRef]);

    return (
        <div className="h-screen flex flex-col">
            <MarketingHeader />

            {/* The Data app is login-gated: unauthenticated users are redirected to /login and
                authenticated users without a subscription/team role see the locked notice. */}
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                <AppAccessGate redirectWhenUnauthenticated="/data" redirect="/data" icon={Database}>
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

                        {/* [row 2, col 1] Directory (Companies / Groups tabs) */}
                        <div className="border-r border-border overflow-hidden flex flex-col">
                            <DirectoryPanel />
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
                            ) : view === 'table' ? (
                                <TableView />
                            ) : (
                                <GridView sideBarView="none" />
                            )}
                        </div>
                    </div>
                </AppAccessGate>
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

export default function Data() {
    const search = useSearch();
    const { user, isLoading: authLoading } = useAuth();
    const urlSelection = parseMsaCountyParams(new URLSearchParams(search));

    // When the URL has no selection yet (fresh visit), hold rendering until auth
    // resolves so FiltersProvider initializes with the user's actual county.
    // This eliminates the double-fetch that occurs when useDataNav later pushes
    // the user default and triggers a setFilters → re-fetch cycle.
    if (authLoading && !urlSelection) {
        return <PageLoader className="h-screen" />;
    }

    const defaultSelection =
        urlSelection ?? defaultSelectionForUser(user?.county, user?.countySubscriptions);

    return (
        <DataProviders
            filtersDefaultOverrides={{
                msa: defaultSelection.msa,
                counties: defaultSelection.counties,
            }}
        >
            <DataContent />
        </DataProviders>
    );
}
