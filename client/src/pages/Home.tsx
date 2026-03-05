import { useState, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { buildPropertyQueryParams } from "@/lib/propertyQueryParams";
import { getStateFromCounty, countyNameToKey } from "@/lib/county";
import { getDefaultFilters, matchesFiltersForPin, matchesFiltersForProperty } from "@/lib/propertyFilters";
import { useDialogs } from "@/hooks/useDialogs";
import { FiltersProvider, useFilters } from "@/hooks/useFilters";
import { useGeolocationMapCenter } from "@/hooks/useGeolocationMapCenter";
import { useMapCenterFromFilters } from "@/hooks/useMapCenterFromFilters";
import { useProperties } from "@/hooks/useProperties";
import { SAN_DIEGO_MSA_ZIP_CODES, LOS_ANGELES_MSA_ZIP_CODES, DENVER_MSA_ZIP_CODES } from "@/constants/filters.constants";
import {
  MAP_ZOOM_DEFAULT,
  MAP_ZOOM_LOGO,
  MAP_ZOOM_PROPERTY,
} from "@/constants/map.constants";
import type { SortOption } from "@/types/options";
import type { Property, MapPin } from "@/types/property";
import { fetchPropertyById } from "@/api/properties.api";
import { ViewProvider, useView } from "@/hooks/useView";
import { PropertyProvider, useProperty } from "@/hooks/useProperty";
import { CompaniesProvider, useCompanies } from "@/hooks/useCompanies";

function HomeContent() {
  const { filters, setFilters } = useFilters();
  const { view, setView } = useView();
  const { property, setProperty, fetchProperty } = useProperty();
  const { company, setCompany, companyId, setCompanyId } = useCompanies();

  const [sidebarView, setSidebarView] = useState<"filters" | "directory" | "none">("directory");
  const [selectedCompanyPropertyCount, setSelectedCompanyPropertyCount] = useState<number>(0);
  const [mapCenter, setMapCenter] = useState<[number, number] | undefined>(undefined);
  const [mapZoom, setMapZoom] = useState<number | undefined>(12);
  const [sortBy, setSortBy] = useState<SortOption>("recently-sold");

  const {
    properties,
    propertiesHasMore,
    isLoadingMoreProperties,
    loadMorePropertiesRef,
    isLoading,
    isFetching,
    propertiesResponse,
    stablePropertyCount,
    stableCompanyPropertyCount,
  } = useProperties({
    sortBy,
    selectedCompanyPropertyCount,
    hasDateSold: view === "buyers-feed",
  });

  const {
    signupDialogProps,
    loginDialogProps,
    leaderboardDialogProps,
    headerDialogHandlers,
  } = useDialogs();
  const companySelectionInProgressRef = useRef(false);

  useGeolocationMapCenter(setMapCenter, setMapZoom);

  // Build the API URL for map pins (minimal data for map view)
  const mapPinsQueryUrl = useMemo(() => {
    const queryString = buildPropertyQueryParams(filters, {
      forMapPins: true,
      page: 1,
      limit: "10",
      sortBy,
    });
    return `/api/properties/map${queryString}`;
  }, [filters.county, filters.statusFilters, companyId]);


  // Fetch map pins (minimal data) for map view
  const { data: mapPins = [], isLoading: isLoadingMapPins } = useQuery<MapPin[]>({
    queryKey: [mapPinsQueryUrl],
    queryFn: async () => {
      const res = await fetch(mapPinsQueryUrl, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch map pins: ${res.status}`);
      }
      return res.json();
    },
    enabled: view === "map", // Only fetch when in map view
  });

  const totalFilteredProperties = useMemo(() => {
    if (view === "map") return 0;
    const propertiesTotal = propertiesResponse?.total;
    return isLoading && propertiesTotal === undefined
      ? stablePropertyCount
      : (propertiesTotal ?? stablePropertyCount);
  }, [view, propertiesResponse, isLoading, stablePropertyCount]);

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

  // Get the appropriate zip code list based on state and county filter
  const zipCodeList = useMemo(() => {
    const countyName = filters.county ?? 'San Diego';
    const state = getStateFromCounty(countyName);
    const countyKey = countyNameToKey(countyName);

    // Get the appropriate MSA zip codes object based on state
    let msaZipCodes: Record<string, Array<{ zip: string; city: string }>>;
    if (state === 'CA') {
      // Check if it's Los Angeles MSA (Los Angeles or Orange county)
      if (countyName === 'Los Angeles' || countyName === 'Orange') {
        msaZipCodes = LOS_ANGELES_MSA_ZIP_CODES;
      } else {
        // San Diego MSA (San Diego county)
        msaZipCodes = SAN_DIEGO_MSA_ZIP_CODES;
      }
    } else if (state === 'CO') {
      // Denver MSA
      msaZipCodes = DENVER_MSA_ZIP_CODES;
    } else {
      // Default to San Diego MSA
      msaZipCodes = SAN_DIEGO_MSA_ZIP_CODES;
    }

    // Get the zip codes for the specific county
    const countyZipCodes = msaZipCodes[countyKey];
    
    // Return the array or empty array if county not found
    return Array.isArray(countyZipCodes) ? countyZipCodes : [];
  }, [filters.county]);

  // Filter map pins for map view (using minimal data)
  const filteredMapPins = useMemo(
    () =>
      mapPins.filter((pin) =>
        matchesFiltersForPin(
          pin,
          zipCodeList,
        )
      ),
    [mapPins, filters, company, companyId, zipCodeList]
  );

  useMapCenterFromFilters({
    filteredMapPins,
    setMapCenter,
    setMapZoom,
    companySelectionInProgressRef,
  });

  const propertiesToFilter = properties;

  // Filter full properties for grid/table views
  const filteredProperties = propertiesToFilter.filter((property) =>
    matchesFiltersForProperty(
      property,
      zipCodeList,
    )
  );


  // Helper function to fetch company property count
  const fetchCompanyPropertyCount = async (companyName: string) => {
    try {
      const companies = await fetchCompanyContacts()

      if (companies) {
        const company = companies.find((c: any) => 
          c.companyName.trim().toLowerCase() === companyName.trim().toLowerCase()
        );
        if (company) {
          setSelectedCompanyPropertyCount(company.propertyCount || 0);
        } else {
          setSelectedCompanyPropertyCount(0);
        }
      } else {
        setSelectedCompanyPropertyCount(0);
      }
    } catch (error) {
      console.error("Error fetching company property count:", error);
      setSelectedCompanyPropertyCount(0);
    }
  };

  // Helper function to clear company selection
  const clearCompanySelection = () => {
    setCompany(null);
    setCompanyId(null);
    setSelectedCompanyPropertyCount(0);
  };

  const handleCompanySelect = async (companyName: string | null, companyId?: string | null) => {
    if (companyName) {
      // Mark that we're starting a company selection to prevent location filter from interfering
      companySelectionInProgressRef.current = true;
      
      // Selecting a company: set the company first, then let the effect handle centering
      setCompany(companyName);
      setCompanyId(companyId || null);
      setProperty(null); // Close property panel when selecting a different company
      // Don't clear center/zoom here - let the company selection effect handle it
      // This prevents race conditions with the location filter effect
      
      // Fetch the company's total property count from the API
      await fetchCompanyPropertyCount(companyName);
    } else {
      // Deselecting/clearing the company filter: preserve all existing filters and map position
      companySelectionInProgressRef.current = false;
      clearCompanySelection();
      // Do NOT change map center/zoom when deselecting a company
    }
  };

  const handleLeaderboardCompanyClick = async (companyName: string, companyId?: string) => {
    // Mark that we're starting a company selection
    companySelectionInProgressRef.current = true;
    
    // Preserve all existing filters when selecting a company from leaderboard
    setCompany(companyName);
    setCompanyId(companyId || null);
    setSidebarView("directory"); // Keep directory open to show selected company
    setProperty(null); // Close property panel when selecting a different company
    // Don't clear center/zoom here - let the company selection effect handle it
    
    // Fetch the company's total property count
    await fetchCompanyPropertyCount(companyName);
  };

  const handleCompanyNameClick = async (companyName: string, companyId?: string, keepPanelOpen?: boolean) => {
    // Mark that we're starting a company selection
    companySelectionInProgressRef.current = true;
    
    // Open the directory and select the company
    setCompany(companyName);
    setCompanyId(companyId || null);
    setSidebarView("directory");
    // Only close property panel if not clicking from within the panel itself
    if (!keepPanelOpen) {
      setProperty(null);
    }
    // Don't clear center/zoom here - let the company selection effect handle it
    
    // Fetch the company's total property count
    await fetchCompanyPropertyCount(companyName);
    // The CompanyDirectory component will auto-scroll to the selected company
  };


  const handleLeaderboardZipCodeClick = (zipCode: string) => {
    // Clear company filter and set zip code filter. Preserve current county so the
    // zip (which belongs to the leaderboard's county) matches the map's data.
    clearCompanySelection();
    setFilters(
      getDefaultFilters({
        zipCode,
        county: filters.county ?? "San Diego",
        statusFilters: ["in-renovation", "on-market", "sold"],
      })
    );
    // Open/keep FilterSidebar open when selecting a zip (like company click opens directory)
    setSidebarView("filters");
    setMapCenter(undefined);
    setMapZoom(MAP_ZOOM_DEFAULT);
  };

  const handleLogoClick = () => {
    // Reset everything to default state (like first visit)
    setView("map");
    setSidebarView("directory");
    clearCompanySelection();
    setProperty(null);
    setMapCenter(undefined);
    setMapZoom(MAP_ZOOM_LOGO);
    setSortBy("recently-sold");
  };

  // Handle property selection by ID (for search suggestions)
  const handlePropertySelectById = async (propertyId: string) => {
    const property = await fetchPropertyById(propertyId);
    if (property) {
      setProperty(property);
      
      // If on map view, center on the property if it has coordinates
      if (view === "map" && property.latitude && property.longitude) {
        setMapCenter([property.latitude, property.longitude]);
        setMapZoom(MAP_ZOOM_PROPERTY);
      }
    }
  };

  // Properties are now sorted server-side, so we can use them directly
  // The API returns properties in the correct sorted order based on the sortBy parameter
  const sortedProperties = filteredProperties;

  // Calculate grid columns based on sidebar and property detail panel visibility
  const gridColsClass = useMemo(() => {
    const hasSidebar = sidebarView !== "none";
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
  }, [sidebarView, property]);

  return (
    <div className="h-screen flex flex-col">
      <Header
        onPropertySelect={handlePropertySelectById}
        county={filters.county}
        onLoginClick={headerDialogHandlers.onLoginClick}
        onSignupClick={headerDialogHandlers.onSignupClick}
        onLeaderboardClick={headerDialogHandlers.onLeaderboardClick}
        onLogoClick={handleLogoClick}
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
            onCompanySelect={handleCompanySelect}
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
                {property && (
                  <PropertyDetailPanel
                    property={property}
                    onClose={() => setProperty(null)}
                    onCompanyNameClick={handleCompanyNameClick}
                  />
                )}
                <div className="flex-1">
                  <PropertyMap
                    mapPins={filteredMapPins}
                    center={mapCenter}
                    zoom={mapZoom}
                    selectedProperty={property}
                    isLoading={isLoadingMapPins}
                    onDeselectCompany={clearCompanySelection}
                    statusFilters={filters.statusFilters}
                  />
                </div>
              </>
            ) : view === "table" ? (
              <TableView
                properties={sortedProperties}
                totalFilteredProperties={totalFilteredProperties}
                onClearCompanyFilter={clearCompanySelection}
                propertiesHasMore={propertiesHasMore}
                isLoadingMoreProperties={isLoadingMoreProperties}
                isLoading={isLoading}
                loadMoreRef={loadMorePropertiesRef as React.RefObject<HTMLDivElement>}
              />
            ) : view === "buyers-feed" ? (
              <>
                {property && (
                  <PropertyDetailPanel
                    property={property}
                    onClose={() => setProperty(null)}
                    onCompanyNameClick={handleCompanyNameClick}
                  />
                )}
                <GridView
                  properties={sortedProperties}
                  totalFilteredProperties={totalFilteredProperties}
                  sortBy={sortBy}
                  onSortChange={setSortBy}
                  onClearCompanyFilter={clearCompanySelection}
                  gridColsClass={gridColsClass}
                  propertiesHasMore={propertiesHasMore}
                  isLoadingMoreProperties={isLoadingMoreProperties}
                  isLoading={isLoading}
                  loadMoreRef={loadMorePropertiesRef as React.RefObject<HTMLDivElement>}
                />
              </>
            ) : (
              <>
                {property && (
                  <PropertyDetailPanel
                    property={property}
                    onClose={() => setProperty(null)}
                    onCompanyNameClick={handleCompanyNameClick}
                  />
                )}
                <GridView
                  properties={sortedProperties}
                  totalFilteredProperties={totalFilteredProperties}
                  sortBy={sortBy}
                  onSortChange={setSortBy}
                  onClearCompanyFilter={clearCompanySelection}
                  gridColsClass={gridColsClass}
                  propertiesHasMore={propertiesHasMore}
                  isLoadingMoreProperties={isLoadingMoreProperties}
                  isLoading={isLoading}
                  loadMoreRef={loadMorePropertiesRef as React.RefObject<HTMLDivElement>}
                  showWholesaleLeaderboard={view === "wholesale"}
                  county={filters.county}
                  onWholesaleLeaderboardCompanyClick={handleLeaderboardCompanyClick}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {view === "table" && (
        <PropertyDetailModal
          property={property}
          open={!!property}
          onClose={() => setProperty(null)}
          onCompanyNameClick={handleCompanyNameClick}
        />
      )}

      <SignupDialog {...signupDialogProps} />

      <LoginDialog {...loginDialogProps} />

      <LeaderboardDialog
        {...leaderboardDialogProps}
        onCompanyClick={handleLeaderboardCompanyClick}
        onZipCodeClick={handleLeaderboardZipCodeClick}
      />

    </div>
  );
}

export default function Home() {
  return (
    <ViewProvider>
      <FiltersProvider>
        <CompaniesProvider>
          <PropertyProvider>
            <HomeContent />
          </PropertyProvider>
        </CompaniesProvider>
      </FiltersProvider>
    </ViewProvider>
  );
}

// 728