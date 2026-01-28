import type { Property } from "@/types/property";
import PropertyTable from "@/components/property/PropertyTable";
import { Loader2 } from "lucide-react";

interface TableViewProps {
  properties: Property[];
  selectedCompany: string | null;
  totalCompanyProperties: number;
  totalFilteredProperties: number;
  hasActiveFilters: boolean;
  onPropertyClick: (property: Property) => void;
  onClearCompanyFilter: () => void;
  onClearFilters: () => void;
  propertiesHasMore: boolean;
  isLoadingMoreProperties: boolean;
  isLoading?: boolean;
  loadMoreRef: React.RefObject<HTMLDivElement>;
}

export default function TableView({
  properties,
  selectedCompany,
  totalCompanyProperties,
  totalFilteredProperties,
  hasActiveFilters,
  onPropertyClick,
  onClearCompanyFilter,
  onClearFilters,
  propertiesHasMore,
  isLoadingMoreProperties,
  isLoading = false,
  loadMoreRef,
}: TableViewProps) {
  // Show loader when initially loading and no properties yet
  const showInitialLoader = isLoading && properties.length === 0;

  return (
    <div className="h-full overflow-y-auto p-6 flex-1 flex flex-col">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold mb-1">
            {selectedCompany && totalCompanyProperties > 0
              ? `${totalFilteredProperties} / ${totalCompanyProperties} Properties`
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
                    data-testid="button-clear-filters-table"
                  >
                    Clear Filters
                  </button>
                )}
              </span>
            </p>
          )}
        </div>
      </div>
      {showInitialLoader ? (
        <div className="flex items-center justify-center flex-1">
          <div className="flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">Loading properties...</p>
          </div>
        </div>
      ) : (
        <div>
          <PropertyTable
            properties={properties}
            onPropertyClick={onPropertyClick}
          />
          {/* Infinite scroll trigger */}
          {propertiesHasMore && (
            <div ref={loadMoreRef} className="h-20 flex items-center justify-center">
              {isLoadingMoreProperties && (
                <div className="text-muted-foreground">Loading more properties...</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

