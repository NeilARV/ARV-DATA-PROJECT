import { useState, useEffect } from "react";
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
import { Property } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Filter, Building2 } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import propertyImage1 from '@assets/generated_images/Modern_suburban_family_home_ea49b726.png';
import propertyImage2 from '@assets/generated_images/Luxury_ranch_style_home_5e6e8db5.png';
import propertyImage3 from '@assets/generated_images/Contemporary_urban_townhouse_e2993c21.png';
import propertyImage4 from '@assets/generated_images/Classic_colonial_home_f380dc3d.png';
import propertyImage5 from '@assets/generated_images/Craftsman_style_bungalow_2cb4e86f.png';
import propertyImage6 from '@assets/generated_images/Mediterranean_villa_home_96a33131.png';

const MOCK_PROPERTIES: Property[] = [
  {
    id: '1',
    address: '123 Maple Street',
    city: 'San Francisco',
    state: 'CA',
    zipCode: '94102',
    price: 1250000,
    bedrooms: 4,
    bathrooms: 2.5,
    squareFeet: 2400,
    propertyType: 'Single Family',
    imageUrl: propertyImage1,
    latitude: 37.7749,
    longitude: -122.4194,
    description: 'Stunning modern home in the heart of San Francisco.',
    yearBuilt: 2018,
    propertyOwner: 'Smith Family Trust',
    companyContactName: 'John Smith',
    companyContactEmail: 'john.smith@example.com',
    purchasePrice: 1100000,
    dateSold: '2023-06-15',
  },
  {
    id: '2',
    address: '456 Oak Avenue',
    city: 'San Francisco',
    state: 'CA',
    zipCode: '94103',
    price: 980000,
    bedrooms: 3,
    bathrooms: 2,
    squareFeet: 1800,
    propertyType: 'Townhouse',
    imageUrl: propertyImage2,
    latitude: 37.7699,
    longitude: -122.4144,
    description: 'Charming townhouse with modern updates.',
    yearBuilt: 2015,
    propertyOwner: 'Johnson Properties LLC',
    companyContactName: 'Emily Johnson',
    companyContactEmail: 'emily@johnsonproperties.com',
    purchasePrice: 875000,
    dateSold: '2022-11-20',
  },
  {
    id: '3',
    address: '789 Pine Street',
    city: 'Oakland',
    state: 'CA',
    zipCode: '94612',
    price: 725000,
    bedrooms: 2,
    bathrooms: 2,
    squareFeet: 1400,
    propertyType: 'Condo',
    imageUrl: propertyImage3,
    latitude: 37.8044,
    longitude: -122.2712,
    description: 'Contemporary condo with city views.',
    yearBuilt: 2020,
    propertyOwner: 'Bay Area Investments',
    companyContactName: 'Michael Chen',
    companyContactEmail: 'mchen@bayareainvest.com',
    purchasePrice: 650000,
    dateSold: '2023-01-10',
  },
  {
    id: '4',
    address: '321 Elm Boulevard',
    city: 'Berkeley',
    state: 'CA',
    zipCode: '94704',
    price: 1450000,
    bedrooms: 5,
    bathrooms: 3,
    squareFeet: 3200,
    propertyType: 'Single Family',
    imageUrl: propertyImage4,
    latitude: 37.8715,
    longitude: -122.2730,
    description: 'Spacious family home near UC Berkeley.',
    yearBuilt: 2010,
    propertyOwner: 'Rodriguez Family',
    companyContactName: 'Maria Rodriguez',
    companyContactEmail: 'maria.rodriguez@gmail.com',
    purchasePrice: 1300000,
    dateSold: '2021-08-05',
  },
  {
    id: '5',
    address: '654 Cedar Lane',
    city: 'San Jose',
    state: 'CA',
    zipCode: '95113',
    price: 890000,
    bedrooms: 3,
    bathrooms: 2.5,
    squareFeet: 2000,
    propertyType: 'Townhouse',
    imageUrl: propertyImage5,
    latitude: 37.3382,
    longitude: -121.8863,
    description: 'Beautiful craftsman in quiet neighborhood.',
    yearBuilt: 2012,
    propertyOwner: 'SJ Realty Group',
    companyContactName: 'David Park',
    companyContactEmail: 'dpark@sjrealty.com',
    purchasePrice: 800000,
    dateSold: '2022-03-22',
  },
  {
    id: '6',
    address: '987 Birch Drive',
    city: 'Palo Alto',
    state: 'CA',
    zipCode: '94301',
    price: 2100000,
    bedrooms: 4,
    bathrooms: 3.5,
    squareFeet: 3500,
    propertyType: 'Single Family',
    imageUrl: propertyImage6,
    latitude: 37.4419,
    longitude: -122.1430,
    description: 'Luxurious Mediterranean villa with premium finishes.',
    yearBuilt: 2019,
    propertyOwner: 'Tech Ventures LLC',
    companyContactName: 'Sarah Williams',
    companyContactEmail: 'swilliams@techventures.com',
    purchasePrice: 1950000,
    dateSold: '2023-09-12',
  },
];

