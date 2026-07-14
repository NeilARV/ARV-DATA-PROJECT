import { useEffect, useRef, useState } from 'react';
import { Handshake, Loader2, MousePointerClick } from 'lucide-react';
import DealListRow from '@/components/deals/DealListRow';
import DealDetail from '@/components/deals/DealDetail';
import DealsEmptyState from '@/components/deals/DealsEmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { cn } from '@/utils/merge';
import type { Deal, DealTab } from '@shared/types/deals';
import type { DealCaps } from '@/types/deals';

type DealsBrowserProps = {
    deals: Deal[];
    isLoading: boolean;
    hasMore: boolean;
    isLoadingMore: boolean;
    onLoadMore: () => void;
    scope: DealTab;
    onScopeChange: (scope: DealTab) => void;
    /** The URL-driven selection (`?dealId`); null shows the list on mobile / auto-selects on desktop. */
    selectedDealId: number | null;
    onSelectDeal: (id: number | null) => void;
    capabilitiesFor: (deal: Deal) => DealCaps;
    requestingInfoDealId?: number;
    onEdit: (deal: Deal) => void;
    onDelete: (deal: Deal) => void;
    onRequestInfo: (deal: Deal) => void;
    onSubmitOffer: (deal: Deal) => void;
    onViewOffers: (deal: Deal) => void;
    onTopBuyers: (deal: Deal) => void;
    emptyTitle: string;
    emptyMessage?: string;
    emptyAction?: React.ReactNode;
};

/** True at ≥1024px, where the list and detail sit side by side instead of swapping panes. */
function useIsWide() {
    const query = '(min-width: 1024px)';
    const [wide, setWide] = useState(() =>
        typeof window !== 'undefined' ? window.matchMedia(query).matches : true,
    );
    useEffect(() => {
        const mql = window.matchMedia(query);
        const onChange = () => setWide(mql.matches);
        mql.addEventListener('change', onChange);
        setWide(mql.matches);
        return () => mql.removeEventListener('change', onChange);
    }, []);
    return wide;
}

function DealRowSkeleton() {
    return (
        <div className="flex items-center gap-3 rounded-lg p-2.5">
            <Skeleton className="h-[68px] w-[68px] shrink-0 rounded-md" />
            <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-4 w-3/5" />
            </div>
        </div>
    );
}

function DetailPlaceholder({ loading }: { loading: boolean }) {
    return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            {loading ? (
                <>
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Loading deals…</p>
                </>
            ) : (
                <>
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                        <MousePointerClick
                            className="h-6 w-6 text-muted-foreground/70"
                            strokeWidth={1.5}
                        />
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Select a deal to see its full breakdown.
                    </p>
                </>
            )}
        </div>
    );
}

/**
 * Master–detail deals surface: a scannable list beside a sticky detail panel on desktop, collapsing
 * to a single swapping pane below 1024px. Selection is URL-driven (`selectedDealId`) so deep links
 * and the back button work; on desktop the first deal auto-selects locally so the detail is never
 * blank.
 */
