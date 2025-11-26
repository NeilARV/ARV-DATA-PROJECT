import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import { Property } from '@shared/schema';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const customIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [-120, -34],
  shadowSize: [41, 41]
});

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
            icon={customIcon}
            eventHandlers={{
              click: () => onPropertyClick?.(property),
            }}
          />
        ))}
      </MapContainer>
    </div>
  );
}
