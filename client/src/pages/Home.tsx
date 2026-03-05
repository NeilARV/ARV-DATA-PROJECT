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
import { queryClient } from "@/lib/queryClient";
import { buildPropertyQueryParams } from "@/lib/propertyQueryParams";
import { getStateFromCounty, countyNameToKey } from "@/lib/county";
import { getDefaultFilters, matchesFiltersForPin, matchesFiltersForProperty } from "@/lib/propertyFilters";
import { useDialogs } from "@/hooks/useDialogs";
import { useGeolocationMapCenter } from "@/hooks/useGeolocationMapCenter";
import { useMapCenterFromFilters } from "@/hooks/useMapCenterFromFilters";
import { useProperties } from "@/hooks/useProperties";
import { SAN_DIEGO_MSA_ZIP_CODES, LOS_ANGELES_MSA_ZIP_CODES, DENVER_MSA_ZIP_CODES, MAX_PRICE } from "@/constants/filters.constants";
import {
  MAP_ZOOM_DEFAULT,
  MAP_ZOOM_LOGO,
  MAP_ZOOM_PROPERTY,
} from "@/constants/map.constants";
import {
  BUYERS_FEED_STATUS_FILTERS,
  PROPERTY_STATUS,
  WHOLESALE_VIEW_STATUS_FILTERS,
} from "@/constants/propertyStatus.constants";
import type { SortOption, View } from "@/types/options";
import type { PropertyFilters } from "@/types/filters";
import type { Property, MapPin } from "@/types/property";

