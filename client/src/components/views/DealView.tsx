import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AddDeal from "@/components/modals/AddDeal";
import UpdateDeal from "@/components/modals/UpdateDeal";
import type { DealToEdit } from "@/components/modals/UpdateDeal";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Handshake,
  Plus,
  Loader2,
  Bed,
  Bath,
  Maximize2,
  MoreVertical,
  Trash2,
  Phone,
  Pencil,
  Trophy,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useFilters } from "@/hooks/useFilters";
import { getMsaNameFromCounty } from "@/lib/county";
import { formatAddress } from "@shared/utils/formatAddress";

import type { TopBuyer } from "@/components/modals/BestBuyers";

interface Deal {
  id: number;
  createdAt: string;
  sfrPropertyId: number | null;
  streetViewUrl: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  propertyType: string | null;
  beds: number | null;
  baths: string | null;
  sqft: number | null;
  price: string | null;
  potentialARV: string | null;
  notes: string | null;
  msaId: number;
  msaName: string | null;
  type: "wholesale" | "agent" | "sold";
  userId: string;
  userEmail: string | null;
  topBuyers: TopBuyer[];
}

type Tab = "all" | "mine";

// ── Individual deal card ───────────────────────────────────────────────────────
function DealCard({
  deal,
  canDelete,
  canEdit,
  canRequestContact,
  isOwner,
  onDelete,
  onEdit,
  onRequestContact,
  onTopBuyers,
}: {
  deal: Deal;
  canDelete: boolean;
  canEdit: boolean;
  canRequestContact: boolean;
  isOwner: boolean;
  onDelete: () => void;
  onEdit: () => void;
  onRequestContact: () => void;
  onTopBuyers: () => void;
}) {
  const [imageUrl, setImageUrl] = useState("");
  const [imageLoading, setImageLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!deal.streetViewUrl) {
      setImageLoading(false);
      return;
    }
    const img = new Image();
    img.onload = () => { setImageUrl(deal.streetViewUrl!); setImageLoading(false); };
    img.onerror = () => setImageLoading(false);
    img.src = deal.streetViewUrl;
  }, [deal.streetViewUrl]);

  const price = deal.price ? Number(deal.price) : null;
  const potentialARV = deal.potentialARV ? Number(deal.potentialARV) : null;
  const beds = deal.beds ? Number(deal.beds) : null;
  const baths = deal.baths ? parseFloat(deal.baths) : null;
  const sqft = deal.sqft ? Number(deal.sqft) : null;
  const postedAt = new Date(deal.createdAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="rounded-lg border border-border bg-card flex flex-col">
      <div className="flex gap-0">
        {/* Left: street view thumbnail */}
        <div className="w-52 shrink-0 bg-muted flex items-center justify-center self-stretch relative rounded-tl-lg rounded-bl-lg overflow-hidden">
          {imageLoading ? (
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground/40" />
          ) : imageUrl ? (
            <img src={imageUrl} alt={deal.address ?? ""} className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <Handshake className="w-8 h-8 text-muted-foreground/30" />
          )}
          <span
            className="absolute top-2 left-2 text-[11px] font-semibold px-2 py-0.5 rounded shadow-sm"
            style={
              deal.type === "wholesale"
                ? { backgroundColor: "#9333EA", color: "#fff" }
                : deal.type === "sold"
                ? { backgroundColor: "#FF0000", color: "#fff" }
                : { backgroundColor: "#F97316", color: "#fff" }
            }
          >
            {deal.type === "wholesale" ? "Wholesale" : deal.type === "sold" ? "Sold" : "Agent"}
          </span>
        </div>

        {/* Right: property details */}
        <div className="flex-1 min-w-0 px-5 py-2.5 flex flex-col gap-2 min-h-0">
          <div className="flex items-start justify-between gap-1 min-w-0">
            <div className="min-w-0">
              <p className="font-medium text-base leading-tight truncate">
                {formatAddress(deal.address) ?? "Undisclosed Address"}
              </p>
              <p className="text-sm text-muted-foreground truncate mt-0.5">
                {[formatAddress(deal.city), deal.state, deal.zipCode].filter(Boolean).join(", ")}
              </p>
            </div>
            <div className="flex items-start gap-1 shrink-0">
              {(canEdit || canDelete) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="z-[10001]">
                    {canEdit && (
                      <DropdownMenuItem
                        className="gap-2 cursor-pointer"
                        onSelect={onEdit}
                      >
                        <Pencil className="h-4 w-4" />
                        Edit Deal
                      </DropdownMenuItem>
                    )}
                    {canDelete && (
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive gap-2 cursor-pointer"
                        onSelect={onDelete}
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete Deal
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          {(beds !== null || baths !== null || sqft !== null) && (
            <div className="flex items-center gap-4 text-sm text-foreground">
              {beds !== null && (
                <span className="flex items-center gap-1.5">
                  <Bed className="w-4 h-4 text-muted-foreground" />
                  {beds} bd
                </span>
              )}
              {baths !== null && (
                <span className="flex items-center gap-1.5">
                  <Bath className="w-4 h-4 text-muted-foreground" />
                  {baths} ba
                </span>
              )}
              {sqft !== null && (
                <span className="flex items-center gap-1.5">
                  <Maximize2 className="w-4 h-4 text-muted-foreground" />
                  {sqft.toLocaleString()} sqft
                </span>
              )}
            </div>
          )}

          {(price !== null || potentialARV !== null) && (
            <div className="flex items-center gap-6 text-sm">
              {price !== null && price > 0 && (
                <div className="flex flex-col">
                  <span className="text-sm text-muted-foreground">Purchase Price</span>
                  <span className="text-xl font-bold text-foreground">${price.toLocaleString()}</span>
                </div>
              )}
              {potentialARV !== null && potentialARV > 0 && (
                <div className="flex flex-col">
                  <span className="text-sm text-muted-foreground">Potential ARV</span>
                  <span className="text-xl font-bold text-[#2e7d32]">${potentialARV.toLocaleString()}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col">
            <span className="text-sm text-muted-foreground">Posted</span>
            <span className="text-sm font-medium text-foreground">{postedAt}</span>
          </div>

          {(canRequestContact || isOwner) && (
            <div className="flex flex-col">
              <span className="text-sm text-muted-foreground">Actions</span>
              <div className="flex items-center gap-5">
                {canRequestContact && (
                  <button
                    onClick={onRequestContact}
                    className="flex items-center gap-1.5 text-sm text-foreground hover:text-muted-foreground underline underline-offset-2 decoration-foreground/40 hover:decoration-muted-foreground/40 transition-colors"
                  >
                    <Phone className="w-3 h-3 shrink-0" />
                    Request Contact
                  </button>
                )}
                {isOwner && (
                  <button
                    onClick={onTopBuyers}
                    className="flex items-center gap-1.5 text-sm text-foreground hover:text-muted-foreground underline underline-offset-2 decoration-foreground/40 hover:decoration-muted-foreground/40 transition-colors"
                  >
                    <Trophy className="w-3 h-3 shrink-0 text-amber-500" />
                    Top Potential Buyers
                  </button>
                )}
              </div>
            </div>
          )}

          {expanded && deal.notes && (
            <div>
              <p className="text-sm text-muted-foreground">Notes</p>
              <p className="text-sm text-foreground leading-relaxed">{deal.notes}</p>
            </div>
          )}

          {deal.notes && (
            <button
              className="flex items-center justify-center gap-1 w-full text-xs text-muted-foreground hover:text-foreground transition-colors mt-auto pt-1"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? (
                <>View Less <ChevronUp className="w-3.5 h-3.5" /></>
              ) : (
                <>View More <ChevronDown className="w-3.5 h-3.5" /></>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main DealView component ────────────────────────────────────────────────────
export default function DealView() {
  const [showAddDeal, setShowAddDeal] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const [deleteConfirm, setDeleteConfirm] = useState<{ dealId: number; address: string } | null>(null);
  const [contactDeal, setContactDeal] = useState<Deal | null>(null);
  const [editDeal, setEditDeal] = useState<DealToEdit | null>(null);
  const [bestBuyersDeal, setBestBuyersDeal] = useState<Deal | null>(null);
  const { toast } = useToast();
  const { user, isPro, isAdminOrOwner, isRelationshipManager } = useAuth();
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

  const newDeals = deals.filter((d) => d.type !== "sold");
  const soldDeals = deals.filter((d) => d.type === "sold");

  const renderCard = (deal: Deal) => {
    const isOwnerOfDeal = isPro && user?.id === deal.userId;
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
        onEdit={() => setEditDeal(deal)}
        onRequestContact={() => setContactDeal(deal)}
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
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList>
              <TabsTrigger value="all">All Deals</TabsTrigger>
              <TabsTrigger value="mine">Your Deals</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button size="sm" onClick={() => setShowAddDeal(true)} className="gap-1">
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
