import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Handshake,
    Loader2,
    Bed,
    Bath,
    Maximize2,
    MoreVertical,
    Trash2,
    Phone,
    Pencil,
    Trophy,
    ChevronDown,
    ChevronUp,
} from "lucide-react";
import { formatAddress } from "@shared/utils/formatAddress";

type DealCardProps = {
    deal: Deal;
    canDelete: boolean;
    canEdit: boolean;
    canRequestContact: boolean;
    isOwner: boolean;
    onDelete: () => void;
    onEdit: () => void;
    onRequestInfo: () => void;
    onTopBuyers: () => void;
}

export default function DealCard({
    deal,
    canDelete,
    canEdit,
    canRequestContact,
    isOwner,
    onDelete,
    onEdit,
    onRequestInfo,
    onTopBuyers,
}: DealCardProps) {
    const [imageUrl, setImageUrl] = useState("");
    const [imageLoading, setImageLoading] = useState(true);
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        if (!deal.streetViewUrl) {
            setImageLoading(false);
            return;
        }
        const img = new Image();
        img.onload = () => { setImageUrl(deal.streetViewUrl!); setImageLoading(false); };
        img.onerror = () => setImageLoading(false);
        img.src = deal.streetViewUrl;
    }, [deal.streetViewUrl]);

    const price = deal.price ? Number(deal.price) : null;
    const potentialARV = deal.potentialARV ? Number(deal.potentialARV) : null;
    const beds = deal.beds ? Number(deal.beds) : null;
    const baths = deal.baths || null;
    const sqft = deal.sqft ? Number(deal.sqft) : null;
    const postedAt = new Date(deal.createdAt).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });

  return (
    <div className="rounded-lg border border-border bg-card flex">
        {/* Left: street view thumbnail */}
        <div className="w-52 shrink-0 bg-muted flex items-center justify-center self-stretch relative rounded-tl-lg rounded-bl-lg overflow-hidden">
                {imageLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground/40" />
                ) : imageUrl ? (
                    <img src={imageUrl} alt={deal.address ?? ""} className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                    <Handshake className="w-8 h-8 text-muted-foreground/30" />
                )}
                <span
                    className="absolute top-2 left-2 text-[11px] font-semibold px-2 py-0.5 rounded shadow-sm"
                    style={
                    deal.dealType === "wholesale"
                        ? { backgroundColor: "#9333EA", color: "#fff" }
                        : deal.dealType === "sold"
                        ? { backgroundColor: "#FF0000", color: "#fff" }
                        : { backgroundColor: "#F97316", color: "#fff" }
                    }
                >
                    {deal.dealType === "wholesale" ? "Wholesale" : deal.dealType === "sold" ? "Sold" : "Agent"}
                </span>
            </div>

        {/* Right: property details + footer */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
            <div className="px-5 py-2.5 flex flex-col gap-2 flex-1">
                <div className="flex items-start justify-between gap-1 min-w-0">
                    <div className="min-w-0">
                        <p className="font-medium text-base leading-tight truncate">
                            {formatAddress(deal.address) ?? "Undisclosed Address"}
                        </p>
                        <p className="text-sm text-muted-foreground truncate mt-0.5">
                            {[formatAddress(deal.city), deal.state, deal.zipCode].filter(Boolean).join(", ")}
                        </p>
                    </div>
                    <div className="flex items-start gap-1 shrink-0">
                        {(canEdit || canDelete) && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                                    >
                                        <MoreVertical className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="z-[10001]">
                                    {canEdit && (
                                    <DropdownMenuItem
                                        className="gap-2 cursor-pointer"
                                        onSelect={onEdit}
                                    >
                                        <Pencil className="h-4 w-4" />
                                        Edit Deal
                                    </DropdownMenuItem>
                                    )}
                                    {canDelete && (
                                    <DropdownMenuItem
                                        className="text-destructive focus:text-destructive gap-2 cursor-pointer"
                                        onSelect={onDelete}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                        Delete Deal
                                    </DropdownMenuItem>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                    </div>
                </div>

                {(beds !== null || baths !== null || sqft !== null) && (
                    <div className="flex items-center gap-4 text-sm text-foreground">
                        {beds !== null && (
                            <span className="flex items-center gap-1.5">
                            <Bed className="w-4 h-4 text-muted-foreground" />
                            {beds} bd
                            </span>
                        )}
                        {baths !== null && (
                            <span className="flex items-center gap-1.5">
                            <Bath className="w-4 h-4 text-muted-foreground" />
                            {baths} ba
                            </span>
                        )}
                        {sqft !== null && (
                            <span className="flex items-center gap-1.5">
                            <Maximize2 className="w-4 h-4 text-muted-foreground" />
                            {sqft.toLocaleString()} sqft
                            </span>
                        )}
                    </div>
                )}

                {(price !== null || potentialARV !== null) && (
                    <div className="flex items-center gap-6 text-sm">
                        {price !== null && price > 0 && (
                            <div className="flex flex-col">
                            <span className="text-sm text-muted-foreground">Purchase Price</span>
                            <span className="text-xl font-bold text-foreground">${price.toLocaleString()}</span>
                            </div>
                        )}
                        {potentialARV !== null && potentialARV > 0 && (
                            <div className="flex flex-col">
                            <span className="text-sm text-muted-foreground">Potential ARV</span>
                            <span className="text-xl font-bold text-[#2e7d32]">${potentialARV.toLocaleString()}</span>
                            </div>
                        )}
                    </div>
                )}

                <div className="flex flex-col">
                    <span className="text-sm text-muted-foreground">Posted</span>
                    <span className="text-sm font-medium text-foreground">{postedAt}</span>
                </div>


                {expanded && deal.notes && (
                    <div>
                        <p className="text-sm text-muted-foreground">Notes</p>
                        <p className="text-sm text-foreground leading-relaxed">{deal.notes}</p>
                    </div>
                )}

                {deal.notes && (
                    <button
                        className="flex items-center justify-center gap-1 w-full text-sm text-muted-foreground hover:text-foreground transition-colors mt-auto pt-1"
                        onClick={() => setExpanded((v) => !v)}
                    >
                    {expanded ? (
                        <>View Less <ChevronUp className="w-3.5 h-3.5" /></>
                    ) : (
                        <>View More <ChevronDown className="w-3.5 h-3.5" /></>
                    )}
                    </button>
                )}
            </div>
            {(canRequestContact || isOwner) && (
                <div className="border-t border-border px-5 py-2.5 flex justify-end gap-2">
                    {isOwner && (
                        <Button variant="outline" size="sm" onClick={onTopBuyers} className="gap-1.5">
                            <Trophy className="w-3.5 h-3.5 text-amber-500" />
                            Top Potential Buyers
                        </Button>
                    )}
                    {canRequestContact && (
                        <Button variant="outline" size="sm" onClick={onRequestInfo} className="gap-1.5">
                            <Phone className="w-3.5 h-3.5" />
                            Request More Info
                        </Button>
                    )}
                </div>
            )}
        </div>
    </div>
  );
}
