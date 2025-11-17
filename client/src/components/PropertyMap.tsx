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
    if (center && zoom) {
      map.setView(center, zoom);
    } else if (properties.length > 0) {
      const bounds = L.latLngBounds(
        properties.map(p => [p.latitude, p.longitude])
      );
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [properties, center, zoom, map]);

  return null;
}

export default function PropertyMap({ 
  properties, 
  onPropertyClick, 
  center = [37.7749, -122.4194], 
  zoom = 12 
}: PropertyMapProps) {
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
        <MapBounds properties={properties} center={center} zoom={zoom} />
        {properties.map((property) => (
          <Marker
            key={property.id}
            position={[property.latitude, property.longitude]}
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
