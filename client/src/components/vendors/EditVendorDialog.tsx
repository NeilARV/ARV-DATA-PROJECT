import { useState } from "react";
import { X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { updateVendor, fetchCategories } from "@/api/vendors.api";
import { useToast } from "@/hooks/use-toast";
import { formatPhoneNumber } from "@shared/utils/formatPhoneNumber";
import type { Vendor } from "@/types/vendors";

type EditVendorDialogProps = {
    open: boolean;
    onClose: () => void;
    vendor: Vendor;
};

const selectClass =
    "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-muted-foreground cursor-pointer";

export function EditVendorDialog({ open, onClose, vendor }: EditVendorDialogProps) {
    const [name, setName]               = useState(vendor.name);
    const [description, setDescription] = useState(vendor.description ?? "");
    const [address, setAddress]         = useState(vendor.address     ?? "");
    const [city, setCity]               = useState(vendor.city        ?? "");
    const [state, setState]             = useState(vendor.state       ?? "");
    const [zipCode, setZipCode]         = useState(vendor.zipCode     ?? "");
    const [phone, setPhone]             = useState(formatPhoneNumber(vendor.phone ?? ""));
    const [website, setWebsite]         = useState(vendor.website     ?? "");
    const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>(
        vendor.categories.map((c) => c.id)
    );

    const queryClient = useQueryClient();
    const { toast }   = useToast();

    const { data: categoriesData } = useQuery({
        queryKey: ["categories"],
        queryFn:  fetchCategories,
        staleTime: 5 * 60 * 1000,
    });

    const mutation = useMutation({
        mutationFn: () =>
            updateVendor(vendor.id, {
                name,
                description: description.trim() || null,
                address:     address.trim()     || null,
                city:        city.trim()         || null,
                state:       state.trim()        || null,
                zipCode:     zipCode.trim()      || null,
                phone:       phone.trim()        || null,
                website:     website.trim()      || null,
                categoryIds: selectedCategoryIds,
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["vendors"] });
            queryClient.invalidateQueries({ queryKey: ["vendors-for-post"] });
            queryClient.invalidateQueries({ queryKey: ["categories"] });
            toast({ title: "Vendor updated", description: "Changes have been saved." });
            onClose();
        },
        onError: () => {
            toast({ title: "Error", description: "Failed to update vendor.", variant: "destructive" });
        },
    });

    const handleClose = () => {
        if (mutation.isPending) return;
        onClose();
    };

    const addCategory = (id: number) =>
        setSelectedCategoryIds((prev) => (prev.includes(id) ? prev : [...prev, id]));

    const removeCategory = (id: number) =>
        setSelectedCategoryIds((prev) => prev.filter((c) => c !== id));

    const availableCategories = (categoriesData ?? []).filter((c) => !selectedCategoryIds.includes(c.id));

    return (
        <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Edit Vendor</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Name */}
                    <div className="space-y-1.5">
                        <Label htmlFor="ev-name">Name <span className="text-destructive">*</span></Label>
                        <Input id="ev-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Business name" />
                    </div>

                    {/* Description */}
                    <div className="space-y-1.5">
                        <Label htmlFor="ev-desc">Description</Label>
                        <Textarea id="ev-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of services" rows={3} />
                    </div>

                    {/* Address / City / State / Zip */}
                    <div className="space-y-1.5">
                        <Label htmlFor="ev-address">Address</Label>
                        <Input id="ev-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St" />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-2 space-y-1.5">
                            <Label htmlFor="ev-city">City</Label>
                            <Input id="ev-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="San Diego" />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="ev-state">State</Label>
                            <Input id="ev-state" value={state} onChange={(e) => setState(e.target.value)} placeholder="CA" maxLength={2} />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="ev-zip">Zip Code</Label>
                        <Input id="ev-zip" value={zipCode} onChange={(e) => setZipCode(e.target.value)} placeholder="92101" maxLength={10} />
                    </div>

                    {/* Phone / Website */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="ev-phone">Phone</Label>
                            <Input id="ev-phone" value={phone} onChange={(e) => setPhone(formatPhoneNumber(e.target.value))} placeholder="(619) 555-0100" />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="ev-website">Website</Label>
                            <Input id="ev-website" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="example.com" />
                        </div>
                    </div>

                    {/* Categories */}
                    <div className="space-y-1.5">
                        <Label>Categories <span className="text-destructive">*</span></Label>
                        {availableCategories.length > 0 && (
                            <select
                                value=""
                                onChange={(e) => { if (e.target.value) addCategory(Number(e.target.value)); }}
                                className={selectClass}
                            >
                                <option value="">Add a category...</option>
                                {availableCategories.map((cat) => (
                                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                                ))}
                            </select>
                        )}
                        {selectedCategoryIds.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                                {selectedCategoryIds.map((id) => {
                                    const cat = categoriesData?.find((c) => c.id === id)
                                        ?? vendor.categories.find((c) => c.id === id);
                                    return cat ? (
                                        <span key={id} className="inline-flex items-center gap-1 bg-secondary text-secondary-foreground text-xs px-2 py-1 rounded-md">
                                            {cat.name}
                                            <button type="button" onClick={() => removeCategory(id)} className="hover:text-destructive transition-colors">
                                                <X className="w-3 h-3" />
                                            </button>
                                        </span>
                                    ) : null;
                                })}
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={handleClose} disabled={mutation.isPending}>
                            Cancel
                        </Button>
                        <Button
                            onClick={() => mutation.mutate()}
                            disabled={!name.trim() || selectedCategoryIds.length === 0 || mutation.isPending}
                        >
                            {mutation.isPending ? "Saving..." : "Save"}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
