import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AddDeal from "@/components/modals/AddDeal";
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
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useFilters } from "@/hooks/useFilters";
import { getMsaNameFromCounty } from "@/lib/county";
import { getStreetViewUrl } from "@/lib/streetView";
import { formatAddress } from "@shared/utils/formatAddress";

interface Deal {
  id: number;
  createdAt: string;
  propertyId: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  propertyType: string | null;
  listingStatus: string | null;
  bedrooms: number | null;
  bathrooms: string | null;
  squareFeet: number | null;
  yearBuilt: number | null;
  price: string | null;
  msaId: number;
  msaName: string | null;
  userId: string;
  userEmail: string | null;
}

type Tab = "all" | "mine";

// ── Individual deal card ───────────────────────────────────────────────────────
function DealCard({
  deal,
  canDelete,
  canRequestContact,
  onDelete,
}: {
  deal: Deal;
  canDelete: boolean;
  canRequestContact: boolean;
  onDelete: () => void;
}) {
  const [imageUrl, setImageUrl] = useState("");
  const [imageLoading, setImageLoading] = useState(true);

  useEffect(() => {
    if (!deal.address || !deal.city || !deal.state) {
      setImageLoading(false);
      return;
    }
    getStreetViewUrl(deal.address, deal.city, deal.state, "200x200", deal.propertyId)
      .then((url) => {
        if (url) {
          const img = new Image();
          img.onload = () => { setImageUrl(url); setImageLoading(false); };
          img.onerror = () => setImageLoading(false);
          img.src = url;
        } else {
          setImageLoading(false);
        }
      })
      .catch(() => setImageLoading(false));
  }, [deal.address, deal.city, deal.state, deal.propertyId]);

  const price = deal.price ? Number(deal.price) : null;
  const beds = deal.bedrooms ? Number(deal.bedrooms) : null;
  const baths = deal.bathrooms ? parseFloat(deal.bathrooms) : null;
  const sqft = deal.squareFeet ? Number(deal.squareFeet) : null;
  const postedAt = new Date(deal.createdAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="rounded-lg border border-border bg-card flex gap-0">
      {/* Left: street view thumbnail */}
      <div className="w-52 shrink-0 bg-muted flex items-center justify-center self-stretch relative rounded-tl-lg rounded-bl-lg overflow-hidden">
        {imageLoading ? (
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground/40" />
        ) : imageUrl ? (
          <img src={imageUrl} alt={deal.address ?? ""} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <Handshake className="w-8 h-8 text-muted-foreground/30" />
        )}
      </div>

      {/* Right: property details */}
      <div className="flex-1 min-w-0 px-5 py-4 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-1 min-w-0">
          <div className="min-w-0">
            <p className="font-semibold text-base leading-tight truncate">
              {formatAddress(deal.address) ?? "Unknown address"}
            </p>
            <p className="text-sm text-muted-foreground truncate mt-0.5">
              {[formatAddress(deal.city), deal.state, deal.zipCode].filter(Boolean).join(", ")}
            </p>
          </div>
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
                {canDelete && (
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive gap-2 cursor-pointer"
                    onSelect={onDelete}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete Deal
                  </DropdownMenuItem>
                )}
                {canRequestContact && (
                  <DropdownMenuItem
                    className="gap-2 cursor-pointer"
                    onSelect={() => console.log("Requesting Contact Info")}
                  >
                    <Phone className="h-4 w-4" />
                    Request Contact Info
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
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

        {(price !== null) && (
          <div className="flex items-center gap-3 text-sm">
            {price !== null && price > 0 && (
              <span className="font-semibold text-foreground text-base">
                ${price.toLocaleString()}
              </span>
            )}
            {deal.propertyType && (
              <span className="text-muted-foreground truncate">{deal.propertyType}</span>
            )}
          </div>
        )}

        <div className="inline-flex space-x-2 text-sm text-muted-foreground/70 leading-tight">
          <span>{postedAt}</span>
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
  const { toast } = useToast();
  const { user, isPro, isAdminOrOwner } = useAuth();
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
        <div className="flex flex-col gap-4 max-w-3xl">
          {deals.map((deal) => {
            const isOwnerOfDeal = isPro && user?.id === deal.userId;
            const canDelete = isAdminOrOwner || isOwnerOfDeal;
            const canRequestContact = isAdminOrOwner || !isOwnerOfDeal;
            return (
              <DealCard
                key={deal.id}
                deal={deal}
                canDelete={canDelete}
                canRequestContact={canRequestContact}
                onDelete={() => setDeleteConfirm({ dealId: deal.id, address: deal.address ?? "this deal" })}
              />
            );
          })}
        </div>
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

      <AddDeal open={showAddDeal} onClose={() => setShowAddDeal(false)} />
    </div>
  );
}