export default function DealsBrowser({
    deals,
    isLoading,
    hasMore,
    isLoadingMore,
    onLoadMore,
    scope,
    onScopeChange,
    selectedDealId,
    onSelectDeal,
    capabilitiesFor,
    requestingInfoDealId,
    onEdit,
    onDelete,
    onRequestInfo,
    onSubmitOffer,
    onViewOffers,
    onTopBuyers,
    emptyTitle,
    emptyMessage,
    emptyAction,
}: DealsBrowserProps) {
    const isWide = useIsWide();
    const loadMoreRef = useRef<HTMLDivElement>(null);

    // The deal shown in the detail pane: the URL selection when present, otherwise (on desktop) the
    // first deal so the pane is never blank. The URL only changes on an explicit click, so this
    // fallback never churns history.
    const shownDeal =
        deals.find((d) => d.id === selectedDealId) ?? (isWide ? (deals[0] ?? null) : null);

    // Mobile shows one pane at a time, driven by whether a deal is explicitly selected.
    const detailVisibleOnMobile = selectedDealId !== null;

    useInfiniteScroll({
        ref: loadMoreRef,
        hasMore,
        loading: isLoadingMore,
        onLoadMore,
        enabled: hasMore,
        useScrollableRoot: true,
        deps: [deals.length],
    });

    // Keep the shown row visible when selection changes via deep link or keyboard.
    const shownDealId = shownDeal?.id ?? null;
    useEffect(() => {
        if (shownDealId == null) return;
        document.getElementById(`deal-row-${shownDealId}`)?.scrollIntoView({ block: 'nearest' });
    }, [shownDealId]);

    const isEmpty = !isLoading && deals.length === 0;

    const listPaneClass = cn(
        'h-full min-h-0 flex-col border-border',
        'w-full lg:w-[360px] lg:shrink-0 lg:border-r xl:w-[400px]',
        detailVisibleOnMobile ? 'hidden' : 'flex',
        'lg:flex',
    );
    // flex-col so DealDetail (the single child) stretches to the pane's full width and height,
    // rather than shrink-to-fitting its content in the default flex row.
    const detailPaneClass = cn(
        'h-full min-h-0 min-w-0 flex-1 bg-background',
        detailVisibleOnMobile ? 'flex flex-col' : 'hidden',
        'lg:flex lg:flex-col',
    );

    return (
        <div className="flex h-full overflow-hidden">
            {/* ── List ─────────────────────────────────────────────────────── */}
            <div className={listPaneClass}>
                {/* min-h matches DealDetail's header so the two columns' content start on the same line. */}
                <div className="flex min-h-[4.25rem] shrink-0 items-center border-b border-border px-3">
                    <Tabs
                        value={scope}
                        onValueChange={(v) => onScopeChange(v as DealTab)}
                        className="w-full"
                    >
                        <TabsList className="grid h-9 w-full grid-cols-2">
                            <TabsTrigger value="all">All Deals</TabsTrigger>
                            <TabsTrigger value="mine">My Deals</TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>

                <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
                    {isLoading ? (
                        Array.from({ length: 7 }).map((_, i) => <DealRowSkeleton key={i} />)
                    ) : isEmpty ? (
                        <DealsEmptyState
                            icon={Handshake}
                            title={emptyTitle}
                            message={emptyMessage}
                            action={emptyAction}
                        />
                    ) : (
                        <>
                            {deals.map((deal) => (
                                <div key={deal.id} id={`deal-row-${deal.id}`}>
                                    <DealListRow
                                        deal={deal}
                                        selected={deal.id === shownDealId}
                                        onSelect={() => onSelectDeal(deal.id)}
                                    />
                                </div>
                            ))}
                            {hasMore && (
                                <div ref={loadMoreRef} className="flex justify-center py-4">
                                    {isLoadingMore && (
                                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/60" />
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* ── Detail ───────────────────────────────────────────────────── */}
            <div className={detailPaneClass}>
                {shownDeal ? (
                    <DealDetail
                        key={shownDeal.id}
                        deal={shownDeal}
                        caps={capabilitiesFor(shownDeal)}
                        isRequestingInfo={requestingInfoDealId === shownDeal.id}
                        onBack={() => onSelectDeal(null)}
                        onEdit={() => onEdit(shownDeal)}
                        onDelete={() => onDelete(shownDeal)}
                        onRequestInfo={() => onRequestInfo(shownDeal)}
                        onSubmitOffer={() => onSubmitOffer(shownDeal)}
                        onViewOffers={() => onViewOffers(shownDeal)}
                        onTopBuyers={() => onTopBuyers(shownDeal)}
                    />
                ) : (
                    <DetailPlaceholder loading={isLoading} />
                )}
            </div>
        </div>
    );
}
