import { useState, useEffect } from 'react';
import DealCard from '@/components/deals/DealCard2';
import DealsColumn from '@/components/deals/DealsColumn';
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
    const [activeTab, setActiveTab] = useState<'new' | 'sold'>('new');
    const { requireAuth } = useAccessGate();

    const totalDeals = newColumn.deals.length + soldColumn.deals.length;

    // Auto-scroll to and expand the linked deal when data loads or dealId changes
    useEffect(() => {
        if (!expandedDealId || totalDeals === 0) return;
        const inSold = soldColumn.deals.some((d) => d.id === expandedDealId);
        setActiveTab(inSold ? 'sold' : 'new');
        requestAnimationFrame(() => {
            const el = document.getElementById(`deal-${expandedDealId}`);
            el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
    }, [expandedDealId, totalDeals]);

    const handleToggle = (dealId: number) => {
        requireAuth(() => {
            onToggleDeal(expandedDealId === dealId ? null : dealId);
        });
    };

    const switchTab = (tab: 'new' | 'sold') => {
        setActiveTab(tab);
        onToggleDeal(null);
    };

    const renderCard = (deal: Deal) => {
        const isOwnerOfDeal = canAccessApp && userId === deal.userId;
        const isOwnerOfDealForTopBuyers = userId === deal.userId;
        return (
            <div key={deal.id} id={`deal-${deal.id}`} className="w-full max-w-[480px] h-full">
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
            {/* Tab bar — New / Sold, on every viewport */}
            <div className="flex-shrink-0 flex border-b border-border bg-background">
                <button
                    onClick={() => switchTab('new')}
                    className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                        activeTab === 'new'
                            ? 'text-primary border-b-2 border-primary -mb-px'
                            : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                    New Deals ({newColumn.count})
                </button>
                <button
                    onClick={() => switchTab('sold')}
                    className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                        activeTab === 'sold'
                            ? 'text-primary border-b-2 border-primary -mb-px'
                            : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                    Sold Deals ({soldColumn.count})
                </button>
            </div>

            {/* Active tab — a single full-width grid */}
            <div className="flex-1 flex overflow-hidden min-h-0">
                {activeTab === 'new' ? (
                    <DealsColumn
                        title="New Deals"
                        isEmpty={newColumn.deals.length === 0}
                        hasMore={newColumn.hasMore}
                        isLoadingMore={newColumn.isLoadingMore}
                        loadedCount={newColumn.deals.length}
                        onLoadMore={newColumn.onLoadMore}
                    >
                        {newColumn.deals.map(renderCard)}
                    </DealsColumn>
                ) : (
                    <DealsColumn
                        title="Sold Deals"
                        isEmpty={soldColumn.deals.length === 0}
                        hasMore={soldColumn.hasMore}
                        isLoadingMore={soldColumn.isLoadingMore}
                        loadedCount={soldColumn.deals.length}
                        onLoadMore={soldColumn.onLoadMore}
                    >
                        {soldColumn.deals.map(renderCard)}
                    </DealsColumn>
                )}
            </div>
        </div>
    );
}
