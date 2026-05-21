import { useState } from "react";
import DealCard from "@/components/deals/DealCard2";
import DealsColumn from "@/components/deals/DealsColumn";

type DealsGridProps = {
    newDeals: Deal[];
    soldDeals: Deal[];
    canManageDeals: boolean;
    canAccessApp: boolean;
    isAdmin: boolean;
    isOwner: boolean;
    isRelationshipManager: boolean;
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
    isRelationshipManager,
    userId,
    onDelete,
    onEdit,
    onRequestInfo,
    onTopBuyers,
}: DealsGridProps) {
    const [selectedDealId, setSelectedDealId] = useState<number | null>(null);
    const [mobileColumn, setMobileColumn] = useState<"new" | "sold">("new");

    const handleToggle = (dealId: number) => {
        setSelectedDealId((prev) => (prev === dealId ? null : dealId));
    };

    const switchMobileColumn = (col: "new" | "sold") => {
        setMobileColumn(col);
        setSelectedDealId(null);
    };

    const renderCard = (deal: Deal) => {
        const isOwnerOfDeal = canAccessApp && userId === deal.userId;
        const isOwnerOfDealForTopBuyers = userId === deal.userId;
        return (
            <DealCard
                key={deal.id}
                deal={{ ...deal, topBuyers: deal.topBuyers ?? [] }}
                canDelete={canManageDeals || isOwnerOfDeal}
                canEdit={userId === deal.userId || isAdmin || isOwner}
                canRequestContact={deal.dealType !== "sold" && !isOwnerOfDeal}
                isOwner={isOwnerOfDealForTopBuyers}
                canViewPoster={isAdmin || isOwner || isRelationshipManager}
                expanded={selectedDealId === deal.id}
                onToggle={() => handleToggle(deal.id)}
                onDelete={() => onDelete(deal)}
                onEdit={() => onEdit(deal)}
                onRequestInfo={() => onRequestInfo(deal)}
                onTopBuyers={() => onTopBuyers(deal)}
            />
        );
    };

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Mobile tab bar — hidden on md+ */}
            <div className="2xl:hidden flex-shrink-0 flex border-b border-border bg-background">
                <button
                    onClick={() => switchMobileColumn("new")}
                    className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                        mobileColumn === "new"
                            ? "text-primary border-b-2 border-primary -mb-px"
                            : "text-muted-foreground hover:text-foreground"
                    }`}
                >
                    New Deals ({newDeals.length})
                </button>
                <button
                    onClick={() => switchMobileColumn("sold")}
                    className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                        mobileColumn === "sold"
                            ? "text-primary border-b-2 border-primary -mb-px"
                            : "text-muted-foreground hover:text-foreground"
                    }`}
                >
                    Sold Deals ({soldDeals.length})
                </button>
            </div>

            {/* Columns */}
            <div className="flex flex-1 overflow-hidden min-h-0">
                <div className={`${mobileColumn === "new" ? "flex" : "hidden"} 2xl:flex flex-1 flex-col overflow-hidden min-w-0`}>
                    <DealsColumn
                        title="New Deals"
                        count={newDeals.length}
                        isEmpty={newDeals.length === 0}
                        borderRight
                    >
                        {newDeals.map(renderCard)}
                    </DealsColumn>
                </div>
                <div className={`${mobileColumn === "sold" ? "flex" : "hidden"} 2xl:flex flex-1 flex-col overflow-hidden min-w-0`}>
                    <DealsColumn
                        title="Sold Deals"
                        count={soldDeals.length}
                        isEmpty={soldDeals.length === 0}
                    >
                        {soldDeals.map(renderCard)}
                    </DealsColumn>
                </div>
            </div>
        </div>
    );
}
