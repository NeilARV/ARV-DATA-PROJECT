import { useState } from "react";
import Header from "@/components/Header";
import FilterSidebar, { PropertyFilters } from "@/components/FilterSidebar";
import PropertyCard from "@/components/PropertyCard";
import PropertyMap from "@/components/PropertyMap";
import PropertyDetailModal from "@/components/PropertyDetailModal";
import PropertyDetailPanel from "@/components/PropertyDetailPanel";
import UploadDialog from "@/components/UploadDialog";
import { Property, InsertProperty } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Filter } from "lucide-react";

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
  },
];

export default function Home() {
  const [viewMode, setViewMode] = useState<"map" | "grid">("map");
  const [showFilters, setShowFilters] = useState(true);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [properties, setProperties] = useState<Property[]>(MOCK_PROPERTIES);
  const [filters, setFilters] = useState<PropertyFilters | null>(null);

  const handleUpload = (uploadedProperties: InsertProperty[]) => {
    const newProperties: Property[] = uploadedProperties.map((prop, idx) => ({
      ...prop,
      id: `uploaded-${Date.now()}-${idx}`,
      imageUrl: prop.imageUrl ?? null,
      description: prop.description ?? null,
      yearBuilt: prop.yearBuilt ?? null,
    }));
    setProperties([...properties, ...newProperties]);
    console.log('Properties uploaded:', newProperties.length);
  };

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
        onUpload={handleUpload}
      />
    </div>
  );
}
