import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Plus } from "lucide-react";

function isValidUrl(url: string): boolean {
  try { new URL(url); return true; } catch { return false; }
}
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { dealFormSchema } from "@database/inserts/deals.insert";
import type { DealFormValues } from "@database/inserts/deals.insert";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import AppDialog from "@/components/modals/Dialog";

const PROPERTY_TYPES = [
  "Single Family",
  "Townhouse",
  "Condo",
  "Duplex",
  "Triplex",
  "Fourplex",
  "Vacant Land",
  "Other",
];

const DEAL_TYPES = [
  { value: "agent",     label: "Agent Deal" },
  { value: "wholesale", label: "Wholesale Deal" },
  { value: "sold",      label: "Sold Deal" },
];

interface UpdateDealProps {
  deal: DealToEdit;
  open: boolean;
  onClose: () => void;
}

export default function UpdateDeal({ deal, open, onClose }: UpdateDealProps) {
  const { toast } = useToast();
  const [links, setLinks] = useState<string[]>(deal.links ?? []);

  const form = useForm<DealFormValues>({
    resolver: zodResolver(dealFormSchema),
    defaultValues: {
      address:      deal.address      ?? "",
      city:         deal.city         ?? "",
      state:        deal.state        ?? "",
      zipCode:      deal.zipCode      ?? "",
      price:        deal.price        ? Number(deal.price) : undefined,
      dealType:     deal.dealType,
      beds:         deal.beds         ?? undefined,
      baths:        deal.baths        ? Number(deal.baths) : undefined,
      sqft:         deal.sqft         ?? undefined,
      propertyType: deal.propertyType ?? undefined,
      potentialARV: deal.potentialARV ? Number(deal.potentialARV) : undefined,
      notes:        deal.notes        ?? "",
    },
  });

  const addressValue = useWatch({ control: form.control, name: "address" });
  const hasAddress = typeof addressValue === "string" && addressValue.trim().length > 0;

  const updateDeal = useMutation({
    mutationFn: async (data: DealFormValues) => {
      const res = await apiRequest("PATCH", `/api/deals/${deal.id}`, {
        address:      data.address?.trim() || null,
        city:         data.city,
        state:        data.state,
        zipCode:      data.zipCode,
        price:        data.price,
        dealType:     data.dealType,
        beds:         data.beds         ?? null,
        baths:        data.baths        ?? null,
        sqft:         data.sqft         ?? null,
        propertyType: data.propertyType ?? null,
        potentialARV: data.potentialARV ?? null,
        notes:        data.notes?.trim() || null,
        links:        links.filter(isValidUrl),
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Deal Updated", description: "Your deal has been updated." });
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to update deal", variant: "destructive" });
    },
  });

  const handleClose = () => {
    if (updateDeal.isPending) return;
    onClose();
  };

  return (
    <AppDialog open={open} onClose={handleClose} className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Edit Deal</DialogTitle>
      </DialogHeader>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((d) => updateDeal.mutate(d))}
          className="space-y-4 mt-2"
        >
          {/* Scrollable region: all fields except buttons */}
          <div className="overflow-y-auto max-h-[50dvh] space-y-4 pl-1 pr-5 pb-1">

            {/* Street Address (optional) */}
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Street Address <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="123 Main St" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

          {/* City + State */}
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

          {/* Zip Code */}
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

          {/* Price */}
          <FormField
            control={form.control}
            name="price"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Price *</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="number"
                    min={1}
                    placeholder="350000"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Potential ARV */}
          <FormField
            control={form.control}
            name="potentialARV"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Potential ARV <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="number"
                    min={1}
                    placeholder="400000"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Deal Type */}
          <FormField
            control={form.control}
            name="dealType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Deal Type</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="z-[10000]">
                    {DEAL_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

            {/* Manual property details — shown when no street address */}
            {!hasAddress && (
              <>
                <p className="text-xs text-muted-foreground">
                  Property details are required when no street address is entered.
                </p>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="beds"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Beds *</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            min={0}
                            placeholder="3"
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(e.target.value)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="baths"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Baths *</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            min={0}
                            step={0.5}
                            placeholder="2"
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(e.target.value)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="sqft"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Square Feet *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          min={1}
                          placeholder="1500"
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="propertyType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Property Type *</FormLabel>
                      <Select value={field.value ?? ""} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="z-[10000]">
                          {PROPERTY_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            {hasAddress && (
              <p className="text-xs text-muted-foreground">
                Property details (beds, baths, sqft, type) will be fetched automatically from the address.
              </p>
            )}

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Additional details about the deal..."
                      className="resize-none"
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Links */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium leading-none">
                  Links <span className="text-muted-foreground font-normal">(optional, max 3)</span>
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs px-2"
                  onClick={() => setLinks((prev) => [...prev, ""])}
                  disabled={links.length >= 3}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Link
                </Button>
              </div>
              {links.map((link, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={link}
                    onChange={(e) => setLinks((prev) => prev.map((l, idx) => idx === i ? e.target.value : l))}
                    placeholder="https://example.com"
                    className={link.length > 0 && !isValidUrl(link) ? "border-destructive focus-visible:ring-destructive" : ""}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-destructive hover:text-destructive"
                    onClick={() => setLinks((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>

          </div>{/* end scrollable region */}

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={handleClose}
              disabled={updateDeal.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={updateDeal.isPending}
            >
              {updateDeal.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                "Update Deal"
              )}
            </Button>
          </div>
        </form>
      </Form>
    </AppDialog>
  );
}
