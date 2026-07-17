import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { buildPropertyQueryParams } from '@/lib/propertyQueryParams';
import { useCompanies } from './useCompanies';
import { useFilters } from './useFilters';
import type { ZipCount } from '@shared/types/properties';

export function useZipCounts(options?: { enabled?: boolean }): ZipCount[] {
    const fetchEnabled = options?.enabled ?? true;
    const { company, group } = useCompanies();
    const { filters, sortBy } = useFilters();

    const url = useMemo(() => {
        const queryString = buildPropertyQueryParams(
            filters,
            { forMapPins: true },
            { company, group, sortBy },
        );
        return `/api/properties/zip-counts${queryString}`;
    }, [
        filters.msa,
        filters.counties,
        filters.statusFilters,
        filters.dateRange,
        company?.id,
        group?.id,
        sortBy,
    ]);

    const { data = [] } = useQuery<ZipCount[]>({
        queryKey: [url],
        queryFn: async () => {
            const res = await fetch(url, { credentials: 'include' });
            if (!res.ok) throw new Error(`Failed to fetch zip counts: ${res.status}`);
            return res.json();
        },
        enabled: !!url && fetchEnabled,
        staleTime: 5 * 60 * 1000,
    });

    return data;
}
