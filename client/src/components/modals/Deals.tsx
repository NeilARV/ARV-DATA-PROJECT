import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Handshake, Plus, ArrowLeft, Loader2, MapPin } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { manualPropertyEntrySchema } from "@database/inserts/properties.insert";
import type { ManualPropertyEntry } from "@database/types";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

interface Deal {
  id: number;
  createdAt: string;
  propertyId: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  msaId: number;
  msaName: string | null;
  userId: string;
  userEmail: string | null;
  userFirstName: string | null;
  userLastName: string | null;
}

type View = "feed" | "form";

export default function DealsContent({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<View>("feed");
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: deals = [], isLoading } = useQuery<Deal[]>({
    queryKey: ["/api/deals"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/deals");
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
      const msg = err.message || "Failed to post deal";
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  // ── Form view ──────────────────────────────────────────────────────────────
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
              <Button type="submit" className="flex-1" disabled={postDeal.isPending}>
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

  // ── Feed view ──────────────────────────────────────────────────────────────
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

      <div className="mt-2 flex flex-col gap-3 max-h-[60vh] overflow-y-auto pr-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading deals...
          </div>
        ) : deals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
            <Handshake className="w-12 h-12 text-muted-foreground/40" />
            <p className="text-lg font-medium text-muted-foreground">No deals yet</p>
            <p className="text-sm text-muted-foreground/60">
              Be the first to post a deal to the feed.
            </p>
          </div>
        ) : (
          deals.map((deal) => (
            <div
              key={deal.id}
              className="rounded-lg border border-border p-4 flex flex-col gap-1 bg-card"
            >
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-sm leading-tight">
                    {deal.address ?? "Unknown address"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[deal.city, deal.state, deal.zipCode].filter(Boolean).join(", ")}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
                <span>{deal.msaName ?? `MSA ${deal.msaId}`}</span>
                <span>
                  {new Date(deal.createdAt).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              {(deal.userFirstName || deal.userEmail) && (
                <p className="text-xs text-muted-foreground/70 mt-0.5">
                  Posted by{" "}
                  {deal.userFirstName
                    ? `${deal.userFirstName} ${deal.userLastName ?? ""}`.trim()
                    : deal.userEmail}
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </>
  );
}
