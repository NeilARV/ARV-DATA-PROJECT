import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AddDeal from "@/components/modals/AddDeal";
import UpdateDeal from "@/components/modals/UpdateDeal";
import AppDialog from "@/components/modals/Dialog";
import ContactContent from "@/components/modals/Contact";
import BestBuyersContent from "@/components/modals/BestBuyers";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Handshake, Plus, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useFilters } from "@/hooks/useFilters";
import { useRequireSubscription } from "@/hooks/useRequireSubscription";
import { getMsaNameFromCounty } from "@/lib/county";
import { formatAddress } from "@shared/utils/formatAddress";
import DealCard from "@/components/deal/DealCard";

// ── Main DealView component ────────────────────────────────────────────────────
export default function DealView() {
  const [showAddDeal, setShowAddDeal] = useState(false);
  const [tab, setTab] = useState<DealTab>("all");
  const [deleteConfirm, setDeleteConfirm] = useState<{ dealId: number; address: string } | null>(null);
  const [contactDeal, setContactDeal] = useState<Deal | null>(null);
  const [editDeal, setEditDeal] = useState<DealToEdit | null>(null);
  const [bestBuyersDeal, setBestBuyersDeal] = useState<Deal | null>(null);
  const { toast } = useToast();
  const { user, canAccessApp, isAdminOrOwner, isRelationshipManager } = useAuth();
  const { requireSubscription, ContactDialog } = useRequireSubscription();
  const canManageDeals = isAdminOrOwner || isRelationshipManager;
  const { filters } = useFilters();

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

  const renderCard = (deal: Deal) => {
    const isOwnerOfDeal = canAccessApp && user?.id === deal.userId;
    const isOwnerOfDealForTopBuyers = user?.id === deal.userId;
    return (
      <DealCard
        key={deal.id}
        deal={{ ...deal, topBuyers: deal.topBuyers ?? [] }}
        canDelete={canManageDeals || isOwnerOfDeal}
        canEdit={user?.id === deal.userId}
        canRequestContact={canManageDeals || !isOwnerOfDeal}
        isOwner={isOwnerOfDealForTopBuyers}
        onDelete={() => setDeleteConfirm({ dealId: deal.id, address: deal.address ?? "this deal" })}
        onEdit={() => setEditDeal({ ...deal, links: deal.links.map((l) => l.url) })}
        onRequestInfo={() => setContactDeal(deal)}
        onTopBuyers={() => setBestBuyersDeal(deal)}
      />
    );
  };

  // ── Feed view ────────────────────────────────────────────────────────────────
  return (
    <div className="h-full overflow-y-auto p-6 flex-1 flex flex-col">
      {/* Header row */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold">
          {tab === "mine" ? "Your Deal Feed" : `${msaName} Deal Feed`}
        </h2>
        <div className="flex items-center gap-3">
          <Tabs value={tab} onValueChange={(v) => setTab(v as DealTab)}>
            <TabsList>
              <TabsTrigger value="all">All Deals</TabsTrigger>
              <TabsTrigger value="mine">Your Deals</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button size="sm" onClick={() => requireSubscription(() => setShowAddDeal(true), { tiers: ["pro", "premium"], subject: "Request Access", message: "I would like to request an account upgrade to post deals" })} className="gap-1">
            <Plus className="w-4 h-4" />
            Add Deal
          </Button>
        </div>
      </div>

      {/* Deal cards */}
      {isLoading ? (
        <div className="flex items-center justify-center flex-1">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">Loading deals...</p>
          </div>
        </div>
      ) : deals.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center">
          <Handshake className="w-16 h-16 text-muted-foreground/30" />
          {tab === "mine" ? (
            <>
              <p className="text-xl font-medium text-muted-foreground">No deals posted yet</p>
              <p className="text-sm text-muted-foreground/60">Your posted deals will appear here.</p>
            </>
          ) : (
            <>
              <p className="text-xl font-medium text-muted-foreground">No deals yet</p>
              <p className="text-sm text-muted-foreground/60">Be the first to post a deal to the feed.</p>
            </>
          )}
        </div>
      ) : (
        <>
          {/* ── Two-column layout ──────────────────────────────────────────── */}
          <div className="flex gap-0 flex-1 items-start">
            {/* New Deals column */}
            <div className="flex-1 flex flex-col gap-4 min-w-0 pr-6">
              <h3 className="text-base font-semibold text-foreground">New Deals</h3>
              {newDeals.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
                  <Handshake className="w-10 h-10 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">No new deals</p>
                </div>
              ) : (
                newDeals.map(renderCard)
              )}
            </div>

            {/* Divider */}
            <div className="w-px bg-border self-stretch shrink-0" />

            {/* Sold Deals column */}
            <div className="flex-1 flex flex-col gap-4 min-w-0 pl-6">
              <h3 className="text-base font-semibold text-foreground">Sold Deals</h3>
              {soldDeals.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
                  <Handshake className="w-10 h-10 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">No sold deals</p>
                </div>
              ) : (
                soldDeals.map(renderCard)
              )}
            </div>
          </div>
        </>
      )}

      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Deal</AlertDialogTitle>
            <AlertDialogDescription>
              Remove "{deleteConfirm?.address}" from the deal feed? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteDeal.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteDeal.isPending}
              onClick={() => deleteConfirm && deleteDeal.mutate(deleteConfirm.dealId)}
            >
              {deleteDeal.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      <AddDeal open={showAddDeal} onClose={() => setShowAddDeal(false)} />
      {ContactDialog}

      {editDeal && (
        <UpdateDeal
          deal={editDeal}
          open={!!editDeal}
          onClose={() => setEditDeal(null)}
        />
      )}

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

    </div>
  );
}
