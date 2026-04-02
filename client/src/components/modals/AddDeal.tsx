import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
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
import { ToastAction } from "@/components/ui/toast";
import { useAuth } from "@/hooks/use-auth";
import AppDialog from "@/components/modals/Dialog";
import ContactContent from "@/components/modals/Contact";

const PROPERTY_TYPES = [
  "Single Family",
  "Condo",
  "Townhouse",
  "Multi-Family",
  "Land",
  "Commercial",
  "Other",
];

interface AddDealProps {
  open: boolean;
  onClose: () => void;
}

export default function AddDeal({ open, onClose }: AddDealProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [showContact, setShowContact] = useState(false);

  const form = useForm<DealFormValues>({
    resolver: zodResolver(dealFormSchema),
    defaultValues: {
      address: "",
      city: "",
      state: "",
      zipCode: "",
      price: undefined,
      dealType: "agent",
      beds: undefined,
      baths: undefined,
      sqft: undefined,
      propertyType: undefined,
    },
  });

  // Watch address to determine whether to show manual property detail fields
  const addressValue = useWatch({ control: form.control, name: "address" });
  const hasAddress = typeof addressValue === "string" && addressValue.trim().length > 0;

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
        beds:         data.beds,
        baths:        data.baths,
        sqft:         data.sqft,
        propertyType: data.propertyType,
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
    onClose();
  };

  return (
    <>
      <AppDialog open={open} onClose={handleClose} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Post a Deal</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((d) => postDeal.mutate(d))}
            className="space-y-4 mt-2"
          >
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

            {/* Price (always required) */}
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
                      <SelectItem value="agent">Agent Deal</SelectItem>
                      <SelectItem value="wholesale">Wholesale Deal</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Manual property details — shown only when no street address is provided */}
            {!hasAddress && (
              <>
                <p className="text-xs text-muted-foreground -mb-1">
                  Property details are required when no street address is entered.
                </p>

                {/* Beds + Baths */}
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
                            onChange={(e) => field.onChange(e.target.value)
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Sqft */}
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
                          onChange={(e) => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Property Type */}
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

      <AppDialog open={showContact} onClose={() => setShowContact(false)} className="max-w-lg">
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
            defaultMessage="I would like to upgrade my account to access the deal feature."
          />
        )}
      </AppDialog>
    </>
  );
}
