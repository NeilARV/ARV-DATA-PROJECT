import type { DirectorySortOption } from '@/types/options';
import type { PropertyStatus as Status } from '@shared/types/properties';

/** Property status string constants - use these instead of magic strings. */
export const PROPERTY_STATUS = {
    IN_RENOVATION: 'in-renovation',
    WHOLESALE: 'wholesale',
    ON_MARKET: 'on-market',
    SOLD: 'sold',
} as const satisfies Record<string, Status>;

export type PropertyStatusValue = (typeof PROPERTY_STATUS)[keyof typeof PROPERTY_STATUS];

/** Default status filter (single status). */
export const DEFAULT_STATUS_FILTERS: Status[] = [PROPERTY_STATUS.IN_RENOVATION];

/** Status filters when opening leaderboard zip (in-renovation, sold). */
export const LEADERBOARD_ZIP_STATUS_FILTERS: Status[] = [
    PROPERTY_STATUS.IN_RENOVATION,
    // PROPERTY_STATUS.ON_MARKET, // removed: on-market data unreliable
    PROPERTY_STATUS.SOLD,
];

/** Status filters for buyers feed view. */
export const BUYERS_FEED_STATUS_FILTERS: Status[] = [
    PROPERTY_STATUS.WHOLESALE,
    PROPERTY_STATUS.IN_RENOVATION,
    // PROPERTY_STATUS.ON_MARKET, // removed: on-market data unreliable
];

/** Status filter for wholesale-only view. */
export const WHOLESALE_VIEW_STATUS_FILTERS: Status[] = [PROPERTY_STATUS.WHOLESALE];

/** All status filters (e.g. when a company is selected in directory). */
export const ALL_STATUS_FILTERS: Status[] = [
    PROPERTY_STATUS.IN_RENOVATION,
    PROPERTY_STATUS.WHOLESALE,
    // PROPERTY_STATUS.ON_MARKET, // removed: on-market data unreliable
    PROPERTY_STATUS.SOLD,
];

/** Status filters and optional transaction-role restriction applied per directory sort when a company is selected. */
export const COMPANY_DIRECTORY_SORT_FILTERS: Record<
    DirectorySortOption,
    { statusFilters: Status[]; companyRole?: 'buyer' | 'seller' }
> = {
    'most-properties': { statusFilters: [PROPERTY_STATUS.IN_RENOVATION] },
    'most-sold-properties': { statusFilters: [PROPERTY_STATUS.SOLD] },
    'most-sold-properties-all-time': { statusFilters: [PROPERTY_STATUS.SOLD] },
    'most-bought-properties': { statusFilters: [PROPERTY_STATUS.IN_RENOVATION] },
    'most-bought-properties-all-time': { statusFilters: [PROPERTY_STATUS.IN_RENOVATION] },
    'buys-wholesale': {
        statusFilters: [PROPERTY_STATUS.WHOLESALE, PROPERTY_STATUS.IN_RENOVATION],
        companyRole: 'buyer',
    },
    wholesalers: { statusFilters: [PROPERTY_STATUS.WHOLESALE], companyRole: 'seller' },
    'new-buyers': { statusFilters: [PROPERTY_STATUS.IN_RENOVATION] },
};
