import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Handshake, Plus, ArrowLeft, Loader2, Bed, Bath, Maximize2, MoreVertical, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { manualPropertyEntrySchema } from "@database/inserts/properties.insert";
import type { ManualPropertyEntry } from "@database/types";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { getStreetViewUrl } from "@/lib/streetView";
import { formatAddress } from "@shared/utils/formatAddress";
import { formatDate } from "@/utils/date";

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
  dateSold: string | null;
  msaId: number;
  msaName: string | null;
  userId: string;
  userEmail: string | null;
  userFirstName: string | null;
  userLastName: string | null;
}

type View = "feed" | "form";

// ── Individual deal card with lazy street view image ──────────────────────────
function DealCard({ deal, onDelete }: { deal: Deal; onDelete?: () => void }) {

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
  const postedBy = `${deal.userFirstName} ${deal.userLastName}`
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
      <div className="w-36 shrink-0 bg-muted flex items-center justify-center self-stretch">
        {imageLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground/40" />
        ) : imageUrl ? (
          <img src={imageUrl} alt={deal.address ?? ""} className="w-full h-full object-cover" />
        ) : (
          <Handshake className="w-6 h-6 text-muted-foreground/30" />
        )}
      </div>

      {/* Right: property details */}
      <div className="flex-1 min-w-0 pl-4 py-2 flex flex-col gap-1.5">
        {/* Address + optional 3-dot menu */}
        <div className="flex items-start justify-between gap-1 min-w-0">
          <div className="min-w-0">
            <p className="font-medium text-sm leading-tight truncate">
              {formatAddress(deal.address) ?? "Unknown address"}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {[formatAddress(deal.city), deal.state, deal.zipCode].filter(Boolean).join(", ")}
            </p>
          </div>
          {onDelete && (
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
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive gap-2 cursor-pointer"
                  onSelect={onDelete}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Deal
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Structure */}
        {(beds !== null || baths !== null || sqft !== null) && (
          <div className="flex items-center gap-3 text-xs text-foreground">
            {beds !== null && (
              <span className="flex items-center gap-1">
                <Bed className="w-3.5 h-3.5 text-muted-foreground" />
                {beds} bd
              </span>
            )}
            {baths !== null && (
              <span className="flex items-center gap-1">
                <Bath className="w-3.5 h-3.5 text-muted-foreground" />
                {baths} ba
              </span>
            )}
            {sqft !== null && (
              <span className="flex items-center gap-1">
                <Maximize2 className="w-3.5 h-3.5 text-muted-foreground" />
                {sqft.toLocaleString()} sqft
              </span>
            )}
          </div>
        )}

        {/* Price + date */}
        {(price !== null || deal.dateSold) && (
          <div className="flex items-center gap-2 text-xs">
            {price !== null && price > 0 && (
              <span className="font-semibold text-foreground">
                ${price.toLocaleString()}
              </span>
            )}
            {deal.dateSold && (
              <span className="text-muted-foreground">{formatDate(deal.dateSold)}</span>
            )}
            {deal.propertyType && (
              <span className="text-muted-foreground truncate">{deal.propertyType}</span>
            )}
          </div>
        )}

        {/* Posted by + timestamp */}
        <div className="inline-flex space-x-2 text-xs text-muted-foreground/70 mt-0.5 leading-tight">
          <span className="font-medium">{postedBy}</span>
          <span>|</span>
          <span className="block">{postedAt}</span>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
type Tab = "all" | "mine";

export default function DealsContent({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<View>("feed");
  const [tab, setTab] = useState<Tab>("all");
  const [deleteConfirm, setDeleteConfirm] = useState<{ dealId: number; address: string } | null>(null);
  const { toast } = useToast();
  const { user, isPro, isAdminOrOwner } = useAuth();

  const queryUrl = tab === "mine" && user?.id
    ? `/api/deals?userId=${user.id}`
    : "/api/deals";

  const { data: deals = [], isLoading } = useQuery<Deal[]>({
    queryKey: ["/api/deals", tab === "mine" ? user?.id : null],
    staleTime: 0,
    queryFn: async () => {
      const res = await apiRequest("GET", queryUrl);
      return res.json();
    },
  });

  const form = useForm<ManualPropertyEntry>({
    resolver: zodResolver(manualPropertyEntrySchema),
    defaultValues: { address: "", city: "", state: "", zipCode: "" },
  });

  const postDeal = useMutation({
    mutationFn: async (data: ManualPropertyEntry) => {
      const res = await apiRequest("POST", "/api/deals", {
        address: data.address,
        city: data.city,
        state: data.state,
        zipCode: data.zipCode,
        userId: user?.id,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Deal Posted", description: "Your deal has been added to the feed." });
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
      form.reset();
      setView("feed");
    },
    onError: (err: any) => {
      const is403 = typeof err?.message === "string" && err.message.startsWith("403:");
      const msg = is403
        ? "You do not have the required role to add a deal. Please contact neil@arvfinance.com to request access."
        : err.message || "Failed to post deal";
      toast({ title: "Error", description: msg, variant: "destructive" });
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

  // ── Form view ────────────────────────────────────────────────────────────────
  if (view === "form") {
    return (
      <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <button
              type="button"
              onClick={() => { setView("feed"); form.reset(); }}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            Post a Deal
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((d) => postDeal.mutate(d))}
            className="space-y-4 mt-2"
          >
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="123 Main St" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="San Diego" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="state"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>State *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="CA" maxLength={2} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="zipCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Zip Code *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="92126" maxLength={5} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => { setView("feed"); form.reset(); }}
                disabled={postDeal.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={postDeal.isPending || !user?.id}>
                {postDeal.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Posting...
                  </>
                ) : (
                  "Post Deal"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </>
    );
  }

  // ── Feed view ────────────────────────────────────────────────────────────────
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center justify-between text-xl">
          <span className="flex items-center gap-2">
            <Handshake className="w-5 h-5 text-primary" />
            Deal Feed
          </span>
          <Button size="sm" onClick={() => setView("form")} className="gap-1">
            <Plus className="w-4 h-4" />
            Add Deal
          </Button>
        </DialogTitle>
      </DialogHeader>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="all">All Deals</TabsTrigger>
          <TabsTrigger value="mine">Your Deals</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mt-2 flex-1 min-h-0 flex flex-col gap-3 overflow-y-auto pr-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading deals...
          </div>
        ) : deals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
            <Handshake className="w-12 h-12 text-muted-foreground/40" />
            {tab === "mine" ? (
              <>
                <p className="text-lg font-medium text-muted-foreground">No deals posted yet</p>
                <p className="text-sm text-muted-foreground/60">Your posted deals will appear here.</p>
              </>
            ) : (
              <>
                <p className="text-lg font-medium text-muted-foreground">No deals yet</p>
                <p className="text-sm text-muted-foreground/60">Be the first to post a deal to the feed.</p>
              </>
            )}
          </div>
        ) : (
          deals.map((deal) => {
            const canDelete = tab === "all"
              ? isAdminOrOwner
              : isAdminOrOwner || (isPro && user?.id === deal.userId);
            return (
              <DealCard
                key={deal.id}
                deal={deal}
                onDelete={canDelete ? () => setDeleteConfirm({ dealId: deal.id, address: deal.address ?? "this deal" }) : undefined}
              />
            );
          })
        )}
      </div>

      <div className="pt-3 border-t border-border">
        <Button variant="outline" className="w-full" onClick={onClose}>
          Close
        </Button>
      </div>

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
    </>
  );
}
