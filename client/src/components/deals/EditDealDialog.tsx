import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { dealFormSchema } from "@database/inserts/deals.insert";
import type { DealFormValues } from "@database/inserts/deals.insert";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Textarea } from "@/components/ui/textarea";
import AppDialog from "@/components/modals/Dialog";
import DealFormFields, { EDIT_DEAL_TYPES } from "@/components/deals/DealFormFields";

type EditDealDialogProps = {
    deal: DealToEdit;
    open: boolean;
    onClose: () => void;
};

export default function EditDealDialog({ deal, open, onClose }: EditDealDialogProps) {
    const { toast } = useToast();
    const { isAdmin, isOwner, isRelationshipManager } = useAuth();
    const canEditAdminNotes = isAdmin || isOwner;
    const canEditPrivilegedFields = isAdmin || isOwner || isRelationshipManager;
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
            notes:             deal.notes        ?? "",
            adminNotes:        deal.adminNotes    ?? "",
            sendNotifications: true,
            isArvExclusive:    deal.isArvExclusive ?? false,
            onBehalfOfEmail:   deal.onBehalfOfEmail ?? undefined,
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
                notes:             data.notes?.trim() || null,
                adminNotes:        data.adminNotes?.trim() || null,
                photosUrl:         photosUrl.trim() || null,
                links:             links.filter((u) => { try { new URL(u); return true; } catch { return false; } }),
                sendNotifications: data.sendNotifications,
                isArvExclusive:    data.isArvExclusive,
                onBehalfOfEmail:   data.onBehalfOfEmail || null,
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
        <AppDialog open={open} onClose={handleClose} className="max-w-[350px] sm:max-w-lg lg:max-w-2xl">
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

                    {canEditAdminNotes && (
                        <FormField
                            control={form.control}
                            name="adminNotes"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                                        Internal Note (admin only)
                                    </FormLabel>
                                    <FormControl>
                                        <Textarea
                                            {...field}
                                            placeholder="Internal notes visible only to admins and owners..."
                                            className="resize-none text-sm"
                                            rows={2}
                                        />
                                    </FormControl>
                                </FormItem>
                            )}
                        />
                    )}

                    {canEditPrivilegedFields && (
                        <>
                            <FormField
                                control={form.control}
                                name="onBehalfOfEmail"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                                            On Behalf Of (admin only)
                                        </FormLabel>
                                        <FormControl>
                                            <Input
                                                {...field}
                                                type="email"
                                                placeholder="client@example.com"
                                                value={field.value ?? ""}
                                            />
                                        </FormControl>
                                        <p className="text-xs text-muted-foreground">
                                            Client email — receives contact requests instead of the poster
                                        </p>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="isArvExclusive"
                                render={({ field }) => (
                                    <FormItem className="flex items-center gap-2 space-y-0">
                                        <FormControl>
                                            <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                                        </FormControl>
                                        <FormLabel className="font-normal cursor-pointer">
                                            ARV Exclusive deal
                                        </FormLabel>
                                    </FormItem>
                                )}
                            />
                        </>
                    )}

                    <FormField
                        control={form.control}
                        name="sendNotifications"
                        render={({ field }) => (
                            <FormItem className="flex items-center gap-2 space-y-0">
                                <FormControl>
                                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
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
