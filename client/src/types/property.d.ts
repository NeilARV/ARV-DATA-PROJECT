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