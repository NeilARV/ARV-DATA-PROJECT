import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Plus } from "lucide-react";
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

function isValidUrl(url: string): boolean {
  try { new URL(url); return true; } catch { return false; }
}
import { Checkbox } from "@/components/ui/checkbox";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { dealFormSchema } from "@database/inserts/deals.insert";
import type { DealFormValues } from "@database/inserts/deals.insert";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useAuth } from "@/hooks/use-auth";
import AppDialog from "@/components/modals/Dialog";
import ContactContent from "@/components/modals/Contact";

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
  { value: "agent", label: "Agent Deal" },
  { value: "wholesale", label: "Wholesale Deal" },
]

interface AddDealProps {
  open: boolean;
  onClose: () => void;
}

export default function AddDeal({ open, onClose }: AddDealProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [showContact, setShowContact] = useState(false);
  const [links, setLinks] = useState<string[]>([]);

  const form = useForm<DealFormValues>({
    resolver: zodResolver(dealFormSchema),
    defaultValues: {
      address: "",
      city: "",
      state: "",
      zipCode: "",
      price: undefined,
      potentialARV: undefined,
      dealType: "agent",
      beds: undefined,
      baths: undefined,
      sqft: undefined,
      propertyType: undefined,
      notes: "",
      sendNotifications: true,
    },
  });

  // Watch address to determine whether to show manual property detail fields
  const addressValue = useWatch({ control: form.control, name: "address" });
  const hasFullAddress =
    typeof addressValue === "string" && /^\d+[a-zA-Z]?\s+/i.test(addressValue.trim());

  const postDeal = useMutation({
    mutationFn: async (data: DealFormValues) => {
      const res = await apiRequest("POST", "/api/deals", {
        address:      data.address?.trim() || undefined,
        city:         data.city,
        state:        data.state,
        zipCode:      data.zipCode,
        userId:       user?.id,
        dealType:     data.dealType,
        price:        data.price,
        potentialARV:          data.potentialARV,
        beds:         data.beds,
        baths:        data.baths,
        sqft:         data.sqft,
        propertyType:      data.propertyType,
        notes:             data.notes?.trim() || undefined,
        sendNotifications: data.sendNotifications,
        links:             links.filter(isValidUrl),
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Deal Posted", description: "Your deal has been added to the feed." });
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
      form.reset();
      onClose();
    },
    onError: (err: any) => {
      const is403 = typeof err?.message === "string" && err.message.startsWith("403:");
      if (is403) {
        toast({
          title: "Upgrade Required",
          description: "Upgrade your account to access this feature.",
          variant: "destructive",
          action: (
            <ToastAction altText="Contact us" onClick={() => setShowContact(true)}>
              Contact Us
            </ToastAction>
          ),
        });
      } else {
        toast({ title: "Error", description: err.message || "Failed to post deal", variant: "destructive" });
      }
    },
  });

  const handleClose = () => {
    if (postDeal.isPending) return;
    form.reset();
    setLinks([]);
    onClose();
  };

  return (
    <>
      <AppDialog open={open} onClose={handleClose} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Post a Deal</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((d) => postDeal.mutate(d))}
            className="space-y-4 mt-2"
          >
            {/* Scrollable region: all fields except notification checkbox and buttons */}
            <div className="overflow-y-auto max-h-[50dvh] space-y-4 pl-1 pr-5 pb-1">

              {/* Address (optional) */}
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

            {/* ARV */}
            <FormField
              control={form.control}
              name="potentialARV"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ARV <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
                      min={1}
                      placeholder="425000"
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

              {/* Manual property details — shown only when no street address is provided */}
              {!hasFullAddress && (
                <>
                  <p className="text-xs text-muted-foreground">
                    Property details are required when a full street address (including house number) is not provided.
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

              {hasFullAddress && (
                <p className="text-xs text-muted-foreground">
                  Property details will be fetched automatically from the full street address.
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
                        placeholder="Add any additional details about this deal..."
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
                  Comparable Sale Links <span className="text-muted-foreground font-normal">(optional, max 3)</span>
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

            {/* Send Notification Email */}
            <FormField
              control={form.control}
              name="sendNotifications"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel className="font-normal cursor-pointer">
                    Send notification email
                  </FormLabel>
                </FormItem>
              )}
            />

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={handleClose}
                disabled={postDeal.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={postDeal.isPending || !user?.id}
              >
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
      </AppDialog>

      <AppDialog hideOverlay open={showContact} onClose={() => setShowContact(false)} className="max-w-lg">
        {showContact && (
          <ContactContent
            onClose={() => setShowContact(false)}
            onSuccess={() => {
              toast({ title: "Request Received", description: "We will get back to you shortly." });
            }}
            defaultSubject="Upgrade Account"
            defaultFirstName={user?.firstName}
            defaultLastName={user?.lastName}
            defaultEmail={user?.email}
            defaultPhone={user?.phone}
            defaultMessage="I would like to upgrade my account to access the deal feature."
          />
        )}
      </AppDialog>
    </>
  );
}
