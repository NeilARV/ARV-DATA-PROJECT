import { Property } from "@shared/schema";
import PropertyCard from "@/components/PropertyCard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SortOption = "recently-sold" | "days-held" | "price-high-low" | "price-low-high";

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
  loadMoreRef: React.RefObject<HTMLDivElement>;
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
  loadMoreRef,
}: GridViewProps) {
  return (
    <div className="h-full overflow-y-auto p-6 flex-1">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold mb-1">
            {selectedCompany && totalCompanyProperties > 0
              ? `${properties.length} / ${totalCompanyProperties} Properties`
              : `${totalFilteredProperties} Properties`}
            {selectedCompany && (
              <span className="text-base font-normal text-muted-foreground ml-2">
                owned by {selectedCompany}
              </span>
            )}
          </h2>
          {(selectedCompany || hasActiveFilters) && (
            <p className="text-muted-foreground">
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
        <div className="flex items-center gap-2">
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
    </div>
  );
}

