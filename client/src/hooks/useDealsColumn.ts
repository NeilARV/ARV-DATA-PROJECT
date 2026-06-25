import { useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { DealsPage } from '@shared/types/deals';

export const DEALS_PAGE_SIZE = 10;

/**
 * Infinite query for a single deal column (New or Sold), paginated independently of the other.
 * @param status which column to load — 'new' = every non-sold type, 'sold' = sold only.
 * @param filterParams shared location/tab query string (no status/page/limit — those are added here).
 * @returns the TanStack infinite-query result for that column.
 */
export function useDealsColumn(status: 'new' | 'sold', filterParams: string) {
    return useInfiniteQuery({
        queryKey: ['/api/deals', { status, filters: filterParams }],
        queryFn: async ({ pageParam }): Promise<DealsPage> => {
            const params = new URLSearchParams(filterParams);
            params.set('status', status);
            params.set('page', String(pageParam));
            params.set('limit', String(DEALS_PAGE_SIZE));
            const res = await apiRequest('GET', `/api/deals?${params.toString()}`);
            return res.json();
        },
        initialPageParam: 1,
        getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
        staleTime: 0,
        placeholderData: keepPreviousData,
    });
}
