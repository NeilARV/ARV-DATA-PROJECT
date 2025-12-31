import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import { Property } from '@shared/schema';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

const createColoredIcon = (color: string) => {
  const svgIcon = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="25" height="41">
      <path fill="${color}" stroke="#333" stroke-width="1" d="M12 0C5.4 0 0 5.4 0 12c0 7.2 12 24 12 24s12-16.8 12-24c0-6.6-5.4-12-12-12z"/>
      <circle fill="#fff" cx="12" cy="12" r="5"/>
    </svg>
  `;
  return new L.Icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(svgIcon)}`,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [-120, -34],
  });
};

const blueIcon = createColoredIcon('#69C9E1');
const greenIcon = createColoredIcon('#22C55E');
const charcoalIcon = createColoredIcon('#4B5563');
const grayIcon = createColoredIcon('#808080');

// Selected marker icons (with orange/yellow color to stand out)
const selectedBlueIcon = createColoredIcon('#FFA500');
const selectedGreenIcon = createColoredIcon('#FFA500');
const selectedCharcoalIcon = createColoredIcon('#FFA500');
const selectedGrayIcon = createColoredIcon('#FFA500');

const getIconForStatus = (status: string | null | undefined, isSelected: boolean = false) => {
  if (isSelected) {
    // All selected markers use the same orange color for visibility
    return selectedBlueIcon;
  }
  
  switch (status) {
    case 'on-market':
      return greenIcon;
    case 'off-market':
      return grayIcon;
    case 'sold':
      return charcoalIcon;
    case 'in-renovation':
    default:
      return blueIcon;
  }
};

interface PropertyMapProps {
  properties: Property[];
  onPropertyClick?: (property: Property) => void;
  center?: [number, number];
  zoom?: number;
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
  selectedProperty?: Property | null;
}

function MapBounds({ properties, center, zoom }: { properties: Property[], center?: [number, number], zoom?: number }) {
  const map = useMap();
  const previousPropertyIdsRef = useRef<string>('');
  const previousCenterRef = useRef<[number, number] | undefined>(undefined);
  
  useEffect(() => {
    // Create a sorted string of property IDs to compare
    const currentPropertyIds = properties.map(p => p.id).sort().join(',');
    
    // Only refit bounds if the property set actually changed (not just a re-render)
    const propertySetChanged = previousPropertyIdsRef.current !== currentPropertyIds;
    previousPropertyIdsRef.current = currentPropertyIds;
    
    // Check if center changed
    const centerChanged = center !== undefined && (
      previousCenterRef.current === undefined ||
      (center[0] !== previousCenterRef.current[0] || center[1] !== previousCenterRef.current[1])
    );
    
    previousCenterRef.current = center;
    
    // If center is explicitly set (e.g., from zipcode selection), use it
    if (center && zoom && centerChanged) {
      map.setView(center, zoom);
      return;
    }
    
    if (properties.length > 0) {
      // Filter properties with valid coordinates
      const validProperties = properties.filter(p => 
        p.latitude != null && p.longitude != null && 
        !isNaN(p.latitude) && !isNaN(p.longitude)
      );
      
      if (validProperties.length > 0) {
        // Only fit bounds if the property set changed (filters applied, etc.)
        // Don't refit when just selecting a property (which doesn't change the property set)
        if (propertySetChanged && center === undefined) {
          const bounds = L.latLngBounds(
            validProperties.map(p => [p.latitude!, p.longitude!])
          );
          map.fitBounds(bounds, { padding: [50, 50] });
        }
      } else if (center && zoom) {
        // Reset to default view when no valid coordinates exist
        map.setView(center, zoom);
      }
    } else if (center && zoom) {
      // No properties at all, use default view
      map.setView(center, zoom);
    }
  }, [properties, center, zoom, map]);

  return null;
}

export default function PropertyMap({ 
  properties, 
  onPropertyClick, 
  center = [32.7157, -117.1611], 
  zoom = 14,
  hasActiveFilters = false,
  onClearFilters,
  selectedProperty
}: PropertyMapProps) {
  // Filter properties with valid coordinates for rendering on map
  const validProperties = properties.filter(p => 
    p.latitude != null && p.longitude != null && 
    !isNaN(p.latitude) && !isNaN(p.longitude)
  );

  return (
    <div className="w-full h-full relative" data-testid="map-container">
      {hasActiveFilters && onClearFilters && (
        <div className="absolute top-4 right-4 z-[999]">
          <Button
            variant="default"
            size="sm"
            onClick={onClearFilters}
            className="shadow-lg"
            data-testid="button-clear-filters-map"
          >
            <X className="w-4 h-4 mr-2" />
            Clear Filters
          </Button>
        </div>
      )}
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapBounds properties={validProperties} center={center} zoom={zoom} />
        {validProperties.map((property) => {
          const isSelected = selectedProperty?.id === property.id;
          return (
            <Marker
              key={property.id}
              position={[property.latitude!, property.longitude!]}
              icon={getIconForStatus(property.status, isSelected)}
              eventHandlers={{
                click: () => onPropertyClick?.(property),
              }}
            />
          );
        })}
      </MapContainer>
    </div>
  );
}
