import { MAX_PRICE } from '@/constants/filters.constants';
import { DEFAULT_STATUS_FILTERS, PROPERTY_STATUS } from '@/constants/propertyStatus.constants';
import type { PropertyFilters, DateRange } from '@/types/filters';
import type { MapPin, Property } from '@/types/property';
import type { CompanyContactWithCounts } from '@/types/companies';

export type ZipCodeListEntry = { zip: string; city: string };

// ---- Default filters (single source of truth for initial and reset state) ----

/** Default property acquisition date range — the "no date filter applied" baseline. */
export const DEFAULT_DATE_RANGE: DateRange = '90d';

const DEFAULT_FILTERS: PropertyFilters = {
    minPrice: 0,
    maxPrice: MAX_PRICE,
    bedrooms: 'Any',
    bathrooms: 'Any',
    propertyTypes: [],
    zipCode: '',
    city: undefined,
    county: 'San Diego',
    statusFilters: [...DEFAULT_STATUS_FILTERS],
    dateRange: DEFAULT_DATE_RANGE,
};

/**
 * Returns default filter state. Pass overrides to preserve or set specific values (e.g. county on clear, zipCode for leaderboard click).
 */
export function getDefaultFilters(overrides?: Partial<PropertyFilters>): PropertyFilters {
    const defaults: PropertyFilters = {
        ...DEFAULT_FILTERS,
        statusFilters: [...DEFAULT_STATUS_FILTERS],
    };
    return overrides ? { ...defaults, ...overrides } : defaults;
}

// ---- Effective status filters (single source of truth for wholesale / in-renovation) ----

/**
 * Returns the status list to use for filtering (API params and client-side).
 * Wholesale properties always carry both "wholesale" and "in-renovation" in
 * property_statuses, so the backend EXISTS query handles both correctly without
 * any auto-expansion needed here.
 */
export function getEffectiveStatusFilters(
    filters: PropertyFilters,
    _selectedCompanyId: string | null,
): string[] {
    return filters.statusFilters ?? [];
}

// ---- Shared filter dimension helpers ----

export function matchesPrice(item: { price: number | null }, filters: PropertyFilters): boolean {
    if (item.price == null) return true;
    return item.price >= filters.minPrice && item.price <= filters.maxPrice;
}

export function matchesBedrooms(item: { bedrooms: number }, filters: PropertyFilters): boolean {
    if (filters.bedrooms === 'Any') return true;
    const minBeds = parseInt(filters.bedrooms.replace('+', ''), 10);
    return item.bedrooms >= minBeds;
}

export function matchesBathrooms(item: { bathrooms: number }, filters: PropertyFilters): boolean {
    if (filters.bathrooms === 'Any') return true;
    const minBaths = parseInt(filters.bathrooms.replace('+', ''), 10);
    return item.bathrooms >= minBaths;
}

export function matchesPropertyType(
    item: { propertyType: string },
    filters: PropertyFilters,
): boolean {
    if (filters.propertyTypes.length === 0) return true;
    return filters.propertyTypes.includes(item.propertyType);
}

/**
 * Returns whether a city value (e.g. from data) matches the selected filter city.
 * San Diego / Los Angeles use startsWith; other cities use exact match.
 */
export function cityMatchesFilter(filterCity: string, cityFromData: string): boolean {
    const filter = filterCity.trim();
    const city = cityFromData.trim();
    if (filter === 'San Diego') return city.startsWith('San Diego');
    if (filter === 'Los Angeles') return city.startsWith('Los Angeles') || city === 'Los Angeles';
    return city === filter;
}

/**
 * Returns zip codes that match the city filter (for San Diego / Los Angeles, uses startsWith).
 */
export function getCityZipCodesForFilter(
    city: string | undefined,
    zipCodeList: ZipCodeListEntry[],
): string[] {
    if (!city || city.trim() === '') return [];
    return zipCodeList.filter((z) => cityMatchesFilter(city, z.city)).map((z) => z.zip);
}

export function matchesLocation(
    itemZipCode: string,
    filters: PropertyFilters,
    zipCodeList: ZipCodeListEntry[],
): boolean {
    if (filters.city && filters.city.trim() !== '') {
        const cityZipCodes = getCityZipCodesForFilter(filters.city, zipCodeList);
        return cityZipCodes.includes(itemZipCode);
    }
    if (filters.zipCode && filters.zipCode.trim() !== '') {
        return itemZipCode === filters.zipCode.trim();
    }
    return true;
}

