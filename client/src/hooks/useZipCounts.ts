import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { buildPropertyQueryParams } from "@/lib/propertyQueryParams";
import { useCompanies } from "./useCompanies";
import { useFilters } from "./useFilters";

export type ZipCount = { zipCode: string; count: number };

export function useZipCounts(): ZipCount[] {
    const { company } = useCompanies();
    const { filters, sortBy } = useFilters();

    const url = useMemo(() => {
        const queryString = buildPropertyQueryParams(
            filters,
            { forMapPins: true, page: 1, limit: "10" },
            { company, sortBy },
        );
        return `/api/properties/zip-counts${queryString}`;
    }, [filters.county, filters.statusFilters, filters.dateRange, company?.id, sortBy]);

    const { data = [] } = useQuery<ZipCount[]>({
        queryKey: [url],
        queryFn: async () => {
            const res = await fetch(url, { credentials: "include" });
            if (!res.ok) throw new Error(`Failed to fetch zip counts: ${res.status}`);
            return res.json();
        },
        enabled: !!url,
        staleTime: 5 * 60 * 1000,
    });

    return data;
}
