import {
    createContext,
    useContext,
    useMemo,
    useRef,
    type ReactNode,
    type RefObject,
} from 'react';
import { useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
import { buildPropertyQueryParams } from '@/lib/propertyQueryParams';
import { apiRequest } from '@/lib/queryClient';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useCompanies } from './useCompanies';
import { useFilters } from './useFilters';
import { useView } from './useView';
import { useAuth } from './use-auth';
import type { Property } from '@/types/property';

export type PropertiesResponse = {
    properties: Property[];
    total: number | null; // null when the server skips COUNT (page > 1); page 1 carries the total
    hasMore: boolean;
};

type PropertiesContextValue = {
    properties: Property[];
    propertiesHasMore: boolean;
    isLoadingMoreProperties: boolean;
    loadMorePropertiesRef: RefObject<HTMLDivElement | null>;
    isLoading: boolean;
    isFetching: boolean;
    totalProperties: number;
    stablePropertyCount: number;
};

const PropertiesContext = createContext<PropertiesContextValue | null>(null);

type PropertiesProviderProps = {
    children: ReactNode;
};

/** Views that render the paginated property list (everything except the map). */
function isPropertiesListView(view: string): boolean {
    return view === 'grid' || view === 'table' || view === 'wholesale' || view === 'buyers-feed';
}

/**
 * Provides the paginated, filterable property list. Backed entirely by TanStack Query's
 * infinite query — the list, page accumulation, and total count all derive from the query
 * cache, so no server data is mirrored into local state. The query is disabled in map view
 * and for users without app access (the server enforces the same gate).
 */
export function PropertiesProvider({ children }: PropertiesProviderProps): JSX.Element {
    const { company } = useCompanies();
    const { view } = useView();
    const { filters, sortBy } = useFilters();
    // Feeds/table are app-access gated (server enforces too); don't fire the list query for
    // users without access — the map and directory remain public.
    const { canAccessApp } = useAuth();
    const loadMorePropertiesRef = useRef<HTMLDivElement>(null);

    const hasDateSold = view === 'buyers-feed';
    const limit = view === 'table' ? '20' : '10';
    const isListView = isPropertiesListView(view);
    // Key on company?.id (not the company object) so enriching a stub company (same id, new object
    // reference) after fetchCompanyById does not restart the query and blank the grid.
    const companyId = company?.id ?? null;

    const { data, isLoading, isFetching, isFetchingNextPage, hasNextPage, fetchNextPage } =
        useInfiniteQuery({
            queryKey: ['/api/properties', { filters, sortBy, companyId, view, hasDateSold, limit }],
            queryFn: async ({ pageParam }): Promise<PropertiesResponse> => {
                const base = buildPropertyQueryParams(
                    filters,
                    { page: pageParam, limit, hasDateSold },
                    { company, sortBy },
                );
                // Skip the COUNT query after page 1 — page 1's total covers the whole result set.
                const url =
                    pageParam > 1
                        ? `/api/properties${base}${base.includes('?') ? '&' : '?'}skipCount=true`
                        : `/api/properties${base}`;
                const res = await apiRequest('GET', url);
                return res.json();
            },
            initialPageParam: 1,
            getNextPageParam: (lastPage, allPages) =>
                lastPage.hasMore ? allPages.length + 1 : undefined,
            enabled: isListView && canAccessApp,
            staleTime: 5 * 60 * 1000,
            // Retain the previous result set while a new filter/sort/company query loads so the grid
            // and count don't flash empty between changes.
            placeholderData: keepPreviousData,
        });

    // Flatten the paginated results into one list, deduping by id (page boundaries can overlap).
    const properties = useMemo(() => {
        const seen = new Set<string>();
        const result: Property[] = [];
        for (const page of data?.pages ?? []) {
            for (const property of page.properties) {
                if (!seen.has(property.id)) {
                    seen.add(property.id);
                    result.push(property);
                }
            }
        }
        return result;
    }, [data]);

    // Page 1 carries the COUNT; later pages report null. keepPreviousData retains the previous
    // page-1 total during a refetch, so the count stays stable across filter changes.
    const total = data?.pages[0]?.total ?? null;
    const totalProperties = view === 'map' ? 0 : (total ?? 0);

    useInfiniteScroll({
        ref: loadMorePropertiesRef,
        hasMore: hasNextPage,
        loading: isFetchingNextPage,
        isFetching,
        onLoadMore: () => {
            void fetchNextPage();
        },
        enabled: isListView,
        useScrollableRoot: true,
        deps: [properties.length],
    });

    const value = {
        properties,
        propertiesHasMore: hasNextPage,
        isLoadingMoreProperties: isFetchingNextPage,
        loadMorePropertiesRef,
        isLoading,
        isFetching,
        totalProperties,
        // keepPreviousData already holds the prior total during a refetch, so the stable count is
        // simply the current total; kept as a named field for the count-display consumers.
        stablePropertyCount: totalProperties,
    };

    return <PropertiesContext.Provider value={value}>{children}</PropertiesContext.Provider>;
}

/**
 * Access the property-list context.
 * @returns the properties context value (list, counts, loading flags, infinite-scroll ref).
 * @throws if used outside a PropertiesProvider.
 */
export function useProperties(): PropertiesContextValue {
    const ctx = useContext(PropertiesContext);

    if (!ctx) {
        throw new Error('useProperties must be used within a PropertiesProvider');
    }

    return ctx;
}
