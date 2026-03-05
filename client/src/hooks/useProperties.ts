import { useState, useMemo, useRef, useEffect, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import { buildPropertyQueryParams } from "@/lib/propertyQueryParams";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import type { PropertyFilters } from "@/types/filters";
import type { SortOption } from "@/types/options";
import type { Property } from "@/types/property";

export type PropertiesResponse = {
    properties: Property[];
    total: number;
    hasMore: boolean;
};

export type UsePropertiesOptions = {
    filters: PropertyFilters;
    viewMode: string;
    sortBy: SortOption;
    selectedCompanyId: string | null;
    selectedCompany: string | null;
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
};

const propertiesListEnabled = (viewMode: string) => viewMode === "grid" || viewMode === "table" || viewMode === "wholesale" || viewMode === "buyers-feed";

/**
 * Fetches and accumulates paginated properties for grid/table/wholesale views.
 * Handles query params, useQuery, accumulation (page 1 replace, page > 1 append/dedupe), and useInfiniteScroll.
 */
export function useProperties({filters, viewMode, sortBy, selectedCompanyId, selectedCompany, hasDateSold = false}: UsePropertiesOptions): UsePropertiesResult {
    const [propertiesPage, setPropertiesPage] = useState(1);
    const [allProperties, setAllProperties] = useState<Property[]>([]);
    const [propertiesHasMore, setPropertiesHasMore] = useState(true);
    const [isLoadingMoreProperties, setIsLoadingMoreProperties] = useState(false);
    const loadMorePropertiesRef = useRef<HTMLDivElement>(null);

    // Reset pagination when filters, sort, or company change so we fetch page 1 of the new result set.
    useEffect(() => {
        setPropertiesPage(1);
        setAllProperties([]);
        setPropertiesHasMore(true);
        setIsLoadingMoreProperties(false);
    }, [filters, sortBy, selectedCompanyId, selectedCompany, viewMode]);

    const propertiesQueryParam = useMemo(() =>
        buildPropertyQueryParams(filters, {
            page: propertiesPage,
            limit: viewMode === "table" ? "20" : "10",
            sortBy,
            selectedCompanyId,
            selectedCompany,
            hasDateSold,
        }), 
        [filters, selectedCompanyId, selectedCompany, propertiesPage, sortBy, viewMode, hasDateSold]
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
        enabled: viewMode !== "map",
    });

    // Accumulate paginated results: page 1 replaces list, page > 1 appends and dedupes by id.
    useEffect(() => {
        if (!propertiesResponse || !propertiesListEnabled(viewMode)) return;
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
    }, [propertiesResponse, propertiesPage, viewMode]);

    useInfiniteScroll({
        ref: loadMorePropertiesRef,
        hasMore: propertiesHasMore,
        loading: isLoadingMoreProperties,
        isFetching,
        onLoadMore: () => {
            setIsLoadingMoreProperties(true);
            setPropertiesPage((prev) => prev + 1);
        },
        enabled: propertiesListEnabled(viewMode),
        useScrollableRoot: true,
        deps: [allProperties.length],
    });

    return {
        properties: allProperties,
        propertiesHasMore,
        isLoadingMoreProperties,
        loadMorePropertiesRef,
        isLoading,
        isFetching,
        propertiesResponse,
    };
}
