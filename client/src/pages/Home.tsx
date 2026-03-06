import { useMemo, useEffect } from "react";
import Header from "@/components/Header";
import FilterSidebar from "@/components/FilterSidebar";
import CompanyDirectory from "@/components/CompanyDirectory";
import PropertyMap from "@/components/property/PropertyMap";
import GridView from "@/components/views/GridView";
import TableView from "@/components/views/TableView";
import PropertyDetailPanel from "@/components/property/PropertyDetailPanel";
import PropertyDetailModal from "@/components/property/PropertyDetailModal";
import SignupDialog from "@/components/modals/SignupDialog";
import LoginDialog from "@/components/modals/LoginDialog";
import LeaderboardDialog from "@/components/modals/LeaderboardDialog";
import { Button } from "@/components/ui/button";
import { Filter, Building2 } from "lucide-react";
import { useDialogs } from "@/hooks/useDialogs";
import { FiltersProvider, useFilters } from "@/hooks/useFilters";
import type { Property, MapPin } from "@/types/property";
import { ViewProvider, useView } from "@/hooks/useView";
import { PropertiesProvider, useProperties } from "@/hooks/useProperties";
import { CompaniesProvider, useCompanies } from "@/hooks/useCompanies";
import { MapProvider, useGeoMap } from "@/hooks/useMap";
import { PropertyProvider } from "@/hooks/useProperty";

function HomeContent() {
  const { filters } = useFilters();
  const { view, sidebarView, setSidebarView } = useView();
  const { properties } = useProperties();
  const { loadCompanies } = useCompanies();
  const { mapPins = [], filteredMapPins = [], isLoadingMapPins = false } = useGeoMap({ fetchMapPins: true });
  const { signupDialogProps, loginDialogProps, leaderboardDialogProps, headerDialogHandlers } = useDialogs();

  // Load companies when directory is open (with county filter)
  useEffect(() => {
    if (sidebarView === "directory") {
      loadCompanies();
    }
  }, [sidebarView, filters.county, loadCompanies]);

 

  // Calculate zip codes with property counts
  // Use map pins in map view, full properties in grid/table views
  const zipCodesWithCounts = useMemo(() => {
    const dataSource = view === "map" ? mapPins : properties;
    const counts: Record<string, number> = {};
    dataSource.forEach(p => {
      const zipCode = view === "map" ? (p as MapPin).zipcode : (p as Property).zipCode;
      counts[zipCode] = (counts[zipCode] || 0) + 1;
    });
    return Object.entries(counts).map(([zipCode, count]) => ({
      zipCode,
      count
    }));
  }, [properties, mapPins, view]);

  return (
    <div className="h-screen flex flex-col">
      <Header
        county={filters.county}
        onLoginClick={headerDialogHandlers.onLoginClick}
        onSignupClick={headerDialogHandlers.onSignupClick}
        onLeaderboardClick={headerDialogHandlers.onLeaderboardClick}
      />

      <div className="flex-1 flex overflow-hidden">
        {sidebarView === "filters" && (
          <FilterSidebar
            onClose={() => setSidebarView("none")}
            zipCodesWithCounts={zipCodesWithCounts}
            onSwitchToDirectory={() => setSidebarView("directory")}
          />
        )}
        
        {sidebarView === "directory" && (
          <CompanyDirectory
            onClose={() => setSidebarView("none")}
            onSwitchToFilters={() => setSidebarView("filters")}
          />
        )}

        <div className="flex-1 flex flex-col">
          {sidebarView === "none" && (
            <div className="p-2 border-b border-border flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSidebarView("filters")}
                data-testid="button-show-filters"
              >
                <Filter className="w-4 h-4 mr-2" />
                Filters
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSidebarView("directory")}
                data-testid="button-show-directory"
              >
                <Building2 className="w-4 h-4 mr-2" />
                Investor Profiles
              </Button>
            </div>
          )}

          <div className="flex-1 overflow-hidden flex">
            {view === "map" ? (
              <>
                <PropertyDetailPanel/>
                <div className="flex-1">
                  <PropertyMap
                    mapPins={filteredMapPins}
                    isLoading={isLoadingMapPins}
                  />
                </div>
              </>
            ) : view === "table" ? (
              <TableView properties={properties}/>
            ) : view === "buyers-feed" ? (
              <>
                <PropertyDetailPanel/>
                <GridView properties={properties} sideBarView={sidebarView}/>
              </>
            ) : (
              <>
                <PropertyDetailPanel/>
                <GridView
                  properties={properties}
                  showWholesaleLeaderboard={view === "wholesale"}
                  sideBarView={sidebarView}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {view === "table" && (
        <PropertyDetailModal/>
      )}

      <SignupDialog {...signupDialogProps} />

      <LoginDialog {...loginDialogProps} />

      <LeaderboardDialog {...leaderboardDialogProps}/>

    </div>
  );
}

export default function Home() {
  return (
    <ViewProvider>
      <MapProvider>
        <FiltersProvider>
          <CompaniesProvider>
            <PropertiesProvider>
              <PropertyProvider>
                <HomeContent />
              </PropertyProvider>
            </PropertiesProvider>
          </CompaniesProvider>
        </FiltersProvider>
      </MapProvider>
    </ViewProvider>
  );
}

// 728