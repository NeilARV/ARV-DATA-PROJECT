import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import AppDialog from "@/components/modals/Dialog";
import BestBuyersContent from "@/components/modals/BestBuyers";
import { Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useRequireSubscription } from "@/hooks/useRequireSubscription";
import { formatAddress } from "@shared/utils/formatAddress";
import DealsHeader from "@/components/deals/DealsHeader";
import DealsGrid from "@/components/deals/DealsGrid";
import DealsEmptyState from "@/components/deals/DealsEmptyState";
import AddDealDialog from "@/components/deals/AddDealDialog";
import EditDealDialog from "@/components/deals/EditDealDialog";
import DeleteDealDialog from "@/components/deals/DeleteDealDialog";
import RequestDealInfoDialog from "@/components/deals/RequestDealInfoDialog";
import { useDealsNav } from "@/hooks/useDealsNav";

export default function DealsPageContent() {
    const [showAddDeal, setShowAddDeal] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<{ dealId: number; address: string } | null>(null);
    const [confirmRequestDeal, setConfirmRequestDeal] = useState<Deal | null>(null);
    const [requestInfoSucceeded, setRequestInfoSucceeded] = useState(false);
    const [editDeal, setEditDeal] = useState<DealToEdit | null>(null);
    const [bestBuyersDeal, setBestBuyersDeal] = useState<Deal | null>(null);

    const { toast } = useToast();
    const { user, canAccessApp, isAdmin, isOwner, isRelationshipManager } = useAuth();
    const { requireSubscription, ContactDialog } = useRequireSubscription();
    const { tab, locationFilter, dealId, setTab, setLocationFilter, setDealId } = useDealsNav();

    const canManageDeals = isAdmin || isOwner || isRelationshipManager;

    // Build the query URL based on active tab and location filter
    const queryUrl = (() => {
        const params = new URLSearchParams();

        if (tab === "mine" && user?.id) {
            params.set("userId", user.id);
        }

        if (locationFilter?.type === "county") {
            params.set("county", locationFilter.value);
            params.set("state", locationFilter.state);
        } else if (locationFilter?.type === "msa") {
            params.set("msaName", locationFilter.value);
        } else if (locationFilter?.type === "city") {
            params.set("city", locationFilter.value);
            params.set("state", locationFilter.state);
        } else if (locationFilter?.type === "zip") {
            params.set("zipCode", locationFilter.value);
        }

        return `/api/deals?${params.toString()}`;
    })();

    const { data: deals = [], isLoading } = useQuery<Deal[]>({
        queryKey: ["/api/deals", queryUrl],
        staleTime: 0,
        queryFn: async () => {
            const res = await apiRequest("GET", queryUrl);
            return res.json();
        },
    });

    // Secondary fetch for a linked deal that may not be in the current filtered list
    const dealInList = dealId !== null && deals.some((d) => d.id === dealId);
    const { data: pinnedDeal = null } = useQuery<Deal | null>({
        queryKey: ["/api/deals", "single", dealId],
        enabled: dealId !== null && !isLoading && !dealInList,
        staleTime: 30_000,
        retry: false,
        queryFn: async () => {
            const res = await apiRequest("GET", `/api/deals/${dealId}`);
            if (!res.ok) return null;
            return res.json() as Promise<Deal>;
        },
    });

    // Prepend the pinned deal at the top of its column if it's not already in the filtered list
    const dealsWithPinned = useMemo(() => {
        if (!pinnedDeal || dealInList) return deals;
        return [pinnedDeal, ...deals];
    }, [deals, pinnedDeal, dealInList]);

    const pinnedDealId = pinnedDeal && !dealInList ? dealId : null;

    const deleteDeal = useMutation({
        mutationFn: async (dealId: number) => {
            const res = await apiRequest("DELETE", `/api/deals/${dealId}`);
            return res.json();
        },
        onSuccess: () => {
            toast({ title: "Deal Deleted", description: "The deal has been removed from the feed." });
            queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
            setDeleteConfirm(null);
        },
        onError: (err: any) => {
            toast({ title: "Error", description: err.message || "Failed to delete deal", variant: "destructive" });
            setDeleteConfirm(null);
        },
    });

    const requestDealInfo = useMutation({
        mutationFn: async (dealId: number) => {
            const res = await apiRequest("POST", `/api/deals/${dealId}/request-info`);
            return res.json();
        },
        onSuccess: () => {
            setRequestInfoSucceeded(true);
        },
        onError: () => {
            toast({ title: "Error", description: "Failed to send request. Please try again.", variant: "destructive" });
        },
    });

    const newDeals = dealsWithPinned.filter((d) => d.dealType !== "sold");
    const soldDeals = dealsWithPinned.filter((d) => d.dealType === "sold");

    const handleAddDeal = () =>
        requireSubscription(() => setShowAddDeal(true), {
            tiers: ["pro", "premium"],
            subject: "Request Access",
            message: "I would like to request access to post deals on the ARV data application",
        });

    return (
        <div className="h-full flex flex-col overflow-hidden">
            <DealsHeader
                tab={tab}
                deals={deals}
                locationFilter={locationFilter}
                onTabChange={setTab}
                onAddDeal={handleAddDeal}
                onLocationFilterChange={setLocationFilter}
            />

            {isLoading ? (
                <div className="flex-1 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                        <p className="text-muted-foreground">Loading deals...</p>
                    </div>
                </div>
            ) : dealsWithPinned.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                    <DealsEmptyState
                        size="lg"
                        message={tab === "mine" ? "No deals posted yet" : "No deals found"}
                        subMessage={
                            locationFilter
                                ? `No deals match the selected location. Try a different filter.`
                                : tab === "mine"
                                ? "Your posted deals will appear here."
                                : "Be the first to post a deal to the feed."
                        }
                    />
                </div>
            ) : (
                <div className="flex-1 overflow-hidden min-h-0">
                    <DealsGrid
                        newDeals={newDeals}
                        soldDeals={soldDeals}
                        canManageDeals={!!canManageDeals}
                        canAccessApp={!!canAccessApp}
                        isAdmin={!!isAdmin}
                        isOwner={!!isOwner}
                        isRelationshipManager={!!isRelationshipManager}
                        userId={user?.id}
                        expandedDealId={dealId}
                        pinnedDealId={pinnedDealId}
                        onToggleDeal={setDealId}
                        onDelete={(deal) => setDeleteConfirm({ dealId: deal.id, address: deal.address ?? "this deal" })}
                        onEdit={(deal) => setEditDeal({ ...deal, links: deal.links.map((l) => l.url) })}
                        requestingInfoDealId={requestDealInfo.isPending ? requestDealInfo.variables : undefined}
                        onRequestInfo={(deal) => setConfirmRequestDeal(deal)}
                        onTopBuyers={(deal) => setBestBuyersDeal(deal)}
                    />
                </div>
            )}

            {/* Dialogs */}
            <AddDealDialog open={showAddDeal} onClose={() => setShowAddDeal(false)} />

            {editDeal && (
                <EditDealDialog
                    deal={editDeal}
                    open={!!editDeal}
                    onClose={() => setEditDeal(null)}
                />
            )}

            <DeleteDealDialog
                open={!!deleteConfirm}
                address={deleteConfirm?.address ?? ""}
                isLoading={deleteDeal.isPending}
                onClose={() => setDeleteConfirm(null)}
                onConfirm={() => deleteConfirm && deleteDeal.mutate(deleteConfirm.dealId)}
            />

            <RequestDealInfoDialog
                open={!!confirmRequestDeal}
                address={
                    formatAddress(confirmRequestDeal?.address) ??
                    [formatAddress(confirmRequestDeal?.city), confirmRequestDeal?.state].filter(Boolean).join(", ") ??
                    "this property"
                }
                isLoading={requestDealInfo.isPending}
                succeeded={requestInfoSucceeded}
                onClose={() => { setConfirmRequestDeal(null); setRequestInfoSucceeded(false); }}
                onConfirm={() => confirmRequestDeal && requestDealInfo.mutate(confirmRequestDeal.id)}
            />

            <AppDialog open={!!bestBuyersDeal} onClose={() => setBestBuyersDeal(null)} className="max-w-md">
                {bestBuyersDeal && (
                    <BestBuyersContent
                        buyers={bestBuyersDeal.topBuyers}
                        address={bestBuyersDeal.address}
                        city={bestBuyersDeal.city}
                        state={bestBuyersDeal.state}
                        zipCode={bestBuyersDeal.zipCode}
                        onClose={() => setBestBuyersDeal(null)}
                    />
                )}
            </AppDialog>

            {ContactDialog}
        </div>
    );
}
