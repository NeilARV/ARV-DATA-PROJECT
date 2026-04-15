import { useMemo, useEffect } from "react";
import Header from "@/components/Header";
import FilterHeader from "@/components/FilterHeader";
import CompanyDirectory from "@/components/CompanyDirectory";
import PropertyMap from "@/components/property/PropertyMap";
import GridView from "@/components/views/GridView";
import TableView from "@/components/views/TableView";
import DealView from "@/components/views/DealView";
import PropertyDetailPanel from "@/components/property/PropertyDetailPanel";
import PropertyModalContent from "@/components/property/PropertyModal";
import AppDialog from "@/components/modals/Dialog";
import LoginContent from "@/components/modals/Login";
import SignupContent from "@/components/modals/Signup";
import LeaderboardContent from "@/components/modals/Leaderboard";
import InfoContent from "@/components/modals/Info";
import { useDialogs } from "@/hooks/useDialogs";
import { useAuth } from "@/hooks/use-auth";
import { FiltersProvider, useFilters } from "@/hooks/useFilters";
import type { MapPin } from "@/types/property";
import { useView } from "@/hooks/useView";
import { PropertiesProvider } from "@/hooks/useProperties";
import { CompaniesProvider, useCompanies } from "@/hooks/useCompanies";
import { MapProvider, useGeoMap } from "@/hooks/useMap";
import { PropertyProvider, useProperty } from "@/hooks/useProperty";

function HomeContent() {
  const { filters } = useFilters();
  const { view, sidebarView } = useView();
  const { loadCompanies, companySelectionInProgressRef } = useCompanies();
  const { mapPins = [] } = useGeoMap({ fetchMapPins: true });
  const { dialog, openDialog, closeDialog, isForced, forcedDialogActive, headerDialogHandlers } = useDialogs();
  const { user } = useAuth();
  const { property, setProperty } = useProperty();

  // Open the property modal whenever a property is selected in table/grid views
  useEffect(() => {
    if (property !== null && (view === "table" || view === "grid" || view === "buyers-feed" || view === "wholesale")) {
      openDialog({ type: "property" });
    }
  }, [property, view]);

  // Load companies on mount and when county filter changes. Skip when user just clicked a company
  // (e.g. wholesaler in grid, or company in property panel/modal) so that company can be shown via ensuredCompany.
  useEffect(() => {
    if (!companySelectionInProgressRef.current) {
      loadCompanies();
    }
  }, [filters.county, loadCompanies, companySelectionInProgressRef]);

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
        onDealsClick={headerDialogHandlers.onDealsClick}
        forcedDialogActive={forcedDialogActive}
      />

      {/* CSS grid: col 1 = sidebar (375px), col 2 = content (1fr).
          Row 1 height is auto — FilterHeader and "Investor Profiles" title share
          the same row so they always match height without hardcoded values. */}
      <div className="flex-1 grid grid-cols-[375px_1fr] grid-rows-[auto_1fr] overflow-hidden min-h-0">

        {/* [row 1, col 1] Sidebar title — height auto-tracks FilterHeader */}
        <div className="flex items-center px-4 border-b border-r border-border bg-background">
          <h2 className="text-base font-semibold">Investor Profiles</h2>
        </div>

        {/* [row 1, col 2] FilterHeader */}
        <FilterHeader zipCodesWithCounts={zipCodesWithCounts} />

        {/* [row 2, col 1] Company Directory */}
        <div className="border-r border-border overflow-hidden flex flex-col">
          <CompanyDirectory />
        </div>

        {/* [row 2, col 2] Content views */}
        <div className="overflow-hidden flex min-h-0">
          {view === "deals" ? (
            <DealView />
          ) : view === "map" ? (
            <>
              <PropertyDetailPanel />
              <div className="flex-1">
                <PropertyMap />
              </div>
            </>
          ) : view === "table" ? (
            <TableView />
          ) : view === "buyers-feed" ? (
            <GridView sideBarView="none" />
          ) : (
            <GridView
              showWholesaleLeaderboard={view === "wholesale"}
              sideBarView="none"
            />
          )}
        </div>

      </div>{/* end grid */}

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
            ? "max-w-lg max-h-[85vh] !flex flex-col [&>button]:hidden"
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
        {dialog?.type === "property" && (
          <PropertyModalContent onClose={() => { setProperty(null); closeDialog(); }} />
        )}
      </AppDialog>
    </div>
  );
}

export default function Home() {
  return (
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
  );
}

// 728