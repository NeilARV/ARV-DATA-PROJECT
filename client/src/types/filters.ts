/** One MSA plus the selected subset of its counties ([] = none selected → no properties). */
export type MsaCountySelection = {
    msa: string;
    counties: string[];
};

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
    dateRange?: DateRange; // Property acquisition date-range filter
    companyRole?: 'buyer' | 'seller'; // Set on company selection; restricts tx role match in API
};

export type DateRange = '30d' | '60d' | '90d' | '180d' | '1y' | 'ytd' | 'all-time';
