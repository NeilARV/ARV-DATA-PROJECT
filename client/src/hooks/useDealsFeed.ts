import { useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { DealsPage } from '@shared/types/deals';
import type { DealTypeFilter } from '@/components/deals/DealsToolbar';

export const DEALS_PAGE_SIZE = 12;

/**
 * Infinite query backing the unified deals feed, newest first.
 * @param typeFilter narrows to a single deal type (including 'sold'); 'all' sends no constraint.
 * @param filterParams shared location/scope query string (no type/page/limit — added here).
 * @returns the TanStack infinite-query result for the feed.
 */
export function useDealsFeed(typeFilter: DealTypeFilter, filterParams: string) {
    return useInfiniteQuery({
        queryKey: ['/api/deals', { type: typeFilter, filters: filterParams }],
        queryFn: async ({ pageParam }): Promise<DealsPage> => {
            const params = new URLSearchParams(filterParams);
            if (typeFilter !== 'all') params.set('type', typeFilter);
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
