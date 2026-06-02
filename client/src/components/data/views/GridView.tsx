import PropertyCard from '@/components/data/property/PropertyCard';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import type { SortOption } from '@/types/options';
import { GridViewProps } from '@/types/views';
import { useFilters } from '@/hooks/useFilters';
import { useProperties } from '@/hooks/useProperties';
import { useCompanies } from '@/hooks/useCompanies';
import { useProperty } from '@/hooks/useProperty';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useMemo } from 'react';

export default function GridView({ sideBarView }: GridViewProps) {
    const { filters, clearFilters, hasActiveFilters, sortBy, setSortBy } = useFilters();
    const {
        properties,
        totalProperties,
        propertiesHasMore,
        isLoading,
        isFetching,
        isLoadingMoreProperties,
        loadMorePropertiesRef,
        stablePropertyCount,
    } = useProperties();
    const { fetchProperty, setProperty } = useProperty();
    const { company, setCompany } = useCompanies();
    const { requireAuth } = useRequireAuth();

    // Show loader when initially loading and no properties yet
    const showInitialLoader = isLoading && properties.length === 0;

    // Avoid "25 of 1" flash: when company selected and refetching, use actual list length for "shown" count
    const displayShownCount =
        company && (isLoading || isFetching) ? properties.length : totalProperties;
    // Avoid stutter when deselecting: when no company and refetching, keep previous total
    const displayTotal =
        !company && (isLoading || isFetching) && stablePropertyCount > 0
            ? stablePropertyCount
            : totalProperties;

    // Calculate grid columns based on sidebar visibility
    const gridColsClass = useMemo(() => {
        const hasSidebar = sideBarView !== 'none';
        return hasSidebar
            ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3'
            : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
    }, [sideBarView]);

    return (
        <div className="h-full overflow-y-auto p-6 flex-1 flex flex-col min-w-0">
            <div className="mb-4">
                {/* Row 1: property count, top wholesalers, sort by — stays on one line */}
                <div className="flex items-center justify-between gap-4 flex-nowrap min-w-0">
                    <div className="min-w-0 flex-shrink-0">
                        <h2 className="text-2xl font-semibold leading-tight">
                            {company
                                ? `${displayShownCount} Properties`
                                : `${displayTotal} Properties`}
                        </h2>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-sm text-muted-foreground">Sort by:</span>
                        <Select
                            value={sortBy}
                            onValueChange={(value) => setSortBy(value as SortOption)}
                        >
                            <SelectTrigger className="w-[180px]" data-testid="select-sort">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="recently-sold" data-testid="sort-recently-sold">
                                    Recently Sold
                                </SelectItem>
                                <SelectItem value="days-held" data-testid="sort-days-held">
                                    Days Held
                                </SelectItem>
                                <SelectItem
                                    value="price-high-low"
                                    data-testid="sort-price-high-low"
                                >
                                    Price: High to Low
                                </SelectItem>
                                <SelectItem
                                    value="price-low-high"
                                    data-testid="sort-price-low-high"
                                >
                                    Price: Low to High
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                {/* Row 2: filter links on their own line so they don't affect row 1 layout */}
                {(company?.companyName || hasActiveFilters) && (
                    <p className="text-muted-foreground mt-1.5">
                        <span className="flex items-center gap-2 flex-wrap">
                            {company?.companyName && (
                                <button
                                    onClick={() => setCompany(null)}
                                    className="text-primary hover:underline text-sm"
                                    data-testid="button-clear-company-filter"
                                >
                                    Deselect Company
                                </button>
                            )}
                            {company?.companyName && hasActiveFilters && (
                                <span className="text-muted-foreground">•</span>
                            )}
                            {hasActiveFilters && (
                                <button
                                    onClick={() => clearFilters()}
                                    className="text-primary hover:underline text-sm"
                                    data-testid="button-clear-filters-grid"
                                >
                                    Clear Filters
                                </button>
                            )}
                        </span>
                    </p>
                )}
            </div>
            {showInitialLoader ? (
                <div className="flex items-center justify-center flex-1">
                    <div className="flex flex-col items-center justify-center gap-3">
                        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                        <p className="text-muted-foreground">Loading properties...</p>
                    </div>
                </div>
            ) : (
                <>
                    <div className={`grid ${gridColsClass} gap-4`}>
                        {properties.map((property) => (
                            <PropertyCard
                                key={property.id}
                                property={property}
                                onClick={() => requireAuth(() => fetchProperty(property.id))}
                            />
                        ))}
                    </div>
                    {/* Infinite scroll trigger */}
                    {propertiesHasMore && (
                        <div
                            ref={loadMorePropertiesRef as React.RefObject<HTMLDivElement>}
                            className="h-20 flex items-center justify-center mt-4"
                        >
                            {isLoadingMoreProperties && (
                                <div className="text-muted-foreground">
                                    Loading more properties...
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
