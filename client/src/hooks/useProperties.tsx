import {
    useState,
    useEffect,
    createContext,
    useRef,
    useContext,
    ReactNode,
    useMemo,
    type RefObject,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { buildPropertyQueryParams } from '@/lib/propertyQueryParams';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useCompanies } from './useCompanies';
import { useFilters } from './useFilters';
import { useView } from './useView';
import type { Property } from '@/types/property';

export type PropertiesResponse = {
    properties: Property[];
    total: number | null; // null when server skips COUNT (page > 1); use stablePropertyCount instead
    hasMore: boolean;
};

type PropertiesContextValue = {
    properties: Property[];
    propertiesHasMore: boolean;
    isLoadingMoreProperties: boolean;
    loadMorePropertiesRef: RefObject<HTMLDivElement | null>;
    isLoading: boolean;
    isFetching: boolean;
    propertiesResponse: PropertiesResponse | undefined;
    totalProperties: number;
    stablePropertyCount: number;
    stableCompanyPropertyCount: number;
};

const PropertiesContext = createContext<PropertiesContextValue | null>(null);

type PropertiesProviderProps = {
    children: ReactNode;
};

const propertiesListEnabled = (view: string) =>
    view === 'grid' || view === 'table' || view === 'wholesale' || view === 'buyers-feed';

export function PropertiesProvider({ children }: PropertiesProviderProps) {
    const { company } = useCompanies();
    const { view } = useView();
    const { filters, sortBy } = useFilters();
    const [propertiesPage, setPropertiesPage] = useState(1);
    const [allProperties, setAllProperties] = useState<Property[]>([]);
    const [propertiesHasMore, setPropertiesHasMore] = useState(true);
    const [isLoadingMoreProperties, setIsLoadingMoreProperties] = useState(false);
    const [stablePropertyCount, setStablePropertyCount] = useState(0);
    const [stableCompanyPropertyCount, setStableCompanyPropertyCount] = useState(0);
    const loadMorePropertiesRef = useRef<HTMLDivElement>(null);
    const hasDateSold = view === 'buyers-feed';

    // Reset pagination when filters, sort, or company ID change so we fetch page 1 of the new result set.
    // Intentionally uses company?.id (not company object) so that enriching a stub company (same id,
    // different object reference) after fetchCompanyById does not reset allProperties and blank the grid.
    useEffect(() => {
        setPropertiesPage(1);
        setAllProperties([]);
        setPropertiesHasMore(true);
        setIsLoadingMoreProperties(false);
    }, [filters, sortBy, company?.id, view]);

    const propertiesQueryParam = useMemo(
        () => {
            const base = buildPropertyQueryParams(
                filters,
                {
                    page: propertiesPage,
                    limit: view === 'table' ? '20' : '10',
                    hasDateSold,
                },
                { company, sortBy },
            );
            // Skip COUNT query on pages after the first — we already have the total cached
            if (propertiesPage > 1) {
                const sep = base.includes('?') ? '&' : '?';
                return `${base}${sep}skipCount=true`;
            }
            return base;
        },
        // Intentionally uses company?.id (not company object) — same reason as the reset effect above.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [filters, company?.id, propertiesPage, sortBy, view, hasDateSold],
    );

    const propertiesQueryUrl = useMemo(
        () => `/api/properties${propertiesQueryParam}`,
        [propertiesQueryParam],
    );

    const {
        data: propertiesResponse,
        isLoading,
        isFetching,
    } = useQuery<PropertiesResponse>({
        queryKey: [propertiesQueryUrl],
        queryFn: async () => {
            const res = await fetch(propertiesQueryUrl, { credentials: 'include' });
            if (!res.ok) {
                throw new Error(`Failed to fetch properties: ${res.status}`);
            }
            return res.json();
        },
        enabled: view !== 'map',
        staleTime: 5 * 60 * 1000,
    });

    const totalProperties = useMemo(() => {
        if (view === 'map') return 0;
        const propertiesTotal = propertiesResponse?.total;
        return isLoading && propertiesTotal === undefined
            ? stablePropertyCount
            : (propertiesTotal ?? stablePropertyCount);
    }, [view, propertiesResponse, isLoading, stablePropertyCount]);

    // Accumulate paginated results: page 1 replaces list, page > 1 appends and dedupes by id.
    useEffect(() => {
        if (!propertiesResponse || !propertiesListEnabled(view)) return;
        if (propertiesPage === 1) {
            setAllProperties(propertiesResponse.properties);
        } else {
            setAllProperties((prev) => {
                const existingIds = new Set(prev.map((p) => p.id));
                const newItems = propertiesResponse.properties.filter(
                    (p) => !existingIds.has(p.id),
                );
                return [...prev, ...newItems];
            });
        }
        setPropertiesHasMore(propertiesResponse.hasMore);
        setIsLoadingMoreProperties(false);
    }, [propertiesResponse, propertiesPage, view]);

    useInfiniteScroll({
        ref: loadMorePropertiesRef,
        hasMore: propertiesHasMore,
        loading: isLoadingMoreProperties,
        isFetching,
        onLoadMore: () => {
            setIsLoadingMoreProperties(true);
            setPropertiesPage((prev) => prev + 1);
        },
        enabled: propertiesListEnabled(view),
        useScrollableRoot: true,
        deps: [allProperties.length],
    });

    // Stable counts: avoid flashing "0" during loading; update only when we have a real total.
    // null means server skipped COUNT (page > 1) — keep the existing cached count in that case.
    useEffect(() => {
        if (view !== 'map' && propertiesResponse?.total != null && !isLoading) {
            setStablePropertyCount(propertiesResponse.total);
        }
    }, [view, propertiesResponse?.total, isLoading]);

    useEffect(() => {
        if (company && company.propertyCount > 0) {
            setStableCompanyPropertyCount(company.propertyCount);
        } else if (!company) {
            setStableCompanyPropertyCount(0);
        }
    }, [company]);

    const value = {
        properties: allProperties,
        propertiesHasMore,
        isLoadingMoreProperties,
        loadMorePropertiesRef,
        isLoading,
        isFetching,
        propertiesResponse,
        totalProperties,
        stablePropertyCount,
        stableCompanyPropertyCount,
    };

    return <PropertiesContext.Provider value={value}>{children}</PropertiesContext.Provider>;
}

export function useProperties(): PropertiesContextValue {
    const ctx = useContext(PropertiesContext);

    if (!ctx) {
        throw new Error(`Trouble getting property`);
    }

    return ctx;
}