export default function Home() {
  const [viewMode, setViewMode] = useState<View>("map");
  const [sidebarView, setSidebarView] = useState<"filters" | "directory" | "none">("directory");
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [filters, setFilters] = useState<PropertyFilters>(getDefaultFilters());
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
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
    filters,
    viewMode,
    sortBy,
    selectedCompanyId,
    selectedCompany,
    selectedCompanyPropertyCount,
    hasDateSold: viewMode === "buyers-feed",
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
      selectedCompanyId,
      selectedCompany,
    });
    return `/api/properties/map${queryString}`;
  }, [filters.county, filters.statusFilters, selectedCompanyId]);


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
    enabled: viewMode === "map", // Only fetch when in map view
  });

  const totalFilteredProperties = useMemo(() => {
    if (viewMode === "map") return 0;
    const propertiesTotal = propertiesResponse?.total;
    return isLoading && propertiesTotal === undefined
      ? stablePropertyCount
      : (propertiesTotal ?? stablePropertyCount);
  }, [viewMode, propertiesResponse, isLoading, stablePropertyCount]);

  // Use stable company property count to avoid flashing "0"
  const displayCompanyPropertyCount = useMemo(() => {
    if (!selectedCompany) return 0;
    // If we're fetching and don't have a value yet, use the stable one
    return selectedCompanyPropertyCount > 0 ? selectedCompanyPropertyCount : stableCompanyPropertyCount;
  }, [selectedCompany, selectedCompanyPropertyCount, stableCompanyPropertyCount]);

  const handleUploadSuccess = () => {
    // Refresh properties after upload - invalidate all property queries
    //queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
    queryClient.invalidateQueries({ queryKey: ["/api/properties/map"] });
  };

  // Check if filters are active (not in initial state) - excludes company selection and county/state (those are preserved on clear)
  const hasActiveFilters = useMemo(() => {
    return (
      filters.minPrice > 0 ||
      filters.maxPrice < MAX_PRICE ||
      filters.bedrooms !== 'Any' ||
      filters.bathrooms !== 'Any' ||
      filters.propertyTypes.length > 0 ||
      filters.zipCode !== '' ||
      filters.city !== undefined ||
      filters.statusFilters.length !== 1 ||
      filters.statusFilters[0] !== PROPERTY_STATUS.IN_RENOVATION
    );
  }, [filters]);

  // Reset filters to initial state (does not clear company selection; preserves county and state)
  const handleClearAllFilters = () => {
    setFilters(getDefaultFilters({ county: filters.county ?? "San Diego" }));
  };

  // Calculate zip codes with property counts
  // Use map pins in map view, full properties in grid/table views
  const zipCodesWithCounts = useMemo(() => {
    const dataSource = viewMode === "map" ? mapPins : properties;
    const counts: Record<string, number> = {};
    dataSource.forEach(p => {
      const zipCode = viewMode === "map" ? (p as MapPin).zipcode : (p as Property).zipCode;
      counts[zipCode] = (counts[zipCode] || 0) + 1;
    });
    return Object.entries(counts).map(([zipCode, count]) => ({
      zipCode,
      count
    }));
  }, [properties, mapPins, viewMode]);

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
          filters,
          zipCodeList,
          selectedCompanyId,
          selectedCompany
        )
      ),
    [mapPins, filters, selectedCompany, selectedCompanyId, zipCodeList]
  );

  useMapCenterFromFilters({
    filters,
    selectedCompany,
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
      filters,
      zipCodeList,
      selectedCompanyId,
      selectedCompany
    )
  );


  // Helper function to fetch company property count
  const fetchCompanyPropertyCount = async (companyName: string) => {
    try {
      const response = await fetch(`/api/companies/contacts`, {
        credentials: "include",
      });
      if (response.ok) {
        const companies = await response.json();
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
    setSelectedCompany(null);
    setSelectedCompanyId(null);
    setSelectedCompanyPropertyCount(0);
  };

  const handleCompanySelect = async (companyName: string | null, companyId?: string | null) => {
    if (companyName) {
      // Mark that we're starting a company selection to prevent location filter from interfering
      companySelectionInProgressRef.current = true;
      
      // Selecting a company: set the company first, then let the effect handle centering
      setSelectedCompany(companyName);
      setSelectedCompanyId(companyId || null);
      setSelectedProperty(null); // Close property panel when selecting a different company
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
    setSelectedCompany(companyName);
    setSelectedCompanyId(companyId || null);
    setSidebarView("directory"); // Keep directory open to show selected company
    setSelectedProperty(null); // Close property panel when selecting a different company
    // Don't clear center/zoom here - let the company selection effect handle it
    
    // Fetch the company's total property count
    await fetchCompanyPropertyCount(companyName);
  };

  const handleCompanyNameClick = async (companyName: string, companyId?: string, keepPanelOpen?: boolean) => {
    // Mark that we're starting a company selection
    companySelectionInProgressRef.current = true;
    
    // Open the directory and select the company
    setSelectedCompany(companyName);
    setSelectedCompanyId(companyId || null);
    setSidebarView("directory");
    // Only close property panel if not clicking from within the panel itself
    if (!keepPanelOpen) {
      setSelectedProperty(null);
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
    setViewMode("map");
    setSidebarView("directory");
    setFilters(getDefaultFilters());
    clearCompanySelection();
    setSelectedProperty(null);
    setMapCenter(undefined);
    setMapZoom(MAP_ZOOM_LOGO);
    setSortBy("recently-sold");
  };

  const handleViewModeChange = (mode: "map" | "grid" | "table" | "buyers-feed" | "wholesale") => {
    // Clear selected property when switching views to avoid modal popping up
    setSelectedProperty(null);
    setViewMode(mode);
  };

  // When switching to Buyer Feed, auto-select wholesale and in-renovation status
  const handleBuyersFeedClick = () => {
    setSelectedProperty(null);
    setFilters((prev) => ({ ...prev, statusFilters: BUYERS_FEED_STATUS_FILTERS }));
    setViewMode("buyers-feed");
  };

  const handleWholesaleClick = () => {
    setSelectedProperty(null);
    setFilters((prev) => ({ ...prev, statusFilters: WHOLESALE_VIEW_STATUS_FILTERS }));
    setViewMode("wholesale");
  };

  // Fetch full property data by ID
  const fetchPropertyById = async (propertyId: string): Promise<Property | null> => {
    try {
      const response = await fetch(`/api/properties/${propertyId}`, {
        credentials: "include",
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          console.error("Property not found");
          return null;
        }
        throw new Error(`Failed to fetch property: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error("Error fetching property by ID:", error);
      return null;
    }
  };

  // Handle property selection by ID (for search suggestions)
  const handlePropertySelectById = async (propertyId: string) => {
    const property = await fetchPropertyById(propertyId);
    if (property) {
      setSelectedProperty(property);
      
      // If on map view, center on the property if it has coordinates
      if (viewMode === "map" && property.latitude && property.longitude) {
        setMapCenter([property.latitude, property.longitude]);
        setMapZoom(MAP_ZOOM_PROPERTY);
      }
    }
  };

  // Handle map pin click - fetch full property data
  const handleMapPinClick = async (mapPin: MapPin) => {
    const property = await fetchPropertyById(mapPin.id);
    if (property) {
      setSelectedProperty(property);
    }
  };

  // Handle property click from grid/table - fetch full property data (includes buyer/seller)
  const handlePropertyClick = async (property: Property) => {
    const fullProperty = await fetchPropertyById(property.id);
    if (fullProperty) {
      setSelectedProperty(fullProperty);
    }
  };

  // Calculate total properties owned by selected company
  // For map view, count from mapPins. For grid/table views, use the API response total which respects county filter
  const totalCompanyProperties = useMemo(() => {
    if (!selectedCompany) return 0;
    if (viewMode === "map") {
      const companyNameNormalized = selectedCompany.trim().toLowerCase().replace(/\s+/g, ' ');
      return mapPins.filter(p => {
        const ownerName = (p.propertyOwner ?? "").trim().toLowerCase().replace(/\s+/g, ' ');
        return ownerName === companyNameNormalized;
      }).length;
    }
    // For grid/table views, use the API response total which already includes company and county filters
    // This ensures the count respects the county filter (e.g., 27/27 in San Diego, not 27/28 total)
    if (propertiesResponse?.total !== undefined) {
      return propertiesResponse.total;
    }
    // Fallback to stable count during loading to avoid flashing "0"
    return displayCompanyPropertyCount;
  }, [mapPins, selectedCompany, viewMode, propertiesResponse?.total, displayCompanyPropertyCount]);

  // Properties are now sorted server-side, so we can use them directly
  // The API returns properties in the correct sorted order based on the sortBy parameter
  const sortedProperties = filteredProperties;

  // Calculate grid columns based on sidebar and property detail panel visibility
  const gridColsClass = useMemo(() => {
    const hasSidebar = sidebarView !== "none";
    const hasPropertyPanel = selectedProperty !== null;
    
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
  }, [sidebarView, selectedProperty]);

  return (
    <div className="h-screen flex flex-col">
      <Header
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        onPropertySelect={handlePropertySelectById}
        county={filters.county}
        onLoginClick={headerDialogHandlers.onLoginClick}
        onSignupClick={headerDialogHandlers.onSignupClick}
        onLeaderboardClick={headerDialogHandlers.onLeaderboardClick}
        onBuyersFeedClick={handleBuyersFeedClick}
        onWholesaleClick={handleWholesaleClick}
        onLogoClick={handleLogoClick}
      />

      <div className="flex-1 flex overflow-hidden">
        {sidebarView === "filters" && (
          <FilterSidebar
            onClose={() => setSidebarView("none")}
            onFilterChange={setFilters}
            filters={filters}
            zipCodesWithCounts={zipCodesWithCounts}
            onSwitchToDirectory={() => setSidebarView("directory")}
          />
        )}
        
        {sidebarView === "directory" && (
          <CompanyDirectory
            onClose={() => setSidebarView("none")}
            onSwitchToFilters={() => setSidebarView("filters")}
            onCompanySelect={handleCompanySelect}
            selectedCompany={selectedCompany}
            selectedCompanyId={selectedCompanyId}
            filters={filters}
            onFilterChange={setFilters}
            viewMode={viewMode}
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
            {viewMode === "map" ? (
              <>
                {selectedProperty && (
                  <PropertyDetailPanel
                    property={selectedProperty}
                    onClose={() => setSelectedProperty(null)}
                    onCompanyNameClick={handleCompanyNameClick}
                  />
                )}
                <div className="flex-1">
                  <PropertyMap
                    mapPins={filteredMapPins}
                    onPropertyClick={handleMapPinClick}
                    center={mapCenter}
                    zoom={mapZoom}
                    hasActiveFilters={hasActiveFilters}
                    onClearFilters={handleClearAllFilters}
                    selectedProperty={selectedProperty}
                    isLoading={isLoadingMapPins}
                    selectedCompany={selectedCompany}
                    selectedCompanyId={selectedCompanyId}
                    onDeselectCompany={clearCompanySelection}
                    statusFilters={filters.statusFilters}
                  />
                </div>
              </>
            ) : viewMode === "table" ? (
              <TableView
                properties={sortedProperties}
                selectedCompany={selectedCompany}
                totalCompanyProperties={totalCompanyProperties}
                totalFilteredProperties={totalFilteredProperties}
                hasActiveFilters={hasActiveFilters}
                onPropertyClick={handlePropertyClick}
                onClearCompanyFilter={clearCompanySelection}
                onClearFilters={handleClearAllFilters}
                propertiesHasMore={propertiesHasMore}
                isLoadingMoreProperties={isLoadingMoreProperties}
                isLoading={isLoading}
                loadMoreRef={loadMorePropertiesRef as React.RefObject<HTMLDivElement>}
              />
            ) : viewMode === "buyers-feed" ? (
              <>
                {selectedProperty && (
                  <PropertyDetailPanel
                    property={selectedProperty}
                    onClose={() => setSelectedProperty(null)}
                    onCompanyNameClick={handleCompanyNameClick}
                  />
                )}
                <GridView
                  properties={sortedProperties}
                  selectedCompany={selectedCompany}
                  totalCompanyProperties={totalCompanyProperties}
                  totalFilteredProperties={totalFilteredProperties}
                  hasActiveFilters={hasActiveFilters}
                  sortBy={sortBy}
                  onSortChange={setSortBy}
                  onPropertyClick={handlePropertyClick}
                  onClearCompanyFilter={clearCompanySelection}
                  onClearFilters={handleClearAllFilters}
                  gridColsClass={gridColsClass}
                  propertiesHasMore={propertiesHasMore}
                  isLoadingMoreProperties={isLoadingMoreProperties}
                  isLoading={isLoading}
                  loadMoreRef={loadMorePropertiesRef as React.RefObject<HTMLDivElement>}
                />
              </>
            ) : (
              <>
                {selectedProperty && (
                  <PropertyDetailPanel
                    property={selectedProperty}
                    onClose={() => setSelectedProperty(null)}
                    onCompanyNameClick={handleCompanyNameClick}
                  />
                )}
                <GridView
                  properties={sortedProperties}
                  selectedCompany={selectedCompany}
                  totalCompanyProperties={totalCompanyProperties}
                  totalFilteredProperties={totalFilteredProperties}
                  hasActiveFilters={hasActiveFilters}
                  sortBy={sortBy}
                  onSortChange={setSortBy}
                  onPropertyClick={handlePropertyClick}
                  onClearCompanyFilter={clearCompanySelection}
                  onClearFilters={handleClearAllFilters}
                  gridColsClass={gridColsClass}
                  propertiesHasMore={propertiesHasMore}
                  isLoadingMoreProperties={isLoadingMoreProperties}
                  isLoading={isLoading}
                  loadMoreRef={loadMorePropertiesRef as React.RefObject<HTMLDivElement>}
                  showWholesaleLeaderboard={viewMode === "wholesale"}
                  county={filters.county}
                  onWholesaleLeaderboardCompanyClick={handleLeaderboardCompanyClick}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {viewMode === "table" && (
        <PropertyDetailModal
          property={selectedProperty}
          open={!!selectedProperty}
          onClose={() => setSelectedProperty(null)}
          onCompanyNameClick={handleCompanyNameClick}
        />
      )}

      <SignupDialog {...signupDialogProps} />

      <LoginDialog {...loginDialogProps} />

      <LeaderboardDialog
        {...leaderboardDialogProps}
        onCompanyClick={handleLeaderboardCompanyClick}
        onZipCodeClick={handleLeaderboardZipCodeClick}
        county={filters.county}
      />

    </div>
  );
}
// 728