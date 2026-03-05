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
  buyerPurchasePrice: number | null;
  buyerPurchaseDate: string | null;
  sellerPurchasePrice: number | null;
  sellerPurchaseDate: string | null;
  spread: number | null;
  // Buyer company info
  buyerId: string | null;
  buyerCompanyName: string | null;
  buyerContactName: string | null;
  buyerContactEmail: string | null;
  buyerContactPhone: string | null;
  // Seller company info (sellerName = fallback from transaction when sellerId is null)
  sellerId: string | null;
  sellerCompanyName: string | null;
  sellerName: string | null;
  sellerContactName: string | null;
  sellerContactEmail: string | null;
  sellerContactPhone: string | null;
  // Legacy aliases (companyId/propertyOwnerId = buyer or seller for display/filter)
  companyId: string | null;
  companyName: string | null;
  companyContactName: string | null;
  companyContactEmail: string | null;
  companyContactPhone: string | null;
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
  companyId: string | null;
  buyerId?: string | null;
  sellerId?: string | null;
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

export type PropertyDetails = {
  property: Property | null;
}
export type ViewFunctions = {
  onClose: () => void;
  onCompanyNameClick?: (companyName: string, companyId?: string, keepPanelOpen?: boolean) => void;
}

export type PropertyCardProps = {
  property: Property;
  onClick?: () => void;
}

export type PropertyDetailModalProps = PropertyDetails & ViewFunctions & {
  open: boolean;
}

export type PropertyDetailPanelProps = PropertyDetails & ViewFunctions

export type PropertyTableProps = {
  properties: Property[];
  onPropertyClick: (property: Property) => void;
}

export type StatusTag = {
  status: string;
  section: Section;
}

export type PropertyMap = {
  mapPins: MapPin[];
  onPropertyClick?: (mapPin: MapPin) => void;
  center?: [number, number];
  zoom?: number;
  onClearFilters?: () => void;
  selectedProperty?: Property | null;
  isLoading?: boolean;
  selectedCompany?: string | null;
  selectedCompanyId?: string | null;
  onDeselectCompany?: () => void;
  statusFilters?: string[];
}