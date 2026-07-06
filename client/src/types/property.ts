import type { PropertyDetailTransaction } from '@shared/types/properties';

export type Property = {
    id: string;
    sfrPropertyId: number | null;
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
    statuses?: string[];
    msa: string | null;
    // Sale info
    price: number;
    dateSold: string | null;
    buyerPurchasePrice: number | null;
    buyerPurchaseDate: string | null;
    sellerPurchasePrice: number | null;
    sellerPurchaseDate: string | null;
    spread: number | null;
    // Transaction history (detail endpoint only; absent on list rows). Supplemental-tax
    // fields inside are admin/owner-only — the API omits them for everyone else.
    transactions?: PropertyDetailTransaction[];
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
    // Assignor company info (present when an Assignment tx sits between the 2 most recent Arms Length txs)
    assignorId?: string | null;
    assignorCompanyName?: string | null;
    assignorContactName?: string | null;
    assignorContactEmail?: string | null;
    assignorContactPhone?: string | null;
    // ARV Finance lender flag
    isFinancedByARV: boolean;
    // Lender name from the display transaction's first mortgage
    lenderName: string | null;
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
    statuses?: string[] | null;
    propertyOwner: string | null;
    companyId: string | null;
    buyerId?: string | null;
    sellerId?: string | null;
};

/** Viewport bounding box sent to the map pin endpoint (Leaflet bounds corners). */
export type MapBoundsParams = {
    south: number;
    west: number;
    north: number;
    east: number;
};

/** Bounding box + count of the qualifying set, returned by /api/properties/map/extent. */
export type MapExtent = {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
    count: number;
};

/** Per-county property count from /api/properties/map/regions (county lower-cased + trimmed). */
export type RegionCount = {
    county: string;
    count: number;
};
