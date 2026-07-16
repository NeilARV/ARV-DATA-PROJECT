import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { Deal } from '@shared/types/deals';

type PinnedDeal = {
    /** The deep-linked deal to prepend to the feed; null when unneeded, unresolved, or gone. */
    pinnedDeal: Deal | null;
    /** True once the server confirmed the linked deal no longer exists (404). */
    isGone: boolean;
};

/**
 * Resolves a deep-linked deal that the loaded feed pages don't contain, so the page can pin it
 * to the top of the list — or heal the URL when the server confirms the deal is gone.
 */
export function usePinnedDeal(dealId: number | null, loadedDeals: Deal[]): PinnedDeal {
    const isInFeed = dealId != null && loadedDeals.some((deal) => deal.id === dealId);

    // Keyed under '/api/deals' so the deal mutations' invalidation re-checks the pinned deal too
    // (an in-app delete of the linked deal then heals the URL like any stale link).
    const { data } = useQuery({
        queryKey: ['/api/deals', dealId],
        enabled: dealId != null && !isInFeed,
        staleTime: 0,
        queryFn: async (): Promise<Deal | null> => {
            try {
                const res = await apiRequest('GET', `/api/deals/${dealId}`);
                return await res.json();
            } catch (err) {
                // apiRequest throws '<status>: <message>' — a 404 is a stale link, not an error.
                if (err instanceof Error && err.message.startsWith('404:')) return null;
                throw err;
            }
        },
    });

    if (dealId == null || isInFeed) return { pinnedDeal: null, isGone: false };
    return { pinnedDeal: data ?? null, isGone: data === null };
}
