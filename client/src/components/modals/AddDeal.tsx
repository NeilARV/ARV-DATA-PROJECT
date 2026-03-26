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
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { manualPropertyEntrySchema } from "@database/inserts/properties.insert";
import type { ManualPropertyEntry } from "@database/types";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import AppDialog from "@/components/modals/Dialog";

interface AddDealProps {
  open: boolean;
  onClose: () => void;
}

export default function AddDeal({ open, onClose }: AddDealProps) {
  const { toast } = useToast();
  const { user } = useAuth();

  const form = useForm<ManualPropertyEntry>({
    resolver: zodResolver(manualPropertyEntrySchema),
    defaultValues: { address: "", city: "", state: "", zipCode: "", dealType: null },
  });

  const postDeal = useMutation({
    mutationFn: async (data: ManualPropertyEntry) => {
      const res = await apiRequest("POST", "/api/deals", {
        address: data.address,
        city: data.city,
        state: data.state,
        zipCode: data.zipCode,
        userId: user?.id,
        dealType: data.dealType,
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
      const msg = is403
        ? "You do not have the required role to add a deal. Please contact neil@arvfinance.com to request access."
        : err.message || "Failed to post deal";
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const handleClose = () => {
    if (postDeal.isPending) return;
    form.reset();
    onClose();
  };

  return (
    <AppDialog open={open} onClose={handleClose} className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Post a Deal</DialogTitle>
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

          <FormField
            control={form.control}
            name="dealType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Deal Type</FormLabel>
                <Select
                  value={field.value ?? "none"}
                  onValueChange={(v) => field.onChange(v === "none" ? null : v)}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="z-[10000]">
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="agent">Agent Deal</SelectItem>
                    <SelectItem value="wholesale">Wholesale Deal</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
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
  );
}
