export type PropertyFilters = {
  minPrice: number;
  maxPrice: number; // Use Number.MAX_SAFE_INTEGER for "no limit"
  bedrooms: string;
  bathrooms: string;
  propertyTypes: string[];
  zipCode: string;
  city?: string; // Optional city filter
  county?: string; // Optional county filter
  statusFilters: string[];
}

export type ZipCodeWithCount = {
  zipCode: string;
  count: number;
  city?: string;
}

export type CityWithCount = {
  city: string;
  count: number;
}