/** Item must have status and optional buyerId/sellerId for wholesale special case. */
export function matchesStatusWithWholesale(
    item: {
        status: string | null;
        statuses?: string[] | null;
        buyerId?: string | null;
        sellerId?: string | null;
    },
    filters: PropertyFilters,
    selectedCompanyId: string | null,
): boolean {
    const effective = getEffectiveStatusFilters(filters, selectedCompanyId);
    if (effective.length === 0) return true;

    // Use statuses[] array when available (multi-status), fall back to single status string
    const itemStatuses =
        item.statuses && item.statuses.length > 0
            ? item.statuses.map((s) => s.toLowerCase().trim())
            : [(item.status || PROPERTY_STATUS.IN_RENOVATION).toLowerCase().trim()];
    const normalizedEffective = effective.map((s) => s.toLowerCase().trim());

    if (!itemStatuses.some((s) => normalizedEffective.includes(s))) return false;

    // Exception: wholesale property where company is seller - only show if wholesale is explicitly in filters
    if (
        itemStatuses.includes(PROPERTY_STATUS.WHOLESALE) &&
        selectedCompanyId &&
        item.sellerId === selectedCompanyId
    ) {
        const wholesaleInFilters = filters.statusFilters
            .map((f) => f.toLowerCase().trim())
            .includes(PROPERTY_STATUS.WHOLESALE);
        if (!wholesaleInFilters) return false;
    }
    return true;
}

// ---- Company matching (different for pin vs full property) ----

export function matchesCompanyForPin(
    pin: MapPin,
    selectedCompanyId: string | null,
    selectedCompany: string | null,
): boolean {
    if (selectedCompanyId) {
        const bid = pin.buyerId ?? null;
        const sid = pin.sellerId ?? null;
        const propertyStatus = (pin.status || PROPERTY_STATUS.IN_RENOVATION).toLowerCase().trim();
        // in-renovation: only buyer; on-market: only seller; sold/wholesale/other: buyer or seller
        const isRelevant =
            propertyStatus === PROPERTY_STATUS.IN_RENOVATION
                ? bid === selectedCompanyId
                : propertyStatus === PROPERTY_STATUS.ON_MARKET
                  ? sid === selectedCompanyId
                  : bid === selectedCompanyId || sid === selectedCompanyId;
        return isRelevant;
    }
    if (selectedCompany) {
        const ownerName = (pin.propertyOwner ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
        const selectedName = selectedCompany.trim().toLowerCase().replace(/\s+/g, ' ');
        return ownerName === selectedName;
    }
    return true;
}

export function matchesCompanyForProperty(
    property: Property,
    selectedCompanyId: string | null,
    selectedCompany: string | null,
): boolean {
    if (selectedCompanyId) {
        const bid = property.buyerId ?? null;
        const sid = property.sellerId ?? null;
        const aid = property.assignorId ?? null;
        return bid === selectedCompanyId || sid === selectedCompanyId || aid === selectedCompanyId;
    }
    if (selectedCompany) {
        const companyName = (property.companyName || property.propertyOwner || '')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, ' ');
        const selectedName = selectedCompany.trim().toLowerCase().replace(/\s+/g, ' ');
        return companyName === selectedName;
    }
    return true;
}

// ---- Full filter match (combine all dimensions) ----

export function matchesFiltersForPin(
    pin: MapPin,
    zipCodeList: ZipCodeListEntry[],
    filters: PropertyFilters,
    company: CompanyContactWithCounts | null,
): boolean {
    if (!matchesCompanyForPin(pin, company?.id ?? null, company?.companyName ?? null)) return false;
    if (!matchesPrice(pin, filters)) return false;
    if (!matchesBedrooms(pin, filters)) return false;
    if (!matchesBathrooms(pin, filters)) return false;
    if (!matchesPropertyType(pin, filters)) return false;
    if (!matchesLocation(pin.zipcode, filters, zipCodeList)) return false;
    if (!matchesStatusWithWholesale(pin, filters, company?.id ?? null)) return false;
    return true;
}

export function matchesFiltersForProperty(
    property: Property,
    zipCodeList: ZipCodeListEntry[],
    filters: PropertyFilters,
    company: CompanyContactWithCounts | null,
): boolean {
    if (!matchesCompanyForProperty(property, company?.id ?? null, company?.companyName ?? null))
        return false;
    if (!matchesPrice(property, filters)) return false;
    if (!matchesBedrooms(property, filters)) return false;
    if (!matchesBathrooms(property, filters)) return false;
    if (!matchesPropertyType(property, filters)) return false;
    if (!matchesLocation(property.zipCode, filters, zipCodeList)) return false;
    if (!matchesStatusWithWholesale(property, filters, company?.id ?? null)) return false;
    return true;
}
