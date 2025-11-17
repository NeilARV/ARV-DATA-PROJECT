import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
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

function MapBounds({ properties }: { properties: Property[] }) {
  const map = useMap();
  
  useEffect(() => {
    if (properties.length > 0) {
      const bounds = L.latLngBounds(
        properties.map(p => [p.latitude, p.longitude])
      );
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [properties, map]);

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
        {properties.length > 0 && <MapBounds properties={properties} />}
        {properties.map((property) => (
          <Marker
            key={property.id}
            position={[property.latitude, property.longitude]}
            icon={customIcon}
            eventHandlers={{
              click: () => onPropertyClick?.(property),
            }}
          >
            <Popup>
              <div className="min-w-[200px]" data-testid={`popup-property-${property.id}`}>
                <div className="font-bold text-base mb-1">
                  ${property.price.toLocaleString()}
                </div>
                <div className="text-sm mb-1">{property.address}</div>
                <div className="text-xs text-muted-foreground mb-1">
                  {property.city}, {property.state}
                </div>
                <div className="text-xs">
                  {property.bedrooms} bd | {property.bathrooms} ba | {property.squareFeet.toLocaleString()} sqft
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
