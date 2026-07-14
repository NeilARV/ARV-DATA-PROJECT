import { useRef, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import DealsEmptyState from '@/components/deals/DealsEmptyState';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';

type DealsColumnProps = {
    title: string;
    count: number;
    children: ReactNode;
    isEmpty: boolean;
    borderRight?: boolean;
    hasMore?: boolean;
    isLoadingMore?: boolean;
    /** Number of currently rendered cards — re-attaches the scroll sentinel as pages append. */
    loadedCount?: number;
    onLoadMore?: () => void;
};

/** One deal column (New or Sold) with an independently scrolling, infinitely paginated body. */
export default function DealsColumn({
    title,
    count,
    children,
    isEmpty,
    borderRight = false,
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
        <div
            className={`flex-1 flex flex-col overflow-hidden min-w-0 ${borderRight ? '2xl:border-r border-border' : ''}`}
        >
            {/* Independently scrolling body */}
            <div className="flex-1 overflow-y-auto p-6 min-h-0">
                <h3 className="text-base font-semibold text-foreground mb-4">
                    {title}
                    <span className="ml-2 font-normal normal-case tracking-normal text-muted-foreground">
                        ({count})
                    </span>
                </h3>
                {isEmpty ? (
                    <DealsEmptyState title={`No ${title.toLowerCase()}`} className="py-10" />
                ) : (
                    <div className="space-y-4">{children}</div>
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
