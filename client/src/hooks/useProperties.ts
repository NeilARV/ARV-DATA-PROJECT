import { useState, useMemo, useRef, useEffect, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import { buildPropertyQueryParams } from "@/lib/propertyQueryParams";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import { useCompanies } from "./useCompanies";
import { useFilters } from "./useFilters";
import { useView } from "./useView";
import type { Property } from "@/types/property";

// Needed for zip code list
import { getStateFromCounty, countyNameToKey } from "@/lib/county";
import { SAN_DIEGO_MSA_ZIP_CODES, LOS_ANGELES_MSA_ZIP_CODES, DENVER_MSA_ZIP_CODES } from "@/constants/filters.constants";
import { matchesFiltersForProperty } from "@/lib/propertyFilters";

export type PropertiesResponse = {
    properties: Property[];
    total: number;
    hasMore: boolean;
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
    totalProperties: number;
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
export function useProperties(): UsePropertiesResult {
    
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

    // Reset pagination when filters, sort, or company change so we fetch page 1 of the new result set.
    useEffect(() => {
        setPropertiesPage(1);
        setAllProperties([]);
        setPropertiesHasMore(true);
        setIsLoadingMoreProperties(false);
    }, [filters, sortBy, company?.id, company, view]);

    const propertiesQueryParam = useMemo(() =>
        buildPropertyQueryParams(filters, {
            page: propertiesPage,
            limit: view === "table" ? "20" : "10",
            hasDateSold,
        }), 
        [filters, company?.id, company, propertiesPage, sortBy, view, hasDateSold]
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

    const totalProperties = useMemo(() => {
        if (view === "map") return 0;
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
        if (company && company.propertyCount > 0) {
            setStableCompanyPropertyCount(company.propertyCount);
        } else if (!company) {
            setStableCompanyPropertyCount(0);
        }
    }, [company]);


      // Get the appropriate zip code list based on state and county filter
    const zipCodeList = useMemo(() => {
        const countyName = filters.county ?? 'San Diego';
        const state = getStateFromCounty(countyName);
        const countyKey = countyNameToKey(countyName);
    
        // Get the appropriate MSA zip codes object based on state
        let msaZipCodes: Record<string, Array<{ zip: string; city: string }>>;
        if (state === 'CA') {
        // Check if it's Los Angeles MSA (Los Angeles or Orange county)
        if (countyName === 'Los Angeles' || countyName === 'Orange') {
            msaZipCodes = LOS_ANGELES_MSA_ZIP_CODES;
        } else {
            // San Diego MSA (San Diego county)
            msaZipCodes = SAN_DIEGO_MSA_ZIP_CODES;
        }
        } else if (state === 'CO') {
            // Denver MSA
            msaZipCodes = DENVER_MSA_ZIP_CODES;
        } else {
            // Default to San Diego MSA
            msaZipCodes = SAN_DIEGO_MSA_ZIP_CODES;
        }
    
        // Get the zip codes for the specific county
        const countyZipCodes = msaZipCodes[countyKey];
        
        // Return the array or empty array if county not found
        return Array.isArray(countyZipCodes) ? countyZipCodes : [];
    }, [filters.county]);

      // Filter full properties for grid/table views
      const filteredProperties = allProperties.filter((property) =>
        matchesFiltersForProperty(
          property,
          zipCodeList,
        )
      );

    return {
        properties: filteredProperties,
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
}
