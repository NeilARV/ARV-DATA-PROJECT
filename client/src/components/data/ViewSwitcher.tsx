import { ChevronDown, DollarSign, Grid3x3, Map, Table2, Users } from 'lucide-react';

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { useAccessGate } from '@/hooks/useAccessGate';
import { useCompanies } from '@/hooks/useCompanies';
import { useFilters } from '@/hooks/useFilters';
import { useGeoMap } from '@/hooks/useMap';
import { useProperty } from '@/hooks/useProperty';
import { useView } from '@/hooks/useView';

import { getCountyCenter, getDefaultMapCenter } from '@/lib/county';
import { MAP_ZOOM_COUNTY } from '@/constants/map.constants';
import {
    BUYERS_FEED_STATUS_FILTERS,
    WHOLESALE_VIEW_STATUS_FILTERS,
} from '@/constants/propertyStatus.constants';

function segmentClass(isActive: boolean): string {
    return `px-3 h-8 flex items-center gap-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
        isActive
            ? 'bg-primary text-primary-foreground'
            : 'bg-background text-muted-foreground hover:bg-muted'
    }`;
}

/**
 * Segmented view switcher for the Data app — Buyers Feed, Wholesale, Map, and a More menu with
 * Grid/Table. Lives in the filter row (FilterHeader); subscription-gated views route blocked users
 * to the contact page via useAccessGate.
 */
export function ViewSwitcher() {
    const { filters, setFilters, clearFilters } = useFilters();
    const { view, setView } = useView();
    const { setProperty } = useProperty();
    const { loadCompanies, company } = useCompanies();
    const { setMapCenter, setMapZoom } = useGeoMap();
    const { requireSubscription } = useAccessGate();

    const handleBuyersFeedClick = () => {
        requireSubscription(() => {
            setProperty(null);
            setFilters((prev) => ({ ...prev, statusFilters: BUYERS_FEED_STATUS_FILTERS }));
            setView('buyers-feed');
            loadCompanies({ sort: 'most-bought-properties' });
        });
    };

    const handleWholesaleClick = () => {
        requireSubscription(() => {
            setProperty(null);
            setFilters((prev) => ({ ...prev, statusFilters: WHOLESALE_VIEW_STATUS_FILTERS }));
            setView('wholesale');
            loadCompanies({ sort: 'wholesalers' });
        });
    };

    const handleMapClick = () => {
        setView('map');
        const county = filters.county ?? 'San Diego';
        setMapCenter(getCountyCenter(county) ?? getDefaultMapCenter());
        setMapZoom(MAP_ZOOM_COUNTY);
    };

    const handleGridClick = () => {
        requireSubscription(() => {
            setView('grid');
            if (!company) clearFilters();
        });
    };

    const handleTableClick = () => {
        requireSubscription(() => {
            setProperty(null);
            setView('table');
        });
    };

    return (
        <div
            className="inline-flex rounded-md border border-border overflow-hidden flex-shrink-0"
            data-testid="view-switcher"
        >
            <button
                type="button"
                onClick={handleBuyersFeedClick}
                className={`${segmentClass(view === 'buyers-feed')} border-r border-border`}
                data-testid="button-buyers-feed"
            >
                <Users className="w-3.5 h-3.5" />
                Buyers Feed
            </button>
            <button
                type="button"
                onClick={handleWholesaleClick}
                className={`${segmentClass(view === 'wholesale')} border-r border-border`}
                data-testid="button-view-wholesale"
            >
                <DollarSign className="w-3.5 h-3.5" />
                Wholesale
            </button>
            <button
                type="button"
                onClick={handleMapClick}
                className={`${segmentClass(view === 'map')} border-r border-border`}
                data-testid="button-view-map"
            >
                <Map className="w-3.5 h-3.5" />
                Map
            </button>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        className={segmentClass(view === 'grid' || view === 'table')}
                        data-testid="button-view-more"
                    >
                        {view === 'grid' ? (
                            <Grid3x3 className="w-3.5 h-3.5" />
                        ) : view === 'table' ? (
                            <Table2 className="w-3.5 h-3.5" />
                        ) : null}
                        {view === 'grid' ? 'Grid' : view === 'table' ? 'Table' : 'More'}
                        <ChevronDown className="w-3 h-3 opacity-50" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="z-[10000]">
                    <DropdownMenuItem
                        className="gap-2"
                        onClick={handleGridClick}
                        data-testid="button-view-grid"
                    >
                        <Grid3x3 className="w-4 h-4" />
                        Grid
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        className="gap-2"
                        onClick={handleTableClick}
                        data-testid="button-view-table"
                    >
                        <Table2 className="w-4 h-4" />
                        Table
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
