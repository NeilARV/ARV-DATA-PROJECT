import PropertyTable from "@/components/property/PropertyTable";
import { Loader2 } from "lucide-react";
import type { TableViewProps } from "@/types/views";
import { useFilters } from "@/hooks/useFilters";
import { useCompanies } from "@/hooks/useCompanies";
import { useProperties } from "@/hooks/useProperties";

export default function TableView({
  properties,
  isLoadingMoreProperties,
  isLoading = false,
  loadMoreRef,
}: TableViewProps) {

  const { filters, setFilters, clearFilters, hasActiveFilters } = useFilters();
  const { company, setCompany } = useCompanies();
  const { totalProperties, propertiesHasMore } = useProperties();

  const selectedCompanyName = company?.companyName ?? null;

  // Show loader when initially loading and no properties yet
  const showInitialLoader = isLoading && properties.length === 0;

  return (
    <div className="h-full overflow-y-auto p-6 flex-1 flex flex-col">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold mb-1">
            {`${totalProperties} Properties`}
            {selectedCompanyName && (
              <span className="text-base font-normal text-muted-foreground ml-2">
                owned by {selectedCompanyName}
              </span>
            )}
          </h2>
          {(selectedCompanyName || hasActiveFilters) && (
            <p className="text-muted-foreground">
              <span className="flex items-center gap-2 flex-wrap">
                {selectedCompanyName && (
                  <button
                    onClick={() => setCompany(null)}
                    className="text-primary hover:underline text-sm"
                    data-testid="button-clear-company-filter"
                  >
                    Deselect Company
                  </button>
                )}
                {selectedCompanyName && hasActiveFilters && (
                  <span className="text-muted-foreground">•</span>
                )}
                {hasActiveFilters && (
                  <button
                    onClick={() => clearFilters()}
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

