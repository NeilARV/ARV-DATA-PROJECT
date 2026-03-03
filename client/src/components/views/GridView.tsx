import type { Property } from "@/types/property";
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

type SortOption = "recently-sold" | "days-held" | "price-high-low" | "price-low-high";

interface WholesaleLeaderboardEntry {
  rank: number;
  companyId: string;
  companyName: string;
  wholesaleCount: number;
}

interface GridViewProps {
  properties: Property[];
  selectedCompany: string | null;
  totalCompanyProperties: number;
  totalFilteredProperties: number;
  hasActiveFilters: boolean;
  sortBy: SortOption;
  onSortChange: (sortBy: SortOption) => void;
  onPropertyClick: (property: Property) => void;
  onClearCompanyFilter: () => void;
  onClearFilters: () => void;
  gridColsClass: string;
  propertiesHasMore: boolean;
  isLoadingMoreProperties: boolean;
  isLoading?: boolean;
  loadMoreRef: React.RefObject<HTMLDivElement>;
  /** When true (wholesale feed), show top 3 wholesalers leaderboard in the header */
  showWholesaleLeaderboard?: boolean;
  /** County filter for wholesale leaderboard (e.g. "San Diego") */
  county?: string;
  /** Called when user clicks a company in the wholesale leaderboard */
  onWholesaleLeaderboardCompanyClick?: (companyName: string, companyId?: string) => void;
}

export default function GridView({
  properties,
  selectedCompany,
  totalCompanyProperties,
  totalFilteredProperties,
  hasActiveFilters,
  sortBy,
  onSortChange,
  onPropertyClick,
  onClearCompanyFilter,
  onClearFilters,
  gridColsClass,
  propertiesHasMore,
  isLoadingMoreProperties,
  isLoading = false,
  loadMoreRef,
  showWholesaleLeaderboard = false,
  county = "San Diego",
  onWholesaleLeaderboardCompanyClick,
}: GridViewProps) {
  // Show loader when initially loading and no properties yet
  const showInitialLoader = isLoading && properties.length === 0;

  const { data: wholesaleLeaderboard = [], isLoading: isLoadingLeaderboard } = useQuery<
    WholesaleLeaderboardEntry[]
  >({
    queryKey: ["/api/companies/wholesale-leaderboard", county],
    queryFn: async () => {
      const url = `/api/companies/wholesale-leaderboard${county ? `?county=${encodeURIComponent(county)}` : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch wholesale leaderboard");
      return res.json();
    },
    enabled: showWholesaleLeaderboard,
  });

  // TODO: remove – temporary mock 3rd wholesaler when DB has < 3
  const mockThird: WholesaleLeaderboardEntry = {
    rank: 3,
    companyId: "__mock_third__",
    companyName: "Mock Wholesaler Co",
    wholesaleCount: 1,
  };
  const leaderboardDisplay =
    wholesaleLeaderboard.length < 3
      ? [...wholesaleLeaderboard, { ...mockThird, rank: wholesaleLeaderboard.length + 1 }]
      : wholesaleLeaderboard;

  return (
    <div className="h-full overflow-y-auto p-6 flex-1 flex flex-col min-w-0">
      <div className="mb-4">
        {/* Row 1: property count, top wholesalers, sort by — stays on one line */}
        <div className="flex items-center justify-between gap-4 flex-nowrap min-w-0">
          <div className="min-w-0 flex-shrink-0">
            <h2 className="text-2xl font-semibold leading-tight">
              {`${totalFilteredProperties} Properties`}
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
            ) : leaderboardDisplay.length > 0 ? (
              <div className="flex items-center gap-2 flex-wrap">
                {leaderboardDisplay.map((entry) => {
                  const isMock = entry.companyId === "__mock_third__";
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
                      onClick={() => !isMock && onWholesaleLeaderboardCompanyClick?.(entry.companyName, entry.companyId)}
                      className={`w-[160px] pl-2 pr-2 py-1.5 rounded-md border border-border border-l-4 bg-background transition-colors flex items-center gap-1.5 text-left min-w-0 overflow-hidden ${isMock ? "cursor-default opacity-70" : "cursor-pointer hover:bg-muted/50"} ${borderAccent}`}
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
          <Select value={sortBy} onValueChange={(value) => onSortChange(value as SortOption)}>
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
        {(selectedCompany || hasActiveFilters) && (
          <p className="text-muted-foreground mt-1.5">
            <span className="flex items-center gap-2 flex-wrap">
              {selectedCompany && (
                <button
                  onClick={onClearCompanyFilter}
                  className="text-primary hover:underline text-sm"
                  data-testid="button-clear-company-filter"
                >
                  Deselect Company
                </button>
              )}
              {selectedCompany && hasActiveFilters && (
                <span className="text-muted-foreground">•</span>
              )}
              {hasActiveFilters && (
                <button
                  onClick={onClearFilters}
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
                onClick={() => onPropertyClick(property)}
              />
            ))}
          </div>
          {/* Infinite scroll trigger */}
          {propertiesHasMore && (
            <div ref={loadMoreRef} className="h-20 flex items-center justify-center mt-4">
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

