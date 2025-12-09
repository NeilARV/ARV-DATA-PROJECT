import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import { Property } from '@shared/schema';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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

const getIconForStatus = (status: string | null | undefined) => {
  switch (status) {
    case 'on-market':
      return greenIcon;
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
}

function MapBounds({ properties, center, zoom }: { properties: Property[], center?: [number, number], zoom?: number }) {
  const map = useMap();
  
  useEffect(() => {
    if (properties.length > 0) {
      // Filter properties with valid coordinates
      const validProperties = properties.filter(p => 
        p.latitude != null && p.longitude != null && 
        !isNaN(p.latitude) && !isNaN(p.longitude)
      );
      
      if (validProperties.length > 0) {
        // Fit bounds to valid properties
        const bounds = L.latLngBounds(
          validProperties.map(p => [p.latitude!, p.longitude!])
        );
        map.fitBounds(bounds, { padding: [50, 50] });
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
  center = [37.7749, -122.4194], 
  zoom = 14 
}: PropertyMapProps) {
  // Filter properties with valid coordinates for rendering on map
  const validProperties = properties.filter(p => 
    p.latitude != null && p.longitude != null && 
    !isNaN(p.latitude) && !isNaN(p.longitude)
  );

  return (
    <div className="w-full h-full" data-testid="map-container">
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
        {validProperties.map((property) => (
          <Marker
            key={property.id}
            position={[property.latitude!, property.longitude!]}
            icon={getIconForStatus(property.status)}
            eventHandlers={{
              click: () => onPropertyClick?.(property),
            }}
          />
        ))}
      </MapContainer>
    </div>
  );
}
