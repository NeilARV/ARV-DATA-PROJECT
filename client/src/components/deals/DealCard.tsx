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
    ExternalLink,
    User,
    Calendar,
} from "lucide-react";
import { formatAddress } from "@shared/utils/formatAddress";

type DealCardProps = {
    deal: Deal;
    canDelete: boolean;
    canEdit: boolean;
    canRequestContact: boolean;
    isOwner: boolean;
    canViewPoster: boolean;
    onDelete: () => void;
    onEdit: () => void;
    onRequestInfo: () => void;
    onTopBuyers: () => void;
};

function formatEscrowDate(dateStr: string): string {
    const [y, m, d] = dateStr.split("-");
    return `${m}/${d}/${y}`;
}

const DEAL_TYPE_STYLES: Record<string, { bg: string; label: string }> = {
    wholesale: { bg: "#9333EA", label: "Wholesale" },
    sold:      { bg: "#FF0000", label: "Sold" },
    agent:     { bg: "#F97316", label: "Agent" },
};

export default function DealCard({
    deal,
    canDelete,
    canEdit,
    canRequestContact,
    isOwner,
    canViewPoster,
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

    const price         = deal.price         ? Number(deal.price)         : null;
    const potentialARV  = deal.potentialARV   ? Number(deal.potentialARV)  : null;
    const closeOfEscrow = deal.closeOfEscrow ?? null;
    const beds          = deal.beds           ? Number(deal.beds)           : null;
    const baths         = deal.baths || null;
    const sqft          = deal.sqft           ? Number(deal.sqft)           : null;
    const postedAt = new Date(deal.createdAt).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });

    const typeStyle = DEAL_TYPE_STYLES[deal.dealType] ?? DEAL_TYPE_STYLES.agent;
    const hasExpandableContent = deal.notes || (deal.links && deal.links.length > 0);

    return (
        <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col">
            {/* Top: image + details side by side */}
            <div className="flex">
                {/* Street view thumbnail */}
                <div className="w-56 shrink-0 bg-muted flex items-center justify-center relative overflow-hidden self-stretch">
                    {imageLoading ? (
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground/40" />
                    ) : imageUrl ? (
                        <img
                            src={imageUrl}
                            alt={deal.address ?? ""}
                            className="absolute inset-0 w-full h-full object-cover"
                        />
                    ) : (
                        <Handshake className="w-8 h-8 text-muted-foreground/30" />
                    )}
                    {/* Deal type badge */}
                    <span
                        className="absolute top-2 left-2 text-[11px] font-semibold px-2 py-0.5 rounded shadow-sm"
                        style={{ backgroundColor: typeStyle.bg, color: "#fff" }}
                    >
                        {typeStyle.label}
                    </span>
                </div>

                {/* Property details */}
                <div className="flex-1 min-w-0 px-5 py-4 flex flex-col gap-3">
                    {/* Address row */}
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                            <p className="font-semibold text-base leading-tight truncate text-foreground">
                                {formatAddress(deal.address) ?? "Undisclosed Address"}
                            </p>
                            <p className="text-sm text-muted-foreground truncate mt-0.5">
                                {[formatAddress(deal.city), deal.state, deal.zipCode].filter(Boolean).join(", ")}
                            </p>
                        </div>
                        {(canEdit || canDelete) && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                                    >
                                        <MoreVertical className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="z-[10001]">
                                    {canEdit && (
                                        <DropdownMenuItem className="gap-2 cursor-pointer" onSelect={onEdit}>
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

                    {/* Specs row */}
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

                    {/* Financials */}
                    <div className="flex items-start gap-6 text-sm">
                        <div className="flex flex-col">
                            <span className="text-xs text-muted-foreground">Purchase Price</span>
                            {price !== null && price > 0
                                ? <span className="text-xl font-bold text-foreground">${price.toLocaleString()}</span>
                                : <span className="text-xl font-bold text-muted-foreground">—</span>
                            }
                        </div>
                        <div className="flex flex-col">
                            <span className="text-xs text-muted-foreground">Potential ARV</span>
                            {potentialARV !== null && potentialARV > 0
                                ? <span className="text-xl font-bold text-[#2e7d32]">${potentialARV.toLocaleString()}</span>
                                : <span className="text-xl font-bold text-muted-foreground">—</span>
                            }
                        </div>
                        <div className="flex flex-col">
                            <span className="text-xs text-muted-foreground">Close of Escrow</span>
                            {closeOfEscrow
                                ? <span className="text-xl font-bold text-foreground">{formatEscrowDate(closeOfEscrow)}</span>
                                : <span className="text-xl font-bold text-muted-foreground">—</span>
                            }
                        </div>
                    </div>

                    {/* Posted date */}
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{postedAt}</span>
                    </div>

                    {/* Posted by (admin only) */}
                    {canViewPoster && (
                        <div className="flex items-center gap-1.5 text-sm flex-wrap">
                            <User className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">Posted by:</span>
                            {[
                                [deal.userFirstName, deal.userLastName].filter(Boolean).join(" ") || "Unknown",
                                deal.userEmail,
                                deal.userPhone,
                            ].filter(Boolean).map((item, i, arr) => (
                                <span key={i} className="flex items-center gap-1.5 text-xs">
                                    <span className="font-medium text-foreground">{item}</span>
                                    {i < arr.length - 1 && <span className="text-muted-foreground">|</span>}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Expandable section */}
            {expanded && hasExpandableContent && (
                <div className="px-5 pb-4 flex flex-col gap-3 border-t border-border pt-3 ml-56">
                    {deal.notes && (
                        <div>
                            <p className="text-xs text-muted-foreground mb-1">Notes</p>
                            <p className="text-sm text-foreground leading-relaxed">{deal.notes}</p>
                        </div>
                    )}
                    {deal.links && deal.links.length > 0 && (
                        <div>
                            <p className="text-xs text-muted-foreground mb-1.5">Comparable Sale Links</p>
                            <div className="flex flex-wrap gap-2">
                                {deal.links.map((link, i) => (
                                    <a
                                        key={i}
                                        href={link.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-md border border-border bg-muted hover:bg-accent transition-colors capitalize"
                                    >
                                        <ExternalLink className="w-3 h-3 shrink-0 text-muted-foreground" />
                                        {link.domain}
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Footer */}
            <div className="border-t border-border px-5 py-2.5 flex items-center justify-between">
                {/* Expand toggle */}
                {hasExpandableContent ? (
                    <button
                        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => setExpanded((v) => !v)}
                    >
                        {expanded ? (
                            <>View Less <ChevronUp className="w-3.5 h-3.5" /></>
                        ) : (
                            <>View More <ChevronDown className="w-3.5 h-3.5" /></>
                        )}
                    </button>
                ) : (
                    <span />
                )}

                {/* Action buttons */}
                {(canRequestContact || isOwner) && (
                    <div className="flex items-center gap-2">
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
