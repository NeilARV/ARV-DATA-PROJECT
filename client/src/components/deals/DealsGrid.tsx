import DealCard from "@/components/deals/DealCard";
import DealsColumn from "@/components/deals/DealsColumn";

type DealsGridProps = {
    newDeals: Deal[];
    soldDeals: Deal[];
    canManageDeals: boolean;
    canAccessApp: boolean;
    isAdmin: boolean;
    isOwner: boolean;
    userId: string | undefined;
    onDelete: (deal: Deal) => void;
    onEdit: (deal: Deal) => void;
    onRequestInfo: (deal: Deal) => void;
    onTopBuyers: (deal: Deal) => void;
};

export default function DealsGrid({
    newDeals,
    soldDeals,
    canManageDeals,
    canAccessApp,
    isAdmin,
    isOwner,
    userId,
    onDelete,
    onEdit,
    onRequestInfo,
    onTopBuyers,
}: DealsGridProps) {
    const renderCard = (deal: Deal) => {
        const isOwnerOfDeal = canAccessApp && userId === deal.userId;
        const isOwnerOfDealForTopBuyers = userId === deal.userId;
        return (
            <DealCard
                key={deal.id}
                deal={{ ...deal, topBuyers: deal.topBuyers ?? [] }}
                canDelete={canManageDeals || isOwnerOfDeal}
                canEdit={userId === deal.userId || isAdmin || isOwner}
                canRequestContact={canManageDeals || !isOwnerOfDeal}
                isOwner={isOwnerOfDealForTopBuyers}
                canViewPoster={isAdmin || isOwner}
                onDelete={() => onDelete(deal)}
                onEdit={() => onEdit(deal)}
                onRequestInfo={() => onRequestInfo(deal)}
                onTopBuyers={() => onTopBuyers(deal)}
            />
        );
    };

    return (
        <div className="flex h-full overflow-hidden">
            <DealsColumn
                title="New Deals"
                count={newDeals.length}
                isEmpty={newDeals.length === 0}
                borderRight
            >
                {newDeals.map(renderCard)}
            </DealsColumn>

            <DealsColumn
                title="Sold Deals"
                count={soldDeals.length}
                isEmpty={soldDeals.length === 0}
            >
                {soldDeals.map(renderCard)}
            </DealsColumn>
        </div>
    );
}
