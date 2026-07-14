import { useState, useEffect } from 'react';
import DealCard from '@/components/deals/DealCard2';
import DealsColumn from '@/components/deals/DealsColumn';
import { MobileTabBar } from '@/components/MobileTabBar';
import { useAccessGate } from '@/hooks/useAccessGate';
import type { DealColumn } from '@/types/deals';
import type { Deal } from '@shared/types/deals';

type DealsGridProps = {
    newColumn: DealColumn;
    soldColumn: DealColumn;
    canManageDeals: boolean;
    canAccessApp: boolean;
    isAdmin: boolean;
    isOwner: boolean;
    isRelationshipManager: boolean;
    userId: string | undefined;
    expandedDealId: number | null;
    pinnedDealId: number | null;
    requestingInfoDealId?: number;
    onToggleDeal: (id: number | null) => void;
    onDelete: (deal: Deal) => void;
    onEdit: (deal: Deal) => void;
    onRequestInfo: (deal: Deal) => void;
    onSubmitOffer: (deal: Deal) => void;
    onViewOffers: (deal: Deal) => void;
    onTopBuyers: (deal: Deal) => void;
};

export default function DealsGrid({
    newColumn,
    soldColumn,
    canManageDeals,
    canAccessApp,
    isAdmin,
    isOwner,
    isRelationshipManager,
    userId,
    expandedDealId,
    pinnedDealId,
    requestingInfoDealId,
    onToggleDeal,
    onDelete,
    onEdit,
    onRequestInfo,
    onSubmitOffer,
    onViewOffers,
    onTopBuyers,
}: DealsGridProps) {
    const [mobileColumn, setMobileColumn] = useState<'new' | 'sold'>('new');
    const { requireAuth } = useAccessGate();

    const totalDeals = newColumn.deals.length + soldColumn.deals.length;

    // Auto-scroll to and expand the linked deal when data loads or dealId changes
    useEffect(() => {
        if (!expandedDealId || totalDeals === 0) return;
        const inSold = soldColumn.deals.some((d) => d.id === expandedDealId);
        setMobileColumn(inSold ? 'sold' : 'new');
        requestAnimationFrame(() => {
            const el = document.getElementById(`deal-${expandedDealId}`);
            el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
        // soldColumn.deals is intentionally omitted: totalDeals changing already covers the
        // data-load case, and depending on the array would re-run this on every pagination append.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [expandedDealId, totalDeals]);

    const handleToggle = (dealId: number) => {
        requireAuth(() => {
            onToggleDeal(expandedDealId === dealId ? null : dealId);
        });
    };

    const switchMobileColumn = (col: 'new' | 'sold') => {
        setMobileColumn(col);
        onToggleDeal(null);
    };

    const renderCard = (deal: Deal) => {
        const isOwnerOfDeal = canAccessApp && userId === deal.userId;
        const isOwnerOfDealForTopBuyers = userId === deal.userId;
        return (
            <div key={deal.id} id={`deal-${deal.id}`}>
                <DealCard
                    deal={deal}
                    canDelete={canManageDeals || isOwnerOfDeal}
                    canEdit={userId === deal.userId || isAdmin || isOwner}
                    canRequestContact={deal.dealType !== 'sold' && !isOwnerOfDeal}
                    canSubmitOffer={canAccessApp && deal.dealType !== 'sold' && !isOwnerOfDeal}
                    isOwner={isOwnerOfDealForTopBuyers}
                    canViewPoster={isAdmin || isOwner || isRelationshipManager}
                    expanded={expandedDealId === deal.id}
                    isPinned={pinnedDealId === deal.id}
                    isRequestingInfo={requestingInfoDealId === deal.id}
                    onToggle={() => handleToggle(deal.id)}
                    onDelete={() => onDelete(deal)}
                    onEdit={() => onEdit(deal)}
                    onRequestInfo={() => onRequestInfo(deal)}
                    onSubmitOffer={() => onSubmitOffer(deal)}
                    onViewOffers={() => onViewOffers(deal)}
                    onTopBuyers={() => onTopBuyers(deal)}
                />
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <MobileTabBar
                tabs={[
                    { value: 'new', label: `New Deals (${newColumn.count})` },
                    { value: 'sold', label: `Sold Deals (${soldColumn.count})` },
                ]}
                value={mobileColumn}
                onChange={switchMobileColumn}
                hideAt="2xl"
            />

            {/* Columns */}
            <div className="flex flex-1 overflow-hidden min-h-0">
                <div
                    className={`${mobileColumn === 'new' ? 'flex' : 'hidden'} 2xl:flex flex-1 flex-col overflow-hidden min-w-0`}
                >
                    <DealsColumn
                        title="New Deals"
                        count={newColumn.count}
                        isEmpty={newColumn.deals.length === 0}
                        hasMore={newColumn.hasMore}
                        isLoadingMore={newColumn.isLoadingMore}
                        loadedCount={newColumn.deals.length}
                        onLoadMore={newColumn.onLoadMore}
                        borderRight
                    >
                        {newColumn.deals.map(renderCard)}
                    </DealsColumn>
                </div>
                <div
                    className={`${mobileColumn === 'sold' ? 'flex' : 'hidden'} 2xl:flex flex-1 flex-col overflow-hidden min-w-0`}
                >
                    <DealsColumn
                        title="Sold Deals"
                        count={soldColumn.count}
                        isEmpty={soldColumn.deals.length === 0}
                        hasMore={soldColumn.hasMore}
                        isLoadingMore={soldColumn.isLoadingMore}
                        loadedCount={soldColumn.deals.length}
                        onLoadMore={soldColumn.onLoadMore}
                    >
                        {soldColumn.deals.map(renderCard)}
                    </DealsColumn>
                </div>
            </div>
        </div>
    );
}
