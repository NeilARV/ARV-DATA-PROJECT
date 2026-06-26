import { MAX_PRICE } from '@/constants/filters.constants';
import type { PropertyFilters } from '@/types/filters';
import type { SortOption } from '@/types/options';
import { getEffectiveStatusFilters } from '@/lib/propertyFilters';
import type { CompanyContactWithCounts } from '@/types/companies';
import type { MapBoundsParams } from '@/types/property';

export type BuildPropertyQueryParamsOptions = {
    /** When true, only county and status filters are included (for map pins endpoint). */
    forMapPins?: boolean;
    /** Viewport box appended to the map pins request (forMapPins only); omit to fetch unbounded. */
    bounds?: MapBoundsParams;
    /** When true, append hasDateSold=true (for buyers feed). */
    hasDateSold?: boolean;
    page: number;
    limit: string;
};

export type BuildPropertyQueryParamsContext = {
    company: CompanyContactWithCounts | null;
    sortBy: SortOption;
};

/**
 * Builds query string for properties API from filters and options.
 * Returns "" when no params, or "?key=value&..." when there are params.
 * Use forMapPins for /api/properties/map (county + status only).
 * Use hasDateSold for buyers feed.
 */
export function buildPropertyQueryParams(
    filters: PropertyFilters,
    options: BuildPropertyQueryParamsOptions,
    context: BuildPropertyQueryParamsContext,
): string {
    const { forMapPins = false, bounds, hasDateSold = false, page, limit } = options;

    const { company, sortBy } = context;

    const params = new URLSearchParams();

    // County filter
    if (filters.county) {
        params.append('county', filters.county);
    }

    // Status filters (effective list includes wholesale when in-renovation selected and no company)
    const effectiveStatuses = getEffectiveStatusFilters(filters, company?.id ?? null);
    effectiveStatuses.forEach((status) => params.append('status', status));

    // Map pins: county + status + location + company (so the server returns only matching pins)
    if (forMapPins) {
        if (filters.zipCode && filters.zipCode.trim() !== '') {
            params.append('zipcode', filters.zipCode.trim());
        }
        if (filters.city && filters.city.trim() !== '') {
            params.append('city', filters.city.trim());
        }
        if (company?.id) {
            params.append('companyId', company.id);
            if (filters.companyRole) {
                params.append('companyRole', filters.companyRole);
            }
        } else if (company?.companyName) {
            params.append('company', company.companyName);
        }
        if (filters.dateRange) {
            params.append('dateRange', filters.dateRange);
        }
        // Viewport box — present for the pin request, omitted for the extent request.
        if (bounds) {
            params.append('south', bounds.south.toString());
            params.append('west', bounds.west.toString());
            params.append('north', bounds.north.toString());
            params.append('east', bounds.east.toString());
        }
        const queryString = params.toString();
        return queryString ? `?${queryString}` : '';
    }

    // Full filters for properties list / buyers feed
    if (filters.zipCode && filters.zipCode.trim() !== '') {
        params.append('zipcode', filters.zipCode.trim());
    }
    if (filters.city && filters.city.trim() !== '') {
        params.append('city', filters.city.trim());
    }
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

    if (company?.id) {
        params.append('companyId', company.id);
        if (filters.companyRole) {
            params.append('companyRole', filters.companyRole);
        }
    } else if (company?.companyName) {
        params.append('company', company.companyName);
    }

    if (hasDateSold) {
        params.append('hasDateSold', 'true');
    }

    if (filters.dateRange) {
        params.append('dateRange', filters.dateRange);
    }

    params.append('page', page.toString());
    params.append('limit', limit);
    params.append('sortBy', sortBy);

    const queryString = params.toString();
    return queryString ? `?${queryString}` : '';
}
