import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/Header";
import FilterSidebar, { PropertyFilters } from "@/components/FilterSidebar";
import CompanyDirectory from "@/components/CompanyDirectory";
import PropertyCard from "@/components/PropertyCard";
import PropertyMap from "@/components/PropertyMap";
import PropertyTable from "@/components/PropertyTable";
import PropertyDetailModal from "@/components/PropertyDetailModal";
import PropertyDetailPanel from "@/components/PropertyDetailPanel";
import UploadDialog from "@/components/UploadDialog";
import SignupDialog from "@/components/SignupDialog";
import LoginDialog from "@/components/LoginDialog";
import LeaderboardDialog from "@/components/LeaderboardDialog";
import { Property } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Filter, Building2 } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useAuth, useSignupPrompt } from "@/hooks/use-auth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SAN_DIEGO_ZIP_CODES, COUNTIES } from "@/constants/filters.constants";

type SortOption = "recently-sold" | "days-held" | "price-high-low" | "price-low-high";

export default function Home() {
  const [viewMode, setViewMode] = useState<"map" | "grid" | "table">("map");
  const [sidebarView, setSidebarView] = useState<"filters" | "directory" | "none">("directory");
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [filters, setFilters] = useState<PropertyFilters>({
    minPrice: 0,
    maxPrice: 10000000, // Default to max slider value
    bedrooms: 'Any',
    bathrooms: 'Any',
    propertyTypes: [],
    zipCode: '',
    city: undefined,
    county: 'San Diego', // Default to San Diego county
    statusFilters: ['in-renovation'],
  });
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number] | undefined>(undefined);
  const [mapZoom, setMapZoom] = useState<number>(12);
  const [sortBy, setSortBy] = useState<SortOption>("recently-sold");
  
  const [showSignupDialog, setShowSignupDialog] = useState(false);
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [showLeaderboardDialog, setShowLeaderboardDialog] = useState(false);
  const [isDialogForced, setIsDialogForced] = useState(false);
  
  const { user, isAuthenticated } = useAuth();
  const { shouldShowSignup, isForced, dismissPrompt } = useSignupPrompt();
  const geolocationAttemptedRef = useRef(false);
  
  // Helper function to get county center from COUNTIES array
  const getCountyCenter = (countyName: string): [number, number] | undefined => {
    const county = COUNTIES.find(c => c.county === countyName);
    return county?.center as [number, number] | undefined;
  };
  
  // Get default San Diego center from COUNTIES array
  const getDefaultMapCenter = (): [number, number] => {
    return getCountyCenter('San Diego') ?? [32.7157, -117.1611]; // Fallback if not found
  };
  
  useEffect(() => {
    if (shouldShowSignup && !isAuthenticated) {
      setShowSignupDialog(true);
      setIsDialogForced(isForced);
    }
  }, [shouldShowSignup, isAuthenticated, isForced]);

  // Get user's location on initial mount (only runs once)
  useEffect(() => {
    // Only attempt geolocation once on mount
    if (geolocationAttemptedRef.current) {
      return;
    }

    geolocationAttemptedRef.current = true;

    // Check if geolocation is available
    if (!navigator.geolocation) {
      console.log('Geolocation is not supported by this browser. Using San Diego as default.');
      setMapCenter(getDefaultMapCenter());
      setMapZoom(12);
      return;
    }

    // Request user's location with timeout
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setMapCenter([latitude, longitude]);
        setMapZoom(12);
      },
      (error) => {
        // Fall back to San Diego if geolocation fails or is denied
        setMapCenter(getDefaultMapCenter());
        setMapZoom(12);
      },
      {
        enableHighAccuracy: false, // Use less accurate but faster method
        timeout: 5000, // 5 second timeout
        maximumAge: 300000, // Accept cached location up to 5 minutes old
      }
    );
  }, []); // Empty dependency array - only runs once on mount

  // Build query parameters based on county filter
  const countyQueryParam = useMemo(() => {
    const county = filters.county ?? 'San Diego';
    return county ? `?county=${encodeURIComponent(county)}` : '';
  }, [filters.county]);

  // Build the API URL with county query parameter for full properties (grid/table views)
  const propertiesQueryUrl = useMemo(() => {
    return `/api/properties${countyQueryParam}`;
  }, [countyQueryParam]);

  // Build the API URL for map pins (minimal data for map view)
  const mapPinsQueryUrl = useMemo(() => {
    return `/api/properties/map${countyQueryParam}`;
  }, [countyQueryParam]);

  // Type for map pin data (minimal property data)
  type MapPin = {
    id: string;
    latitude: number | null;
    longitude: number | null;
    address: string;
    city: string;
    zipcode: string;
    county: string;
    propertyType: string;
    bedrooms: number;
    bathrooms: number;
    price: number;
    status: string | null;
    propertyOwner: string | null;
  };

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

  // Fetch full properties from backend filtered by county (for grid/table views)
  const { data: properties = [], isLoading } = useQuery<Property[]>({
    queryKey: [propertiesQueryUrl],
    queryFn: async () => {
      const res = await fetch(propertiesQueryUrl, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch properties: ${res.status}`);
      }
      return res.json();
    },
    enabled: viewMode !== "map", // Only fetch when NOT in map view
  });

  const handleUploadSuccess = () => {
    // Refresh properties after upload - invalidate all property queries
    //queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
    queryClient.invalidateQueries({ queryKey: ["/api/properties/map"] });
  };

  // Calculate max price rounded up to nearest million
  // Use map pins in map view, full properties in grid/table views
  const maxPriceSlider = useMemo(() => {
    const dataSource = viewMode === "map" ? mapPins : properties;
    if (dataSource.length === 0) return 10000000; // Default to 10M if no properties
    
    const maxPrice = Math.max(...dataSource.map(p => p.price || 0));
    if (maxPrice === 0) return 10000000; // Default if all prices are 0
    
    // Round up to nearest million: Math.ceil(maxPrice / 1000000) * 1000000
    return Math.ceil(maxPrice / 1000000) * 1000000;
  }, [properties, mapPins, viewMode]);

  // Check if filters are active (not in initial state) - excludes company selection
  const hasActiveFilters = useMemo(() => {
    return (
      filters.minPrice > 0 ||
      filters.maxPrice < maxPriceSlider ||
      filters.bedrooms !== 'Any' ||
      filters.bathrooms !== 'Any' ||
      filters.propertyTypes.length > 0 ||
      filters.zipCode !== '' ||
      filters.city !== undefined ||
      (filters.county !== undefined && filters.county !== 'San Diego') ||
      filters.statusFilters.length !== 1 ||
      filters.statusFilters[0] !== 'in-renovation'
    );
  }, [filters, maxPriceSlider]);

  // Reset filters to initial state (does not clear company selection)
  const handleClearAllFilters = () => {
    setFilters({
      minPrice: 0,
      maxPrice: maxPriceSlider,
      bedrooms: 'Any',
      bathrooms: 'Any',
      propertyTypes: [],
      zipCode: '',
      city: undefined,
      county: 'San Diego', // Reset to default San Diego county
      statusFilters: ['in-renovation'],
    });
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

  useEffect(() => {
    const fetchLocation = async () => {
      // Priority: zipcode > city > county (most specific to least specific)
      
      // Handle zip code filter (highest priority - most specific)
      if (filters?.zipCode && filters.zipCode.trim() !== '') {
        try {
          const response = await fetch(`https://api.zippopotam.us/us/${filters.zipCode.trim()}`);
          if (response.ok) {
            const data = await response.json();
            if (data.places && data.places.length > 0) {
              const lat = parseFloat(data.places[0].latitude);
              const lng = parseFloat(data.places[0].longitude);
              setMapCenter([lat, lng]);
              setMapZoom(13); // Closer zoom for zip code
              return; // Exit early, zipcode takes priority
            }
          }
        } catch (error) {
          console.error('Error fetching zip code location:', error);
        }
      }
      
      // Handle city filter (medium priority)
      if (filters?.city && filters.city.trim() !== '') {
        // Get the first zip code for this city to use for geocoding
        const cityZipCodes = SAN_DIEGO_ZIP_CODES.filter(z => {
          if (filters.city === 'San Diego') {
            return z.city.startsWith('San Diego');
          } else {
            return z.city === filters.city;
          }
        });
        
        if (cityZipCodes.length > 0) {
          try {
            const response = await fetch(`https://api.zippopotam.us/us/${cityZipCodes[0].zip}`);
            if (response.ok) {
              const data = await response.json();
              if (data.places && data.places.length > 0) {
                const lat = parseFloat(data.places[0].latitude);
                const lng = parseFloat(data.places[0].longitude);
                setMapCenter([lat, lng]);
                setMapZoom(12); // Medium zoom for city view
                return; // Exit early, city takes priority over county
              }
            }
          } catch (error) {
            console.error('Error fetching city location:', error);
          }
        }
      }
      
      // Handle county filter (lowest priority - most general)
      // Only center on county if no zipcode or city is selected
      if (filters?.county && filters.county.trim() !== '') {
        const countyCenter = getCountyCenter(filters.county);
        if (countyCenter) {
          setMapCenter(countyCenter);
          setMapZoom(10); // Wider zoom for county view
          return; // Exit early
        }
      }
      
      // Fallback: If no specific location filter, center on the default county (San Diego)
      const defaultCounty = filters?.county ?? 'San Diego';
      const countyCenter = getCountyCenter(defaultCounty);
      if (countyCenter) {
        setMapCenter(countyCenter);
        setMapZoom(10);
      } else {
        setMapCenter(undefined);
        setMapZoom(12);
      }
    };

    fetchLocation();
  }, [filters?.zipCode, filters?.city, filters?.county]);

  // Filter map pins for map view (using minimal data)
  const filteredMapPins = useMemo(() => {
    return mapPins.filter(pin => {
      // Apply company filter first if one is selected
      if (selectedCompany) {
        const ownerName = (pin.propertyOwner ?? "").trim().toLowerCase().replace(/\s+/g, ' ');
        const selectedName = selectedCompany.trim().toLowerCase().replace(/\s+/g, ' ');
        if (ownerName !== selectedName) {
          return false;
        }
      }

      // Filter by price
      if (pin.price != null) {
        if (pin.price < filters.minPrice || pin.price > filters.maxPrice) {
          return false;
        }
      }

      // Filter by bedrooms
      if (filters.bedrooms !== 'Any') {
        const minBeds = parseInt(filters.bedrooms);
        if (pin.bedrooms < minBeds) return false;
      }

      // Filter by bathrooms
      if (filters.bathrooms !== 'Any') {
        const minBaths = parseInt(filters.bathrooms);
        if (pin.bathrooms < minBaths) return false;
      }

      // Filter by property type
      if (filters.propertyTypes.length > 0 && !filters.propertyTypes.includes(pin.propertyType)) {
        return false;
      }

      // Filter by zip code or city
      if (filters.city && filters.city.trim() !== '') {
        const cityZipCodes = SAN_DIEGO_ZIP_CODES
          .filter(z => {
            if (filters.city === 'San Diego') {
              return z.city.startsWith('San Diego');
            } else {
              return z.city === filters.city;
            }
          })
          .map(z => z.zip);
        if (!cityZipCodes.includes(pin.zipcode)) return false;
      } else if (filters.zipCode && filters.zipCode.trim() !== '') {
        if (pin.zipcode !== filters.zipCode.trim()) return false;
      }

      // Filter by status
      if (filters.statusFilters && filters.statusFilters.length > 0) {
        const propertyStatus = pin.status || 'in-renovation';
        if (!filters.statusFilters.includes(propertyStatus)) return false;
      }

      return true;
    });
  }, [mapPins, filters, selectedCompany]);


  // Filter full properties for grid/table views
  const filteredProperties = properties.filter(property => {
    // Apply company filter first if one is selected (case-insensitive comparison with null safety)
    if (selectedCompany) {
      
      const ownerName = (property.propertyOwner ?? "").trim().toLowerCase().replace(/\s+/g, ' ');
      const selectedName = selectedCompany.trim().toLowerCase().replace(/\s+/g, ' ');
      
      if (ownerName !== selectedName) {
        return false;
      }
    }

    // Apply regular filters with null safety
    // Filter by price if price is not null
    if (property.price != null) {
      if (property.price < filters.minPrice || property.price > filters.maxPrice) {
        return false;
      }
    }
    
    if (filters.bedrooms !== 'Any') {
      const minBeds = parseInt(filters.bedrooms);

      if (property.bedrooms < minBeds) return false;
    }

    if (filters.bathrooms !== 'Any') {
      const minBaths = parseInt(filters.bathrooms);
      if (property.bathrooms < minBaths) return false;
    }

    if (filters.propertyTypes.length > 0 && !filters.propertyTypes.includes(property.propertyType)) {
      return false;
    }

    // Filter by zip code or city
    if (filters.city && filters.city.trim() !== '') {
      // If city filter is set, get all zip codes for that city
      // For "San Diego", match all cities that start with "San Diego" (e.g., "San Diego - Downtown", "San Diego", etc.)
      // For other cities, do exact match
      const cityZipCodes = SAN_DIEGO_ZIP_CODES
        .filter(z => {
          if (filters.city === 'San Diego') {
            return z.city.startsWith('San Diego');
          } else {
            return z.city === filters.city;
          }
        })
        .map(z => z.zip);
      if (!cityZipCodes.includes(property.zipCode)) return false;
    } else if (filters.zipCode && filters.zipCode.trim() !== '') {
      // If zip code filter is set, filter by zip code
      if (property.zipCode !== filters.zipCode.trim()) return false;
    }

    // Filter by status
    if (filters.statusFilters && filters.statusFilters.length > 0) {
      const propertyStatus = property.status || 'in-renovation';
      if (!filters.statusFilters.includes(propertyStatus)) return false;
    }

    return true;
  });


  const handleCompanySelect = (companyName: string | null) => {
    if (companyName) {
      // Selecting a company: preserve all existing filters and map position
      setSelectedCompany(companyName);
      // Do NOT change map center/zoom when selecting a company
    } else {
      // Deselecting/clearing the company filter: preserve all existing filters and map position
      setSelectedCompany(null);
      // Do NOT change map center/zoom when deselecting a company
    }
  };

  const handleLeaderboardCompanyClick = (companyName: string) => {
    // Preserve all existing filters when selecting a company from leaderboard
    setSelectedCompany(companyName);
    setSidebarView("none");
    // Do NOT change map center/zoom when selecting a company from leaderboard
  };

  const handleLeaderboardZipCodeClick = (zipCode: string) => {
    // Clear company filter and set zip code filter
    setSelectedCompany(null);
    setFilters({
      minPrice: 0,
      maxPrice: 10000000, // Default to max slider value
      bedrooms: 'Any',
      bathrooms: 'Any',
      propertyTypes: [],
      zipCode: zipCode,
      city: undefined,
      county: 'San Diego', // Preserve default county
      statusFilters: ["in-renovation", "on-market", "sold"],
    });
    setSidebarView("none");
    setMapCenter(undefined);
    setMapZoom(12);
  };

  const handleLogoClick = () => {
    // Reset everything to default state (like first visit)
    setViewMode("map");
    setSidebarView("directory");
    setFilters({
      minPrice: 0,
      maxPrice: 10000000, // Default to max slider value
      bedrooms: 'Any',
      bathrooms: 'Any',
      propertyTypes: [],
      zipCode: '',
      city: undefined,
      county: 'San Diego', // Reset to default San Diego county
      statusFilters: ['in-renovation'],
    });
    setSelectedCompany(null);
    setSelectedProperty(null);
    setMapCenter(undefined);
    setMapZoom(14);
    setSortBy("recently-sold");
  };

  const handleViewModeChange = (mode: "map" | "grid" | "table") => {
    // Clear selected property when switching views to avoid modal popping up
    setSelectedProperty(null);
    setViewMode(mode);
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
      // If on grid/table view, the PropertyDetailModal will show automatically
      if (viewMode === "map" && property.latitude && property.longitude) {
        setMapCenter([property.latitude, property.longitude]);
        setMapZoom(16);
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

  // Calculate total properties owned by selected company (before filters are applied)
  // Use map pins in map view, full properties in grid/table views
  const totalCompanyProperties = useMemo(() => {
    if (!selectedCompany) return 0;
    const companyNameNormalized = selectedCompany.trim().toLowerCase().replace(/\s+/g, ' ');
    const dataSource = viewMode === "map" ? mapPins : properties;
    return dataSource.filter(p => {
      const ownerName = (p.propertyOwner ?? "").trim().toLowerCase().replace(/\s+/g, ' ');
      return ownerName === companyNameNormalized;
    }).length;
  }, [properties, mapPins, selectedCompany, viewMode]);

  // Calculate current time once for deterministic sorting
  const now = Date.now();
  
  const sortedProperties = [...filteredProperties].sort((a, b) => {
    switch (sortBy) {
      case "recently-sold":
        if (!a.dateSold && !b.dateSold) return 0;
        if (!a.dateSold) return 1;
        if (!b.dateSold) return -1;
        return new Date(b.dateSold).getTime() - new Date(a.dateSold).getTime();
      case "days-held":
        if (!a.dateSold && !b.dateSold) return 0;
        if (!a.dateSold) return 1;
        if (!b.dateSold) return -1;
        // Calculate days held (from date sold to now)
        const aDaysHeld = now - new Date(a.dateSold).getTime();
        const bDaysHeld = now - new Date(b.dateSold).getTime();
        // Sort from longest to shortest
        return bDaysHeld - aDaysHeld;
      case "price-high-low":
        return b.price - a.price;
      case "price-low-high":
        return a.price - b.price;
      default:
        return 0;
    }
  });

  return (
    <div className="h-screen flex flex-col">
      <Header
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        onPropertySelect={handlePropertySelectById}
        onLoginClick={() => {
          // Header button click: user-initiated, so only force if already in forced state
          // If not forced yet, allow dismissable dialog
          setShowLoginDialog(true);
          setShowSignupDialog(false);
        }}
        onSignupClick={() => {
          // Header button click: user-initiated, so only force if already in forced state
          // If not forced yet (before 1 minute), allow dismissable dialog
          setShowSignupDialog(true);
          setShowLoginDialog(false);
        }}
        onLeaderboardClick={() => setShowLeaderboardDialog(true)}
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
            maxPriceSlider={maxPriceSlider}
          />
        )}
        
        {sidebarView === "directory" && (
          <CompanyDirectory
            onClose={() => setSidebarView("none")}
            onSwitchToFilters={() => setSidebarView("filters")}
            onCompanySelect={handleCompanySelect}
            selectedCompany={selectedCompany}
            filters={filters}
            onFilterChange={setFilters}
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
                  />
                </div>
              </>
            ) : viewMode === "table" ? (
              <div className="h-full overflow-y-auto p-6 flex-1">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-semibold mb-1">
                      {selectedCompany && hasActiveFilters && totalCompanyProperties > 0
                        ? `${sortedProperties.length} / ${totalCompanyProperties} Properties`
                        : `${sortedProperties.length} Properties`}
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
                              onClick={() => {
                                setSelectedCompany(null);
                                // Do NOT change map center/zoom when deselecting a company
                              }}
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
                              onClick={handleClearAllFilters}
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
                <PropertyTable
                  properties={sortedProperties}
                  onPropertyClick={setSelectedProperty}
                />
              </div>
            ) : (
              <div className="h-full overflow-y-auto p-6 flex-1">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-semibold mb-1">
                      {selectedCompany && hasActiveFilters && totalCompanyProperties > 0
                        ? `${sortedProperties.length} / ${totalCompanyProperties} Properties`
                        : `${sortedProperties.length} Properties`}
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
                              onClick={() => {
                                setSelectedCompany(null);
                                // Do NOT change map center/zoom when deselecting a company
                              }}
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
                              onClick={handleClearAllFilters}
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {sortedProperties.map((property) => (
                    <PropertyCard
                      key={property.id}
                      property={property}
                      onClick={() => setSelectedProperty(property)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {(viewMode === "grid" || viewMode === "table") && (
        <PropertyDetailModal
          property={selectedProperty}
          open={!!selectedProperty}
          onClose={() => setSelectedProperty(null)}
        />
      )}

      <UploadDialog
        open={showUploadDialog}
        onClose={() => setShowUploadDialog(false)}
        onSuccess={handleUploadSuccess}
      />

      <SignupDialog
        open={showSignupDialog}
        forced={isDialogForced}
        onClose={() => {
          // Only allow closing if not forced
          if (!isDialogForced) {
            setShowSignupDialog(false);
            dismissPrompt();
          }
        }}
        onSuccess={() => {
          setShowSignupDialog(false);
          setIsDialogForced(false);
          dismissPrompt();
        }}
        onSwitchToLogin={() => {
          // When switching, maintain forced state
          setShowSignupDialog(false);
          setShowLoginDialog(true);
        }}
      />

      <LoginDialog
        open={showLoginDialog}
        forced={isDialogForced}
        onClose={() => {
          // Only allow closing if not forced
          if (!isDialogForced) {
            setShowLoginDialog(false);
          }
        }}
        onSuccess={() => {
          setShowLoginDialog(false);
          setIsDialogForced(false);
        }}
        onSwitchToSignup={() => {
          // When switching, maintain forced state
          setShowLoginDialog(false);
          setShowSignupDialog(true);
        }}
      />

      <LeaderboardDialog
        open={showLeaderboardDialog}
        onOpenChange={setShowLeaderboardDialog}
        onCompanyClick={handleLeaderboardCompanyClick}
        onZipCodeClick={handleLeaderboardZipCodeClick}
      />
    </div>
  );
}
