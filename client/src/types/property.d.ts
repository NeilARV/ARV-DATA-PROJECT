// Type for map pin data (minimal property data)
export type MapPin = {
  id: string;
  latitude: number | null;
  longitude: number | null;
  address: string;
  city: string;
  zipcode: string;
  county: string;
  propertyType: string;
  bedrooms: number;
  bathrooms: number;
  price: number;
  status: string | null;
  propertyOwner: string | null;
};

// Type for property rows used in admin/manage tables
export type PropertyRow = {
  id: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  county: string;
  bedrooms: number;
  bathrooms: number;
  price: number;
  propertyOwner: string | null;
};