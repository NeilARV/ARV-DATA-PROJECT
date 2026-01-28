// Core property DTO used throughout the frontend.
// Mirrors the API response shape returned by /api/properties
// and /api/properties/:id.
export type Property = {
  id: string;
  // Address info
  address: string;
  city: string;
  state: string;
  zipCode: string;
  county: string;
  latitude: number | null;
  longitude: number | null;
  // Structure info
  bedrooms: number;
  bathrooms: number;
  squareFeet: number;
  yearBuilt: number | null;
  // Property info
  propertyType: string;
  status: string;
  msa: string | null;
  // Sale info
  price: number;
  dateSold: string | null;
  // Company info
  companyId: string | null;
  companyName: string | null;
  companyContactName: string | null;
  companyContactEmail: string | null;
  // Legacy aliases
  propertyOwner: string | null;
  propertyOwnerId: string | null;
  // Optional fields
  description: string | null;
  imageUrl: string | null;
  // Timestamps
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
};

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