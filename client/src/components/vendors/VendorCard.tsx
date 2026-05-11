import { MapPin, Phone, Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Vendor } from "@/types/vendors";

type VendorCardProps = {
    vendor: Vendor;
    isSelected?: boolean;
    onClick: (vendor: Vendor) => void;
};

export function VendorCard({ vendor, isSelected, onClick }: VendorCardProps) {
    return (
        <button
            className={`w-full text-left p-4 bg-card border rounded-xl transition-colors cursor-pointer ${
                isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-accent"
            }`}
            onClick={() => onClick(vendor)}
        >
            <h3 className="font-semibold text-sm text-foreground leading-tight mb-1">{vendor.name}</h3>

            {vendor.description && (
                <p className="text-xs text-muted-foreground mb-3 line-clamp-2 leading-relaxed">
                    {vendor.description}
                </p>
            )}

            <div className="space-y-1 mb-3">
                {(vendor.city || vendor.state) && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        <span>{[vendor.city, vendor.state].filter(Boolean).join(", ")}</span>
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
                        <span className="truncate">{vendor.website.replace(/^https?:\/\//, "")}</span>
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
        </button>
    );
}
