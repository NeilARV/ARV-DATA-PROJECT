import { MapPin, Phone, Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Vendor } from "@/types/vendors";

type VendorCardProps = {
    vendor: Vendor;
    isSelected?: boolean;
    onClick: (vendor: Vendor) => void;
};

export function VendorCard({ vendor, isSelected, onClick }: VendorCardProps) {
    const locationLine1 = vendor.address ?? null;
    const locationLine2 = [vendor.city, vendor.state, vendor.zipCode].filter(Boolean).join(", ") || null;

    return (
        <div
            className={`p-4 min-w-0 bg-card border rounded-xl transition-colors cursor-pointer ${
                isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
            }`}
            onClick={() => onClick(vendor)}
        >
            <h3 className="font-semibold text-base text-foreground leading-tight mb-1">
                {vendor.name}
            </h3>

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
    );
}
