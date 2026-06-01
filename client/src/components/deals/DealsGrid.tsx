import { useState, useEffect } from "react";
import DealCard from "@/components/deals/DealCard2";
import DealsColumn from "@/components/deals/DealsColumn";
import { useRequireAuth } from "@/hooks/useRequireAuth";

type DealsGridProps = {
    newDeals: Deal[];
    soldDeals: Deal[];
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
    expandedDealId,
    pinnedDealId,
    requestingInfoDealId,
    onToggleDeal,
    onDelete,
    onEdit,
    onRequestInfo,
    onTopBuyers,
}: DealsGridProps) {
    const [mobileColumn, setMobileColumn] = useState<"new" | "sold">("new");
    const { requireAuth } = useRequireAuth();

    const totalDeals = newDeals.length + soldDeals.length;

    // Auto-scroll to and expand the linked deal when data loads or dealId changes
    useEffect(() => {
        if (!expandedDealId || totalDeals === 0) return;
        const inSold = soldDeals.some((d) => d.id === expandedDealId);
        setMobileColumn(inSold ? "sold" : "new");
        requestAnimationFrame(() => {
            const el = document.getElementById(`deal-${expandedDealId}`);
            el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
    }, [expandedDealId, totalDeals]);

    const handleToggle = (dealId: number) => {
        requireAuth(() => {
            onToggleDeal(expandedDealId === dealId ? null : dealId);
        });
    };

    const switchMobileColumn = (col: "new" | "sold") => {
        setMobileColumn(col);
        onToggleDeal(null);
    };

    const renderCard = (deal: Deal) => {
        const isOwnerOfDeal = canAccessApp && userId === deal.userId;
        const isOwnerOfDealForTopBuyers = userId === deal.userId;
        return (
            <div key={deal.id} id={`deal-${deal.id}`}>
                <DealCard
                    deal={{ ...deal, topBuyers: deal.topBuyers ?? [] }}
                    canDelete={canManageDeals || isOwnerOfDeal}
                    canEdit={userId === deal.userId || isAdmin || isOwner}
                    canRequestContact={deal.dealType !== "sold" && !isOwnerOfDeal}
                    isOwner={isOwnerOfDealForTopBuyers}
                    canViewPoster={isAdmin || isOwner || isRelationshipManager}
                    expanded={expandedDealId === deal.id}
                    isPinned={pinnedDealId === deal.id}
                    isRequestingInfo={requestingInfoDealId === deal.id}
                    onToggle={() => handleToggle(deal.id)}
                    onDelete={() => onDelete(deal)}
                    onEdit={() => onEdit(deal)}
                    onRequestInfo={() => onRequestInfo(deal)}
                    onTopBuyers={() => onTopBuyers(deal)}
                />
            </div>
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
