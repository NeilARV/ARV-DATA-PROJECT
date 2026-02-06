import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import type { Property } from '@/types/property';
import type { MapPin } from '@/types/property';


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
const charcoalIcon = createColoredIcon('#FF0000');
const purpleIcon = createColoredIcon('#9333EA');

// Selected marker icons (with orange color to stand out)
const selectedBlueIcon = createColoredIcon('#FFA500');

const getIconForPin = (
  pin: MapPin,
  isSelected: boolean,
  selectedCompanyId: string | null | undefined
) => {
  if (isSelected) return selectedBlueIcon;

  const status = (pin.status || '').toLowerCase().trim();
  const bid = pin.buyerId ?? null;
  const sid = pin.sellerId ?? null;

  // When a company is selected, icon reflects the company's role (buyer vs seller)
  if (selectedCompanyId) {
    if (bid === selectedCompanyId) {
      // Company owns it (buyer) - blue whether in-renovation or b2b (they're actively holding/renovating)
      return blueIcon;
    }
    if (sid === selectedCompanyId) {
      // Company sold it - red for sold, purple for b2b (sold to another reno company)
      if (status === 'b2b') return purpleIcon;
      if (status === 'sold') return charcoalIcon;
      return blueIcon; // on-market, in-renovation as seller (edge case)
    }
  }

  // No company selected - base colors by status
  switch (status) {
    case 'on-market':
      return greenIcon;
    case 'sold':
      return charcoalIcon;
    case 'b2b':
      return purpleIcon;
    case 'in-renovation':
    default:
      return blueIcon;
  }
};

interface PropertyMapProps {
  mapPins: MapPin[];
  onPropertyClick?: (mapPin: MapPin) => void;
  center?: [number, number];
  zoom?: number;
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
  selectedProperty?: Property | null;
  isLoading?: boolean;
  selectedCompany?: string | null;
  selectedCompanyId?: string | null;
  onDeselectCompany?: () => void;
}

function MapResizeHandler() {
  const map = useMap();
  
  useEffect(() => {
    // Invalidate size on mount
    setTimeout(() => {
      map.invalidateSize();
    }, 0);
    
    // Watch for window resize events
    const handleResize = () => {
      map.invalidateSize();
    };
    
    window.addEventListener('resize', handleResize);
    
    // Also use ResizeObserver to watch for container size changes
    const mapContainer = map.getContainer();
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    
    if (mapContainer) {
      resizeObserver.observe(mapContainer);
    }
    
    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
    };
  }, [map]);
  
  return null;
}

function MapBounds({ mapPins, center, zoom, selectedCompany }: { mapPins: MapPin[], center?: [number, number], zoom?: number, selectedCompany?: string | null }) {
  const map = useMap();
  const previousPropertyIdsRef = useRef<string>('');
  const previousCenterRef = useRef<[number, number] | undefined>(undefined);
  const previousSelectedCompanyRef = useRef<string | null | undefined>(undefined);
  
  useEffect(() => {
    // Create a sorted string of property IDs to compare
    const currentPropertyIds = mapPins.map(p => p.id).sort().join(',');
    
    // Only refit bounds if the property set actually changed (not just a re-render)
    const propertySetChanged = previousPropertyIdsRef.current !== currentPropertyIds;
    previousPropertyIdsRef.current = currentPropertyIds;
    
    // Check if selected company changed (triggers refit even if same properties)
    const companyChanged = selectedCompany !== previousSelectedCompanyRef.current;
    previousSelectedCompanyRef.current = selectedCompany;
    
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
    
    if (mapPins.length > 0) {
      // Filter map pins with valid coordinates
      const validPins = mapPins.filter(p => 
        p.latitude != null && p.longitude != null && 
        !isNaN(p.latitude) && !isNaN(p.longitude)
      );
      
      if (validPins.length > 0) {
        // Fit bounds if:
        // 1. Company selection changed (always fit bounds to show all company properties)
        // 2. OR property set changed AND center is not explicitly set (filters applied, etc.)
        if (companyChanged || (propertySetChanged && center === undefined)) {
          const bounds = L.latLngBounds(
            validPins.map(p => [p.latitude!, p.longitude!])
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
  }, [mapPins, center, zoom, map, selectedCompany]);

  return null;
}

export default function PropertyMap({ 
  mapPins, 
  onPropertyClick, 
  center = [32.7157, -117.1611], 
  zoom = 14,
  hasActiveFilters = false,
  onClearFilters,
  selectedProperty,
  isLoading = false,
  selectedCompany,
  selectedCompanyId,
  onDeselectCompany
}: PropertyMapProps) {
  // Filter map pins with valid coordinates for rendering on map
  const validPins = mapPins.filter(p => 
    p.latitude != null && p.longitude != null && 
    !isNaN(p.latitude) && !isNaN(p.longitude)
  );

  return (
    <div className="w-full h-full relative" data-testid="map-container">
      {(hasActiveFilters && onClearFilters) || (selectedCompany && onDeselectCompany) ? (
        <div className="absolute top-2 left-12 z-[501] flex flex-col gap-1">
          {selectedCompany && onDeselectCompany && (
            <Button
              variant="default"
              size="sm"
              onClick={onDeselectCompany}
              className="shadow-lg h-8 px-2 text-xs"
              data-testid="button-deselect-company-map"
            >
              <X className="w-3 h-2.5 mr-1.5" />
              Deselect Company
            </Button>
          )}
          {hasActiveFilters && onClearFilters && (
            <Button
              variant="default"
              size="sm"
              onClick={onClearFilters}
              className="shadow-lg h-8 px-2 text-xs"
              data-testid="button-clear-filters-map"
            >
              <X className="w-3 h-2.5 mr-1.5" />
              Clear Filters
            </Button>
          )}
        </div>
      ) : null}
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
        <MapResizeHandler />
        <MapBounds mapPins={validPins} center={center} zoom={zoom} selectedCompany={selectedCompany} />
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-[500]">
            <div className="text-muted-foreground">Loading map pins...</div>
          </div>
        ) : (
          validPins.map((pin) => {
            const isSelected = selectedProperty?.id === pin.id;
            return (
              <Marker
                key={pin.id}
                position={[pin.latitude!, pin.longitude!]}
                icon={getIconForPin(pin, isSelected, selectedCompanyId)}
                eventHandlers={{
                  click: () => onPropertyClick?.(pin),
                }}
              />
            );
          })
        )}
      </MapContainer>
    </div>
  );
}
