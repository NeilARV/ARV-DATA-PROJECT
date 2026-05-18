import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { Form } from "@/components/ui/form";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { dealFormSchema } from "@database/inserts/deals.insert";
import type { DealFormValues } from "@database/inserts/deals.insert";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import AppDialog from "@/components/modals/Dialog";
import DealFormFields, { EDIT_DEAL_TYPES } from "@/components/deals/DealFormFields";

type EditDealDialogProps = {
    deal: DealToEdit;
    open: boolean;
    onClose: () => void;
};

export default function EditDealDialog({ deal, open, onClose }: EditDealDialogProps) {
    const { toast } = useToast();
    const [links, setLinks] = useState<string[]>(deal.links ?? []);
    const [photosUrl, setPhotosUrl] = useState(deal.photosUrl ?? "");

    const form = useForm<DealFormValues>({
        resolver: zodResolver(dealFormSchema),
        defaultValues: {
            address:       deal.address      ?? "",
            city:          deal.city         ?? "",
            state:         deal.state        ?? "",
            zipCode:       deal.zipCode      ?? "",
            price:         deal.price        != null ? Number(deal.price) : undefined,
            dealType:      deal.dealType,
            beds:          deal.beds         ?? undefined,
            baths:         deal.baths        ? Number(deal.baths) : undefined,
            sqft:          deal.sqft         ?? undefined,
            propertyType:  deal.propertyType ?? undefined,
            potentialARV:  deal.potentialARV  ? Number(deal.potentialARV)  : undefined,
            closeOfEscrow: deal.closeOfEscrow
                               ? (() => { const [y, m, d] = deal.closeOfEscrow!.split("-"); return `${m}/${d}/${y}`; })()
                               : undefined,
            estimatedBudget:   deal.estimatedBudget ?? undefined,
            notes:         deal.notes        ?? "",
        },
    });

    const addressValue = useWatch({ control: form.control, name: "address" });
    const hasFullAddress = typeof addressValue === "string" && /^\d+[a-zA-Z]?\s+/i.test(addressValue.trim());

    const updateDeal = useMutation({
        mutationFn: async (data: DealFormValues) => {
            const res = await apiRequest("PATCH", `/api/deals/${deal.id}`, {
                address:       data.address?.trim() || null,
                city:          data.city,
                state:         data.state,
                zipCode:       data.zipCode,
                price:         data.price        ?? null,
                dealType:      data.dealType,
                beds:          data.beds         ?? null,
                baths:         data.baths        ?? null,
                sqft:          data.sqft         ?? null,
                propertyType:  data.propertyType ?? null,
                potentialARV:  data.potentialARV  ?? null,
                closeOfEscrow: data.closeOfEscrow
                                   ? (() => { const [m, d, y] = data.closeOfEscrow!.split("/"); return `${y}-${m}-${d}`; })()
                                   : null,
                estimatedBudget:   data.estimatedBudget ?? null,
                notes:         data.notes?.trim() || null,
                photosUrl:     photosUrl.trim() || null,
                links:         links.filter((u) => { try { new URL(u); return true; } catch { return false; } }),
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
                    <DealFormFields
                        control={form.control}
                        dealTypes={EDIT_DEAL_TYPES}
                        hasFullAddress={hasFullAddress}
                        links={links}
                        onLinksChange={setLinks}
                        photosUrl={photosUrl}
                        onPhotosUrlChange={setPhotosUrl}
                    />

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
