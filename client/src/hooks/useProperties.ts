import { useState, useMemo, useRef, useEffect, type RefObject, createContext, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { buildPropertyQueryParams } from "@/lib/propertyQueryParams";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import { useCompanies } from "./useCompanies";
import type { PropertyFilters } from "@/types/filters";
import type { SortOption } from "@/types/options";
import type { Property } from "@/types/property";

type ViewPropertiesValue = {
    properties: Property[];
    propertiesHasMore: boolean;
    isLoadingMoreProperties: boolean;
    loadMorePropertiesRef: RefObject<HTMLDivElement | null>;
    isLoading: boolean;
    isFetching: boolean;
    propertiesResponse: PropertiesResponse | undefined;
    stablePropertyCount: number;
    stableCompanyPropertyCount: number;
}

const PropertiesContext = createContext<ViewPropertiesValue | null>(null)

export type PropertiesResponse = {
    properties: Property[];
    total: number;
    hasMore: boolean;
};

export type UsePropertiesOptions = {
    filters: PropertyFilters;
    view: string;
    sortBy: SortOption;
    selectedCompanyId: string | null;
    /** Count for selected company (from directory); used for stable display count. */
    selectedCompanyPropertyCount?: number;
    hasDateSold?: boolean;
};

export type UsePropertiesResult = {
    /** Accumulated list of properties (for grid/table/wholesale views) */
    properties: Property[];
    propertiesHasMore: boolean;
    isLoadingMoreProperties: boolean;
    loadMorePropertiesRef: RefObject<HTMLDivElement | null>;
    isLoading: boolean;
    isFetching: boolean;
    /** Raw API response (for total count, etc.) */
    propertiesResponse: PropertiesResponse | undefined;
    /** Stable total count (avoids flashing 0 during loading) */
    stablePropertyCount: number;
    /** Stable company count (avoids flashing 0 when refetching) */
    stableCompanyPropertyCount: number;
};

const propertiesListEnabled = (view: string) => view === "grid" || view === "table" || view === "wholesale" || view === "buyers-feed";

/**
 * Fetches and accumulates paginated properties for grid/table/wholesale views.
 * Handles query params, useQuery, accumulation (page 1 replace, page > 1 append/dedupe), and useInfiniteScroll.
 */
export function useProperties({filters, view, sortBy, selectedCompanyId, selectedCompanyPropertyCount = 0, hasDateSold = false}: UsePropertiesOptions): UsePropertiesResult {
    const { company } = useCompanies();
    const [propertiesPage, setPropertiesPage] = useState(1);
    const [allProperties, setAllProperties] = useState<Property[]>([]);
    const [propertiesHasMore, setPropertiesHasMore] = useState(true);
    const [isLoadingMoreProperties, setIsLoadingMoreProperties] = useState(false);
    const [stablePropertyCount, setStablePropertyCount] = useState(0);
    const [stableCompanyPropertyCount, setStableCompanyPropertyCount] = useState(0);
    const loadMorePropertiesRef = useRef<HTMLDivElement>(null);

    // Reset pagination when filters, sort, or company change so we fetch page 1 of the new result set.
    useEffect(() => {
        setPropertiesPage(1);
        setAllProperties([]);
        setPropertiesHasMore(true);
        setIsLoadingMoreProperties(false);
    }, [filters, sortBy, selectedCompanyId, company, view]);

    const propertiesQueryParam = useMemo(() =>
        buildPropertyQueryParams(filters, {
            page: propertiesPage,
            limit: view === "table" ? "20" : "10",
            sortBy,
            selectedCompanyId,
            hasDateSold,
        }), 
        [filters, selectedCompanyId, company, propertiesPage, sortBy, view, hasDateSold]
    );

    const propertiesQueryUrl = useMemo(() => `/api/properties${propertiesQueryParam}`, [propertiesQueryParam]);

    const { data: propertiesResponse, isLoading, isFetching } = useQuery<PropertiesResponse>({
        queryKey: [propertiesQueryUrl],
        queryFn: async () => {
            const res = await fetch(propertiesQueryUrl, { credentials: "include" });
            if (!res.ok) {
                throw new Error(`Failed to fetch properties: ${res.status}`);
            }
            return res.json();
        },
        enabled: view !== "map",
    });

    // Accumulate paginated results: page 1 replaces list, page > 1 appends and dedupes by id.
    useEffect(() => {
        if (!propertiesResponse || !propertiesListEnabled(view)) return;
        if (propertiesPage === 1) {
            setAllProperties(propertiesResponse.properties);
        } else {
            setAllProperties((prev) => {
                const existingIds = new Set(prev.map((p) => p.id));
                const newItems = propertiesResponse.properties.filter((p) => !existingIds.has(p.id));
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

    // Stable counts: avoid flashing "0" during loading; update only when we have data.
    useEffect(() => {
        if (view !== "map" && propertiesResponse?.total !== undefined && !isLoading) {
            setStablePropertyCount(propertiesResponse.total);
        }
    }, [view, propertiesResponse?.total, isLoading]);

    useEffect(() => {
        if (selectedCompanyPropertyCount > 0) {
            setStableCompanyPropertyCount(selectedCompanyPropertyCount);
        } else if (!company) {
            setStableCompanyPropertyCount(0);
        }
    }, [selectedCompanyPropertyCount, company]);

    return {
        properties: allProperties,
        propertiesHasMore,
        isLoadingMoreProperties,
        loadMorePropertiesRef,
        isLoading,
        isFetching,
        propertiesResponse,
        stablePropertyCount,
        stableCompanyPropertyCount,
    };
}
