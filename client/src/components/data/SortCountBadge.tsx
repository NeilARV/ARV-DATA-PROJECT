import type { DirectorySortOption } from '@/types/options';

/**
 * The per-sort activity counts a directory card can display. A superset holder such as
 * CompanyContactWithCounts satisfies this structurally.
 */
export type SortCounts = {
    propertyCount: number;
    propertiesSoldCount?: number | null;
    propertiesSoldCountAllTime?: number | null;
    propertiesBoughtCount?: number | null;
    propertiesBoughtCountAllTime?: number | null;
    wholesaleBuyCount?: number | null;
    wholesalerCount?: number | null;
};

// Per-sort categorical badge colors, moved verbatim from the original inline company-card markup;
// preserved as-is by this prefactor (not among the sanctioned color tokens).
const TONE_CLASSES = {
    primary: 'text-primary bg-primary/10',
    red: 'text-red-600 bg-red-500/15 dark:text-red-400 dark:bg-red-500/20',
    green: 'text-green-600 bg-green-500/15 dark:text-green-400 dark:bg-green-500/20',
    purple: 'text-purple-600 bg-purple-500/15 dark:text-purple-400 dark:bg-purple-500/20',
} as const;

type BadgeSpec = {
    count: number;
    label: string;
    tone: keyof typeof TONE_CLASSES;
    testId: string;
};

/** Picks the single count badge for the active sort, or null when that sort's count is zero. */
function selectBadge(sortBy: DirectorySortOption, counts: SortCounts): BadgeSpec | null {
    switch (sortBy) {
        case 'most-sold-properties': {
            const count = counts.propertiesSoldCount ?? 0;
            return count > 0
                ? { count, label: 'sold', tone: 'red', testId: 'text-sold-count' }
                : null;
        }
        case 'most-sold-properties-all-time': {
            const count = counts.propertiesSoldCountAllTime ?? 0;
            return count > 0
                ? { count, label: 'sold', tone: 'red', testId: 'text-sold-count-all-time' }
                : null;
        }
        case 'most-bought-properties': {
            const count = counts.propertiesBoughtCount ?? 0;
            return count > 0
                ? { count, label: 'bought', tone: 'green', testId: 'text-bought-count' }
                : null;
        }
        case 'most-bought-properties-all-time': {
            const count = counts.propertiesBoughtCountAllTime ?? 0;
            return count > 0
                ? { count, label: 'bought', tone: 'green', testId: 'text-bought-count-all-time' }
                : null;
        }
        case 'buys-wholesale': {
            const count = counts.wholesaleBuyCount ?? 0;
            return count > 0
                ? { count, label: 'wholesale', tone: 'purple', testId: 'text-wholesale-buy-count' }
                : null;
        }
        case 'wholesalers': {
            const count = counts.wholesalerCount ?? 0;
            return count > 0
                ? { count, label: 'wholesales', tone: 'purple', testId: 'text-wholesaler-count' }
                : null;
        }
        default: {
            // most-properties and new-buyers show the raw property-count pill.
            const count = counts.propertyCount;
            return count > 0
                ? {
                      count,
                      label: count === 1 ? 'property' : 'properties',
                      tone: 'primary',
                      testId: 'text-property-count',
                  }
                : null;
        }
    }
}

type SortCountBadgeProps = { sortBy: DirectorySortOption; counts: SortCounts };

/**
 * The colored count pill for the active directory sort (e.g. "12 sold"), or nothing when that sort's count is zero.
 */
export function SortCountBadge({ sortBy, counts }: SortCountBadgeProps) {
    const spec = selectBadge(sortBy, counts);
    if (!spec) return null;
    return (
        <div
            className={`text-xs font-medium ${TONE_CLASSES[spec.tone]} px-2 py-0.5 rounded-full whitespace-nowrap`}
            data-testid={spec.testId}
        >
            {spec.count} {spec.label}
        </div>
    );
}