type SortOption = "recently-sold" | "days-held" | "price-high-low" | "price-low-high";

export default function Home() {
  const [viewMode, setViewMode] = useState<"map" | "grid" | "table">("map");
  const [sidebarView, setSidebarView] = useState<"filters" | "directory" | "none">("filters");
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [filters, setFilters] = useState<PropertyFilters | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number] | undefined>(undefined);
  const [mapZoom, setMapZoom] = useState<number>(12);
  const [sortBy, setSortBy] = useState<SortOption>("recently-sold");

  // Fetch properties from backend
  const { data: properties = [], isLoading } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });

  const handleUploadSuccess = () => {
    // Refresh properties after upload
    queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
  };

  const availableZipCodes = Array.from(new Set(properties.map(p => p.zipCode))).sort();

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

  const filteredProperties = properties.filter(property => {
    // Apply company filter first if one is selected
    if (selectedCompany && property.propertyOwner?.trim() !== selectedCompany) {
      return false;
    }

    // Then apply regular filters
    if (!filters) return true;

    if (property.price < filters.minPrice || property.price > filters.maxPrice) {
      return false;
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

    return true;
  });

  const handleCompanySelect = (companyName: string) => {
    setSelectedCompany(companyName);
    setSidebarView("none"); // Close the directory
    // Reset map center/zoom so the map auto-fits to the filtered properties
    setMapCenter(undefined);
    setMapZoom(12);
    // Keep the user in their current view mode (map or grid)
  };

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
        onViewModeChange={setViewMode}
        onUploadClick={() => setShowUploadDialog(true)}
      />

      <div className="flex-1 flex overflow-hidden">
        {sidebarView === "filters" && (
          <FilterSidebar
            onClose={() => setSidebarView("none")}
            onFilterChange={setFilters}
            availableZipCodes={availableZipCodes}
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
                Directory
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
                  />
                </div>
              </>
            ) : viewMode === "table" ? (
              <div className="h-full overflow-y-auto p-6 flex-1">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-semibold mb-1">
                      {sortedProperties.length} Properties
                      {selectedCompany && (
                        <span className="text-base font-normal text-muted-foreground ml-2">
                          owned by {selectedCompany}
                        </span>
                      )}
                    </h2>
                    <p className="text-muted-foreground">
                      {selectedCompany ? (
                        <button
                          onClick={() => {
                            setSelectedCompany(null);
                            setMapCenter(undefined);
                            setMapZoom(12);
                          }}
                          className="text-primary hover:underline text-sm"
                          data-testid="button-clear-company-filter"
                        >
                          Clear company filter
                        </button>
                      ) : (
                        "View all properties in table format"
                      )}
                    </p>
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
                      {sortedProperties.length} Properties
                      {selectedCompany && (
                        <span className="text-base font-normal text-muted-foreground ml-2">
                          owned by {selectedCompany}
                        </span>
                      )}
                    </h2>
                    <p className="text-muted-foreground">
                      {selectedCompany ? (
                        <button
                          onClick={() => {
                            setSelectedCompany(null);
                            setMapCenter(undefined);
                            setMapZoom(12);
                          }}
                          className="text-primary hover:underline text-sm"
                          data-testid="button-clear-company-filter"
                        >
                          Clear company filter
                        </button>
                      ) : (
                        "Find your perfect home"
                      )}
                    </p>
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
    </div>
  );
}
