import PropertyCard from "@/components/property/PropertyCard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Trophy } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { SortOption } from "@/types/options";
import { GridViewProps, WholesaleLeaderboardEntry } from "@/types/views";
import { useFilters } from "@/hooks/useFilters";
import { useProperties } from "@/hooks/useProperties";
import { useCompanies } from "@/hooks/useCompanies";
import { useProperty } from "@/hooks/useProperty";
import { useMemo } from "react";

export default function GridView({
  properties,
  showWholesaleLeaderboard = false,
  sideBarView
}: GridViewProps) {

  const { filters, clearFilters, hasActiveFilters, sortBy, setSortBy } = useFilters();
  const { totalProperties, propertiesHasMore, isLoading, isLoadingMoreProperties, loadMorePropertiesRef } = useProperties();
  const { property, fetchProperty, setProperty } = useProperty();
  const { company, setCompany, handleCompanyClick } = useCompanies();

  // Show loader when initially loading and no properties yet
  const showInitialLoader = isLoading && properties.length === 0;

  const { data: wholesaleLeaderboard = [], isLoading: isLoadingLeaderboard } = useQuery<
    WholesaleLeaderboardEntry[]
  >({
    queryKey: ["/api/companies/wholesale-leaderboard", filters.county],
    queryFn: async () => {
      const url = `/api/companies/wholesale-leaderboard${filters.county ? `?county=${encodeURIComponent(filters.county)}` : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch wholesale leaderboard");
      return res.json();
    },
    enabled: showWholesaleLeaderboard,
  });


    // Calculate grid columns based on sidebar and property detail panel visibility
    const gridColsClass = useMemo(() => {
      const hasSidebar = sideBarView !== "none";
      const hasPropertyPanel = property !== null;
      
      // Both sidebar and panel open - use 2 columns max
      if (hasSidebar && hasPropertyPanel) {
        return "grid-cols-1 md:grid-cols-2";
      }
      // Only sidebar OR panel open - use 2-3 columns
      if (hasSidebar || hasPropertyPanel) {
        return "grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3";
      }
      // Neither open - full 3 columns
      return "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";
    }, [sideBarView, property]);

  return (
    <div className="h-full overflow-y-auto p-6 flex-1 flex flex-col min-w-0">
      <div className="mb-4">
        {/* Row 1: property count, top wholesalers, sort by — stays on one line */}
        <div className="flex items-center justify-between gap-4 flex-nowrap min-w-0">
          <div className="min-w-0 flex-shrink-0">
            <h2 className="text-2xl font-semibold leading-tight">
              {`${totalProperties} Properties`}
            </h2>
          </div>
        {showWholesaleLeaderboard && (
          <div className="flex items-center gap-2 min-w-0 flex-shrink flex-wrap">
            <span className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <Trophy className="w-4 h-4 text-amber-500 shrink-0" />
              Top Wholesalers
            </span>
            {isLoadingLeaderboard ? (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            ) : wholesaleLeaderboard.length > 0 ? (
              <div className="flex items-center gap-2 flex-wrap">
                {wholesaleLeaderboard.map((entry) => {
                  const badgeStyles =
                    entry.rank === 1
                      ? "bg-amber-400 text-white font-semibold"
                      : entry.rank === 2
                        ? "bg-slate-400 text-white font-semibold"
                        : "bg-amber-700 text-amber-100 font-semibold";
                  const borderAccent =
                    entry.rank === 1
                      ? "border-l-amber-400"
                      : entry.rank === 2
                        ? "border-l-slate-400"
                        : "border-l-amber-700";
                  return (
                    <button
                      key={entry.companyId}
                      type="button"
                      onClick={() => {
                        setProperty(null);
                        handleCompanyClick?.(entry.companyName, entry.companyId);
                      }}
                      className={`w-[160px] pl-2 pr-2 py-1.5 rounded-md border border-border border-l-4 bg-background transition-colors flex items-center gap-1.5 text-left min-w-0 overflow-hidden cursor-pointer hover:bg-muted/50 ${borderAccent}`}
                    >
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${badgeStyles}`}>
                        {entry.rank}
                      </span>
                      <span className="font-medium text-sm truncate min-w-0 flex-1 text-foreground">
                        {entry.companyName}
                      </span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                        {entry.wholesaleCount}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">No data</span>
            )}
          </div>
        )}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-sm text-muted-foreground">Sort by:</span>
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
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
              <SelectItem value="price-high-low" data-testid="sort-price-high-low">
                Price: High to Low
              </SelectItem>
              <SelectItem value="price-low-high" data-testid="sort-price-low-high">
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
                onClick={() => fetchProperty(property.id)}
              />
            ))}
          </div>
          {/* Infinite scroll trigger */}
          {propertiesHasMore && (
            <div ref={loadMorePropertiesRef as React.RefObject<HTMLDivElement>} className="h-20 flex items-center justify-center mt-4">
              {isLoadingMoreProperties && (
                <div className="text-muted-foreground">Loading more properties...</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

