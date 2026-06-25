import { useRef, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import DealsEmptyState from '@/components/deals/DealsEmptyState';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';

type DealsColumnProps = {
    /** Used for the empty-state message (the heading itself lives in the tab bar). */
    title: string;
    children: ReactNode;
    isEmpty: boolean;
    hasMore?: boolean;
    isLoadingMore?: boolean;
    /** Number of currently rendered cards — re-attaches the scroll sentinel as pages append. */
    loadedCount?: number;
    onLoadMore?: () => void;
};

/** One deal tab (New or Sold): a responsive, infinitely paginated grid of deal cards. */
export default function DealsColumn({
    title,
    children,
    isEmpty,
    hasMore = false,
    isLoadingMore = false,
    loadedCount = 0,
    onLoadMore,
}: DealsColumnProps) {
    const loadMoreRef = useRef<HTMLDivElement>(null);

    useInfiniteScroll({
        ref: loadMoreRef,
        hasMore,
        loading: isLoadingMore,
        onLoadMore: () => onLoadMore?.(),
        enabled: hasMore && !!onLoadMore,
        useScrollableRoot: true,
        deps: [loadedCount],
    });

    return (
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
            {/* Independently scrolling body */}
            <div className="flex-1 overflow-y-auto p-6 min-h-0">
                {isEmpty ? (
                    <DealsEmptyState size="sm" message={`No ${title.toLowerCase()}`} />
                ) : (
                    // 1 → 5 columns, capping at 5 on very wide screens. Steps are ~420px apart
                    // so a new column only appears when there's room for a comfortably-sized card
                    // (each card is also capped at 480px in DealsGrid). `items-stretch` makes
                    // every card in a row fill the same height — no gaps between cards.
                    <div className="grid gap-4 items-stretch justify-items-center grid-cols-1 min-[820px]:grid-cols-2 min-[1240px]:grid-cols-3 min-[1660px]:grid-cols-4 min-[2100px]:grid-cols-5">
                        {children}
                    </div>
                )}
                {/* Infinite-scroll sentinel — sits inside the scroll root so the observer can track it */}
                {hasMore && (
                    <div ref={loadMoreRef} className="flex justify-center py-4">
                        {isLoadingMore && (
                            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground/60" />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
