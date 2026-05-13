import { useState, useRef, useEffect } from "react";
import { MapPin, Phone, Globe, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteVendor } from "@/api/vendors.api";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import AppDialog from "@/components/modals/Dialog";
import ConfirmationContent from "@/components/modals/Confirmation";
import { EditVendorDialog } from "./EditVendorDialog";
import type { Vendor } from "@/types/vendors";

type VendorCardProps = {
    vendor: Vendor;
    isSelected?: boolean;
    onClick: (vendor: Vendor) => void;
};

export function VendorCard({ vendor, isSelected, onClick }: VendorCardProps) {
    const locationLine1 = vendor.address ?? null;
    const locationLine2 = [vendor.city, vendor.state, vendor.zipCode].filter(Boolean).join(", ") || null;

    const { isAdmin, isOwner } = useAuth();
    const isPrivileged = isAdmin || isOwner;

    const [showMenu, setShowMenu]               = useState(false);
    const [showEditDialog, setShowEditDialog]   = useState(false);
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
        },
        onError: () => {
            toast({ title: "Error", description: "Failed to delete vendor.", variant: "destructive" });
        },
    });

    return (
        <>
            <div
                className={`p-4 min-w-0 bg-card border rounded-xl transition-colors cursor-pointer ${
                    isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
                }`}
                onClick={() => onClick(vendor)}
            >
                {/* Name row with optional 3-dot menu */}
                <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="font-semibold text-base text-foreground leading-tight">
                        {vendor.name}
                    </h3>
                    {isPrivileged && (
                        <div className="relative flex-shrink-0" ref={menuRef}>
                            <button
                                onClick={(e) => { e.stopPropagation(); setShowMenu((v) => !v); }}
                                className="p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground"
                            >
                                <MoreVertical className="w-3.5 h-3.5" />
                            </button>
                            {showMenu && (
                                <div className="absolute right-0 top-full mt-1 w-36 bg-background border border-border rounded-md shadow-lg z-10">
                                    <button
                                        className="w-full text-left px-3 py-2 text-xs hover:bg-muted flex items-center gap-2"
                                        onClick={(e) => { e.stopPropagation(); setShowEditDialog(true); setShowMenu(false); }}
                                    >
                                        <Pencil className="w-3.5 h-3.5" />
                                        Edit Vendor
                                    </button>
                                    <button
                                        className="w-full text-left px-3 py-2 text-xs hover:bg-muted text-destructive flex items-center gap-2"
                                        onClick={(e) => { e.stopPropagation(); setShowDeleteDialog(true); setShowMenu(false); }}
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        Delete Vendor
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {vendor.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {vendor.description}
                    </p>
                )}

                <div className="space-y-1 mt-4 mb-3">
                    {(locationLine1 || locationLine2) && (
                        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                            <MapPin className="w-3 h-3 flex-shrink-0 mt-0.5" />
                            <span className="leading-relaxed">
                                {locationLine1 && <span className="block">{locationLine1}</span>}
                                {locationLine2 && <span className="block">{locationLine2}</span>}
                            </span>
                        </div>
                    )}
                    {vendor.phone && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Phone className="w-3 h-3 flex-shrink-0" />
                            <span>{vendor.phone}</span>
                        </div>
                    )}
                    {vendor.website && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Globe className="w-3 h-3 flex-shrink-0" />
                            <a
                                href={vendor.website.startsWith("http") ? vendor.website : `https://${vendor.website}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="truncate hover:text-primary transition-colors"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {vendor.website.replace(/^https?:\/\//, "")}
                            </a>
                        </div>
                    )}
                </div>

                {vendor.categories.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                        {vendor.categories.map((cat) => (
                            <Badge key={cat.id} variant="secondary" className="text-xs px-1.5 py-0">
                                {cat.name}
                            </Badge>
                        ))}
                    </div>
                )}
            </div>

            {/* Edit dialog */}
            <EditVendorDialog
                open={showEditDialog}
                onClose={() => setShowEditDialog(false)}
                vendor={vendor}
            />

            {/* Delete confirmation */}
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
