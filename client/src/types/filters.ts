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
    dateRange?: DateRange; // Shared ambient global (shared/types/filters.d.ts); imported explicitly in the shared phase
    companyRole?: 'buyer' | 'seller'; // Set on company selection; restricts tx role match in API
};
