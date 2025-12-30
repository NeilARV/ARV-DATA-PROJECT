import { useState, useEffect, useMemo } from "react";
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
  
  useEffect(() => {
    if (shouldShowSignup && !isAuthenticated) {
      setShowSignupDialog(true);
      setIsDialogForced(isForced);
    }
  }, [shouldShowSignup, isAuthenticated, isForced]);

  // Fetch properties from backend
  const { data: properties = [], isLoading } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });

  const handleUploadSuccess = () => {
    // Refresh properties after upload
    queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
  };

  // Calculate max price rounded up to nearest million
  const maxPriceSlider = useMemo(() => {
    if (properties.length === 0) return 10000000; // Default to 10M if no properties
    
    const maxPrice = Math.max(...properties.map(p => p.price || 0));
    if (maxPrice === 0) return 10000000; // Default if all prices are 0
    
    // Round up to nearest million: Math.ceil(maxPrice / 1000000) * 1000000
    return Math.ceil(maxPrice / 1000000) * 1000000;
  }, [properties]);

  // Check if filters are active (not in initial state) - excludes company selection
  const hasActiveFilters = useMemo(() => {
    return (
      filters.minPrice > 0 ||
      filters.maxPrice < maxPriceSlider ||
      filters.bedrooms !== 'Any' ||
      filters.bathrooms !== 'Any' ||
      filters.propertyTypes.length > 0 ||
      filters.zipCode !== '' ||
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
      statusFilters: ['in-renovation'],
    });
  };

  // Calculate zip codes with property counts
  const zipCodesWithCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    properties.forEach(p => {
      counts[p.zipCode] = (counts[p.zipCode] || 0) + 1;
    });
    return Object.entries(counts).map(([zipCode, count]) => ({
      zipCode,
      count
    }));
  }, [properties]);

  useEffect(() => {
    const fetchZipCodeLocation = async () => {
      if (filters?.zipCode && filters.zipCode.trim() !== '') {
        try {
          const response = await fetch(`https://api.zippopotam.us/us/${filters.zipCode.trim()}`);
          if (response.ok) {
            const data = await response.json();
            if (data.places && data.places.length > 0) {
              const lat = parseFloat(data.places[0].latitude);
              const lng = parseFloat(data.places[0].longitude);
              setMapCenter([lat, lng]);
              setMapZoom(13);
            }
          }
        } catch (error) {
          console.error('Error fetching zip code location:', error);
        }
      } else {
        setMapCenter(undefined);
        setMapZoom(12);
      }
    };

    fetchZipCodeLocation();
  }, [filters?.zipCode]);

  console.log("Properties: ", properties)

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

    if (filters.zipCode && filters.zipCode.trim() !== '') {
      if (property.zipCode !== filters.zipCode.trim()) return false;
    }

    // Filter by status
    if (filters.statusFilters && filters.statusFilters.length > 0) {
      const propertyStatus = property.status || 'in-renovation';
      if (!filters.statusFilters.includes(propertyStatus)) return false;
    }

    return true;
  });

  console.log("Filtered Properties: ", filteredProperties)

  const handleCompanySelect = (companyName: string | null) => {
    if (companyName) {
      // Selecting a company: preserve all existing filters
      setSelectedCompany(companyName);
      // Only change map center/zoom if the user is currently on the map view
      if (viewMode === "map") {
        setMapCenter(undefined);
        setMapZoom(14);
      }
    } else {
      // Deselecting/clearing the company filter: preserve all existing filters
      setSelectedCompany(null);
      // Reset map view to default only if currently on map view
      if (viewMode === "map") {
        setMapCenter(undefined);
        setMapZoom(12);
      }
    }
  };

  const handleLeaderboardCompanyClick = (companyName: string) => {
    // Preserve all existing filters when selecting a company from leaderboard
    setSelectedCompany(companyName);
    setSidebarView("none");
    setMapCenter(undefined);
    setMapZoom(12);
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

  // Calculate total properties owned by selected company (before filters are applied)
  const totalCompanyProperties = useMemo(() => {
    if (!selectedCompany) return 0;
    const companyNameNormalized = selectedCompany.trim().toLowerCase().replace(/\s+/g, ' ');
    return properties.filter(p => {
      const ownerName = (p.propertyOwner ?? "").trim().toLowerCase().replace(/\s+/g, ' ');
      return ownerName === companyNameNormalized;
    }).length;
  }, [properties, selectedCompany]);

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
                    properties={sortedProperties}
                    onPropertyClick={setSelectedProperty}
                    center={mapCenter}
                    zoom={mapZoom}
                    hasActiveFilters={hasActiveFilters}
                    onClearFilters={handleClearAllFilters}
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
                                setMapCenter(undefined);
                                setMapZoom(12);
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
                                setMapCenter(undefined);
                                setMapZoom(12);
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
