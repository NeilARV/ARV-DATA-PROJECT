import { useMemo, useEffect } from "react";
import Header from "@/components/Header";
import FilterSidebar from "@/components/FilterSidebar";
import CompanyDirectory from "@/components/CompanyDirectory";
import PropertyMap from "@/components/property/PropertyMap";
import GridView from "@/components/views/GridView";
import TableView from "@/components/views/TableView";
import PropertyDetailPanel from "@/components/property/PropertyDetailPanel";
import PropertyModalContent from "@/components/property/PropertyModal";
import AppDialog from "@/components/modals/Dialog";
import LoginContent from "@/components/modals/Login";
import SignupContent from "@/components/modals/Signup";
import LeaderboardContent from "@/components/modals/Leaderboard";
import InfoContent from "@/components/modals/Info";
import DealsContent from "@/components/modals/Deals";
import { Button } from "@/components/ui/button";
import { Filter, Building2 } from "lucide-react";
import { useDialogs } from "@/hooks/useDialogs";
import { useAuth } from "@/hooks/use-auth";
import { FiltersProvider, useFilters } from "@/hooks/useFilters";
import type { MapPin } from "@/types/property";
import { ViewProvider, useView } from "@/hooks/useView";
import { PropertiesProvider } from "@/hooks/useProperties";
import { CompaniesProvider, useCompanies } from "@/hooks/useCompanies";
import { MapProvider, useGeoMap } from "@/hooks/useMap";
import { PropertyProvider, useProperty } from "@/hooks/useProperty";

function HomeContent() {
  const { filters } = useFilters();
  const { view, sidebarView, setSidebarView } = useView();
  const { loadCompanies, companySelectionInProgressRef } = useCompanies();
  const { mapPins = [] } = useGeoMap({ fetchMapPins: true });
  const { dialog, openDialog, closeDialog, isForced, headerDialogHandlers } = useDialogs();
  const { user } = useAuth();
  const { property, setProperty } = useProperty();

  // Open the property modal whenever a property is selected in table view
  useEffect(() => {
    if (property !== null && view === "table") {
      openDialog({ type: "property" });
    }
  }, [property, view]);

  // Load companies when directory is open (with county filter). Skip when user just clicked a company
  // (e.g. wholesaler in grid, or company in property panel/modal) so that company can be shown via ensuredCompany.
  useEffect(() => {
    if (sidebarView === "directory" && !companySelectionInProgressRef.current) {
      loadCompanies();
    }
  }, [sidebarView, filters.county, loadCompanies, companySelectionInProgressRef]);

  // Calculate zip codes with property counts
  // Use map pins in map view, full properties in grid/table views
  const zipCodesWithCounts = useMemo(() => {
    const dataSource = mapPins
    const counts: Record<string, number> = {};
    dataSource.forEach(p => {
      const zipCode = (p as MapPin).zipcode
      counts[zipCode] = (counts[zipCode] || 0) + 1;
    });
    return Object.entries(counts).map(([zipCode, count]) => ({
      zipCode,
      count
    }));
  }, [mapPins, view]);

  return (
    <div className="h-screen flex flex-col">
      <Header
        county={filters.county}
        onLoginClick={headerDialogHandlers.onLoginClick}
        onSignupClick={headerDialogHandlers.onSignupClick}
        onLeaderboardClick={headerDialogHandlers.onLeaderboardClick}
        onRMClick={headerDialogHandlers.onRMClick}
        onDealsClick={headerDialogHandlers.onDealsClick}
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
                  <PropertyMap/>
                </div>
              </>
            ) : view === "table" ? (
              <TableView/>
            ) : view === "buyers-feed" ? (
              <>
                <PropertyDetailPanel/>
                <GridView sideBarView={sidebarView}/>
              </>
            ) : (
              <>
                <PropertyDetailPanel/>
                <GridView
                  showWholesaleLeaderboard={view === "wholesale"}
                  sideBarView={sidebarView}
                />
              </>
            )}
          </div>
        </div>
      </div>

      <AppDialog
        open={dialog !== null}
        onClose={() => {
          if (dialog?.type === "property") setProperty(null);
          closeDialog();
        }}
        forced={isForced}
        className={
          dialog?.type === "leaderboard"
            ? "max-w-3xl max-h-[80vh] overflow-y-auto"
            : dialog?.type === "property"
            ? "max-w-2xl max-h-[90vh] overflow-y-auto"
            : dialog?.type === "deals"
            ? "max-w-lg [&>button]:hidden"
            : dialog?.type === "info"
            ? "max-w-sm"
            : "sm:max-w-md"
        }
      >
        {dialog?.type === "login" && (
          <LoginContent
            onSuccess={closeDialog}
            onSwitchToSignup={() => openDialog({ type: "signup", forced: false })}
          />
        )}
        {dialog?.type === "signup" && (
          <SignupContent
            onSuccess={closeDialog}
            onSwitchToLogin={() => openDialog({ type: "login", forced: false })}
          />
        )}
        {dialog?.type === "leaderboard" && <LeaderboardContent onClose={closeDialog} />}
        {dialog?.type === "info" && user?.relationshipManager && <InfoContent onClose={closeDialog} />}
        {dialog?.type === "deals" && <DealsContent onClose={closeDialog} />}
        {dialog?.type === "property" && (
          <PropertyModalContent onClose={() => { setProperty(null); closeDialog(); }} />
        )}
      </AppDialog>

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