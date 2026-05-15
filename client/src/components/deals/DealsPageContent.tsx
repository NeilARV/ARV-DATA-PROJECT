import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import AppDialog from "@/components/modals/Dialog";
import ContactContent from "@/components/modals/Contact";
import BestBuyersContent from "@/components/modals/BestBuyers";
import { Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useFilters } from "@/hooks/useFilters";
import { useRequireSubscription } from "@/hooks/useRequireSubscription";
import { getMsaNameFromCounty } from "@/lib/county";
import { formatAddress } from "@shared/utils/formatAddress";
import DealsHeader from "@/components/deals/DealsHeader";
import DealsGrid from "@/components/deals/DealsGrid";
import DealsEmptyState from "@/components/deals/DealsEmptyState";
import AddDealDialog from "@/components/deals/AddDealDialog";
import EditDealDialog from "@/components/deals/EditDealDialog";
import DeleteDealDialog from "@/components/deals/DeleteDealDialog";

export default function DealsPageContent() {
    const [showAddDeal, setShowAddDeal] = useState(false);
    const [tab, setTab] = useState<DealTab>("all");
    const [deleteConfirm, setDeleteConfirm] = useState<{ dealId: number; address: string } | null>(null);
    const [contactDeal, setContactDeal] = useState<Deal | null>(null);
    const [editDeal, setEditDeal] = useState<DealToEdit | null>(null);
    const [bestBuyersDeal, setBestBuyersDeal] = useState<Deal | null>(null);

    const { toast } = useToast();
    const { user, canAccessApp, isAdmin, isOwner, isRelationshipManager } = useAuth();
    const { requireSubscription, ContactDialog } = useRequireSubscription();
    const { filters } = useFilters();

    const canManageDeals = isAdmin || isOwner || isRelationshipManager;
    const msaName = getMsaNameFromCounty(filters.county ?? "San Diego") ?? "San Diego-Chula Vista-Carlsbad, CA";

    const queryUrl = (() => {
        const params = new URLSearchParams();
        if (tab === "mine" && user?.id) {
            params.set("userId", user.id);
        } else {
            params.set("msaName", msaName);
        }
        return `/api/deals?${params.toString()}`;
    })();

    const { data: deals = [], isLoading } = useQuery<Deal[]>({
        queryKey: ["/api/deals", tab === "mine" ? user?.id : null, tab === "mine" ? null : msaName],
        staleTime: 0,
        queryFn: async () => {
            const res = await apiRequest("GET", queryUrl);
            return res.json();
        },
    });

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

    const newDeals = deals.filter((d) => d.dealType !== "sold");
    const soldDeals = deals.filter((d) => d.dealType === "sold");

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
                msaName={msaName}
                onTabChange={setTab}
                onAddDeal={handleAddDeal}
            />

            {/* Content — loading and empty states fill the space; data view uses independent column scrolling */}
            {isLoading ? (
                <div className="flex-1 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                        <p className="text-muted-foreground">Loading deals...</p>
                    </div>
                </div>
            ) : deals.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                    <DealsEmptyState
                        size="lg"
                        message={tab === "mine" ? "No deals posted yet" : "No deals yet"}
                        subMessage={
                            tab === "mine"
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
                        userId={user?.id}
                        onDelete={(deal) => setDeleteConfirm({ dealId: deal.id, address: deal.address ?? "this deal" })}
                        onEdit={(deal) => setEditDeal({ ...deal, links: deal.links.map((l) => l.url) })}
                        onRequestInfo={(deal) => setContactDeal(deal)}
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

            <AppDialog open={!!contactDeal} onClose={() => setContactDeal(null)} className="max-w-lg">
                {contactDeal && (
                    <ContactContent
                        onClose={() => setContactDeal(null)}
                        onSuccess={() => {
                            toast({ title: "Request Received", description: "We will get back to you shortly." });
                        }}
                        defaultSubject="Request Contact Information"
                        defaultFirstName={user?.firstName}
                        defaultLastName={user?.lastName}
                        defaultEmail={user?.email}
                        defaultPhone={user?.phone}
                        defaultMessage={`I would like to request contact information for ${[formatAddress(contactDeal.address), formatAddress(contactDeal.city), contactDeal.state, contactDeal.zipCode].filter(Boolean).join(", ")} posted on ${new Date(contactDeal.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.`}
                    />
                )}
            </AppDialog>

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
