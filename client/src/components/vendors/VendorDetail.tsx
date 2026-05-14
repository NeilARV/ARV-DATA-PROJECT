import { useState, useRef, useEffect } from "react";
import { MapPin, Phone, Globe, CircleUser, MoreVertical, Pencil, Trash2, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteVendor, toggleVendorRecommend } from "@/api/vendors.api";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import AppDialog from "@/components/modals/Dialog";
import ConfirmationContent from "@/components/modals/Confirmation";
import { EditVendorDialog } from "./EditVendorDialog";
import type { Vendor } from "@/types/vendors";

type VendorDetailProps = {
    vendor: Vendor;
    onDeleted: () => void;
};

export function VendorDetail({ vendor, onDeleted }: VendorDetailProps) {
    const locationLine1 = vendor.address ?? null;
    const locationLine2 = [vendor.city, vendor.state, vendor.zipCode].filter(Boolean).join(", ") || null;

    const { isAdmin, isOwner } = useAuth();
    const isPrivileged = isAdmin || isOwner;

    const [showMenu, setShowMenu]                 = useState(false);
    const [showEditDialog, setShowEditDialog]     = useState(false);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    const queryClient = useQueryClient();
    const { toast }   = useToast();

    useEffect(() => {
        if (!showMenu) return;
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setShowMenu(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [showMenu]);

    const deleteMutation = useMutation({
        mutationFn: () => deleteVendor(vendor.id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["vendors"] });
            queryClient.invalidateQueries({ queryKey: ["vendors-for-post"] });
            queryClient.invalidateQueries({ queryKey: ["categories"] });
            toast({ title: "Vendor deleted" });
            setShowDeleteDialog(false);
            onDeleted();
        },
        onError: () => {
            toast({ title: "Error", description: "Failed to delete vendor.", variant: "destructive" });
        },
    });

    const recommendMutation = useMutation({
        mutationFn: () => toggleVendorRecommend(vendor.id),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["vendors"] });
            queryClient.invalidateQueries({ queryKey: ["vendors-recommended"] });
            queryClient.invalidateQueries({ queryKey: ["vendor", vendor.id] });
            toast({ title: data.isRecommended ? "Added to recommended" : "Removed from recommended" });
        },
        onError: () => {
            toast({ title: "Error", description: "Failed to update recommendation.", variant: "destructive" });
        },
    });

    return (
        <>
            {/* Banner placeholder */}
            <div className="h-32 bg-muted flex-shrink-0" />

            {/* Profile section */}
            <div className="px-6 pb-6">
                {/* Avatar + menu row */}
                <div className="flex items-end justify-between -mt-8 mb-4">
                    <div className="p-4 bg-primary/10 border-4 border-background rounded-2xl flex-shrink-0">
                        <CircleUser className="w-12 h-12 text-primary" />
                    </div>
                    {isPrivileged && (
                        <div className="relative mb-1" ref={menuRef}>
                            <button
                                onClick={() => setShowMenu((v) => !v)}
                                className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
                            >
                                <MoreVertical className="w-4 h-4" />
                            </button>
                            {showMenu && (
                                <div className="absolute right-0 top-full mt-1 w-52 bg-background border border-border rounded-md shadow-lg z-10">
                                    <button
                                        className="w-full text-left px-3 py-2 text-xs hover:bg-muted flex items-center gap-2"
                                        onClick={() => { setShowEditDialog(true); setShowMenu(false); }}
                                    >
                                        <Pencil className="w-3.5 h-3.5" />
                                        Edit Vendor
                                    </button>
                                    <button
                                        className="w-full text-left px-3 py-2 text-xs hover:bg-muted flex items-center gap-2"
                                        onClick={() => { recommendMutation.mutate(); setShowMenu(false); }}
                                    >
                                        <Trophy className="w-3.5 h-3.5" />
                                        {vendor.isRecommended ? "Remove from Recommended" : "Add to Recommended"}
                                    </button>
                                    <button
                                        className="w-full text-left px-3 py-2 text-xs hover:bg-muted text-destructive flex items-center gap-2"
                                        onClick={() => { setShowDeleteDialog(true); setShowMenu(false); }}
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        Delete Vendor
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Name + description */}
                <h2 className="text-xl font-bold text-foreground leading-tight">{vendor.name}</h2>
                {vendor.description && (
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{vendor.description}</p>
                )}

                {/* Contact info */}
                {(locationLine1 || locationLine2 || vendor.phone || vendor.website) && (
                    <div className="space-y-2 mt-4">
                        {(locationLine1 || locationLine2) && (
                            <div className="flex items-start gap-2 text-sm text-muted-foreground">
                                <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                <span>
                                    {locationLine1 && <span className="block">{locationLine1}</span>}
                                    {locationLine2 && <span className="block">{locationLine2}</span>}
                                </span>
                            </div>
                        )}
                        {vendor.phone && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Phone className="w-4 h-4 flex-shrink-0" />
                                <span>{vendor.phone}</span>
                            </div>
                        )}
                        {vendor.website && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Globe className="w-4 h-4 flex-shrink-0" />
                                <a
                                    href={vendor.website.startsWith("http") ? vendor.website : `https://${vendor.website}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="hover:text-primary transition-colors"
                                >
                                    {vendor.website.replace(/^https?:\/\//, "")}
                                </a>
                            </div>
                        )}
                    </div>
                )}

                {/* Category badges */}
                {vendor.categories.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-4">
                        {vendor.categories.map((cat) => (
                            <Badge key={cat.id} variant="secondary" className="text-xs px-2 py-0.5">
                                {cat.name}
                            </Badge>
                        ))}
                    </div>
                )}
            </div>

            <EditVendorDialog
                open={showEditDialog}
                onClose={() => setShowEditDialog(false)}
                vendor={vendor}
            />

            <AppDialog open={showDeleteDialog} onClose={() => setShowDeleteDialog(false)}>
                <ConfirmationContent
                    title="Delete Vendor"
                    description={`Are you sure you want to delete "${vendor.name}"? This cannot be undone.`}
                    confirmText="Delete"
                    cancelText="Cancel"
                    variant="destructive"
                    isLoading={deleteMutation.isPending}
                    onClose={() => setShowDeleteDialog(false)}
                    onConfirm={() => deleteMutation.mutate()}
                />
            </AppDialog>
        </>
    );
}
