import { MAX_PRICE } from '@/constants/filters.constants';
import type { PropertyFilters } from '@/types/filters';
import type { SortOption } from '@/types/options';
import { getEffectiveStatusFilters } from '@/lib/propertyFilters';
import type { CompanyContactWithCounts } from '@/types/companies';
import type { MapBoundsParams } from '@/types/property';

export type BuildPropertyQueryParamsOptions = {
    /** When true, only county + status + location + company + attribute filters are included (map pins). */
    forMapPins?: boolean;
    /**
     * When true, only status + date + attribute filters are included (for the cross-region overview
     * endpoint, which ignores county/company/location so every region is counted). Takes precedence
     * over forMapPins.
     */
    forRegions?: boolean;
    /** Viewport box appended to the map pins request (forMapPins only); omit to fetch unbounded. */
    bounds?: MapBoundsParams;
    /** When true, append hasDateSold=true (for buyers feed). */
    hasDateSold?: boolean;
    /** Page number — appended only for the full list/feed query (omit for map/region variants). */
    page?: number;
    /** Page size — appended only for the full list/feed query (omit for map/region variants). */
    limit?: string;
};

export type BuildPropertyQueryParamsContext = {
    company: CompanyContactWithCounts | null;
    sortBy: SortOption;
};

/** "?key=value&..." for a populated param set, or "" when empty. */
function toQueryString(params: URLSearchParams): string {
    const queryString = params.toString();
    return queryString ? `?${queryString}` : '';
}

/** Appends zip-code + city location filters (shared by the map-pin and full-list queries). */
function appendLocation(params: URLSearchParams, filters: PropertyFilters): void {
    if (filters.zipCode && filters.zipCode.trim() !== '') {
        params.append('zipcode', filters.zipCode.trim());
    }
    if (filters.city && filters.city.trim() !== '') {
        params.append('city', filters.city.trim());
    }
}

/** Appends price/beds/baths/type attribute filters (shared by map-pin, region, and full-list queries). */
function appendAttributes(params: URLSearchParams, filters: PropertyFilters): void {
    if (filters.minPrice > 0) {
        params.append('minPrice', filters.minPrice.toString());
    }
    if (filters.maxPrice < MAX_PRICE) {
        params.append('maxPrice', filters.maxPrice.toString());
    }
    if (filters.bedrooms && filters.bedrooms !== 'Any') {
        params.append('bedrooms', filters.bedrooms.replace('+', ''));
    }
    if (filters.bathrooms && filters.bathrooms !== 'Any') {
        params.append('bathrooms', filters.bathrooms.replace('+', ''));
    }
    if (filters.propertyTypes && filters.propertyTypes.length > 0) {
        filters.propertyTypes.forEach((type) => params.append('propertyType', type));
    }
}

/** Appends the selected company (id + role, or fallback name) shared by map-pin and full-list queries. */
function appendCompany(
    params: URLSearchParams,
    company: CompanyContactWithCounts | null,
    filters: PropertyFilters,
): void {
    if (company?.id) {
        params.append('companyId', company.id);
        if (filters.companyRole) {
            params.append('companyRole', filters.companyRole);
        }
    } else if (company?.companyName) {
        params.append('company', company.companyName);
    }
}

/**
 * Builds query string for properties API from filters and options.
 * Returns "" when no params, or "?key=value&..." when there are params.
 * Use forMapPins for /api/properties/map (county + status + location + company + attributes).
 * Use forRegions for /api/properties/map/regions (status + date + attributes only).
 * Use hasDateSold for buyers feed.
 */
export function buildPropertyQueryParams(
    filters: PropertyFilters,
    options: BuildPropertyQueryParamsOptions,
    context: BuildPropertyQueryParamsContext,
): string {
    const {
        forMapPins = false,
        forRegions = false,
        bounds,
        hasDateSold = false,
        page,
        limit,
    } = options;

    const { company, sortBy } = context;

    const params = new URLSearchParams();

    // Status filters (effective list includes wholesale when in-renovation selected and no company)
    const effectiveStatuses = getEffectiveStatusFilters(filters, company?.id ?? null);

    // Region overview: status + date + attributes (cross-region — county/company/location ignored).
    if (forRegions) {
        effectiveStatuses.forEach((status) => params.append('status', status));
        if (filters.dateRange) {
            params.append('dateRange', filters.dateRange);
        }
        appendAttributes(params, filters);
        return toQueryString(params);
    }

    // County set scoped to one MSA — the server intersects the counties with the MSA's
    // tracked list, so msa with no county params means "none selected" (no properties).
    if (filters.msa) {
        params.append('msa', filters.msa);
        filters.counties.forEach((county) => params.append('county', county));
    }

    effectiveStatuses.forEach((status) => params.append('status', status));

    // Map pins: county + status + location + company + attributes + viewport box.
    if (forMapPins) {
        appendLocation(params, filters);
        appendCompany(params, company, filters);
        if (filters.dateRange) {
            params.append('dateRange', filters.dateRange);
        }
        appendAttributes(params, filters);
        // Viewport box — present for the pin request, omitted for the extent request.
        if (bounds) {
            params.append('south', bounds.south.toString());
            params.append('west', bounds.west.toString());
            params.append('north', bounds.north.toString());
            params.append('east', bounds.east.toString());
        }
        return toQueryString(params);
    }

    // Full filters for properties list / buyers feed
    appendLocation(params, filters);
    appendAttributes(params, filters);
    appendCompany(params, company, filters);

    if (hasDateSold) {
        params.append('hasDateSold', 'true');
    }

    if (filters.dateRange) {
        params.append('dateRange', filters.dateRange);
    }

    if (page !== undefined) {
        params.append('page', page.toString());
    }
    if (limit !== undefined) {
        params.append('limit', limit);
    }
    params.append('sortBy', sortBy);

    return toQueryString(params);
}
