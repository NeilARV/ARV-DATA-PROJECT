import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/Header";
import FilterSidebar, { PropertyFilters } from "@/components/FilterSidebar";
import PropertyCard from "@/components/PropertyCard";
import PropertyMap from "@/components/PropertyMap";
import PropertyDetailModal from "@/components/PropertyDetailModal";
import PropertyDetailPanel from "@/components/PropertyDetailPanel";
import UploadDialog from "@/components/UploadDialog";
import { Property } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Filter } from "lucide-react";
import { queryClient } from "@/lib/queryClient";

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

export default function Home() {
  const [viewMode, setViewMode] = useState<"map" | "grid">("map");
  const [showFilters, setShowFilters] = useState(true);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [filters, setFilters] = useState<PropertyFilters | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number] | undefined>(undefined);
  const [mapZoom, setMapZoom] = useState<number>(12);

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

  return (
    <div className="h-screen flex flex-col">
      <Header
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onUploadClick={() => setShowUploadDialog(true)}
      />

      <div className="flex-1 flex overflow-hidden">
        {showFilters && (
          <FilterSidebar
            onClose={() => setShowFilters(false)}
            onFilterChange={setFilters}
            availableZipCodes={availableZipCodes}
          />
        )}

        <div className="flex-1 flex flex-col">
          {!showFilters && (
            <div className="p-2 border-b border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(true)}
                data-testid="button-show-filters"
              >
                <Filter className="w-4 h-4 mr-2" />
                Show Filters
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
                    properties={filteredProperties}
                    onPropertyClick={setSelectedProperty}
                    center={mapCenter}
                    zoom={mapZoom}
                  />
                </div>
              </>
            ) : (
              <div className="h-full overflow-y-auto p-6 flex-1">
                <div className="mb-4">
                  <h2 className="text-2xl font-semibold mb-1">
                    {filteredProperties.length} Properties
                  </h2>
                  <p className="text-muted-foreground">
                    Find your perfect home
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredProperties.map((property) => (
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

      {viewMode === "grid" && (
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
