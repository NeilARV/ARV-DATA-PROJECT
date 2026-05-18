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
    ExternalLink,
    User,
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
    canViewPoster: boolean;
    expanded: boolean;
    onToggle: () => void;
    onDelete: () => void;
    onEdit: () => void;
    onRequestInfo: () => void;
    onTopBuyers: () => void;
};

function formatEscrowDate(dateStr: string): string {
    const [y, m, d] = dateStr.split("-");
    return `${m}/${d}/${y}`;
}

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return `${Math.floor(days / 30)}mo ago`;
}

const DEAL_TYPE_STYLES: Record<string, { bg: string; label: string }> = {
    wholesale: { bg: "#9333EA", label: "Wholesale" },
    sold:      { bg: "#FF0000", label: "Sold" },
    agent:     { bg: "#F97316", label: "Agent" },
};

export default function DealCard2({
    deal,
    canDelete,
    canEdit,
    canRequestContact,
    isOwner,
    canViewPoster,
    expanded,
    onToggle,
    onDelete,
    onEdit,
    onRequestInfo,
    onTopBuyers,
}: DealCardProps) {
    const [imageUrl, setImageUrl] = useState("");
    const [imageLoading, setImageLoading] = useState(true);

    useEffect(() => {
        if (!deal.streetViewUrl) {
            setImageLoading(false);
            return;
        }
        const img = new Image();
        img.onload  = () => { setImageUrl(deal.streetViewUrl!); setImageLoading(false); };
        img.onerror = () => setImageLoading(false);
        img.src = deal.streetViewUrl;
    }, [deal.streetViewUrl]);

    const price           = deal.price           ? Number(deal.price)           : null;
    const potentialARV    = deal.potentialARV     ? Number(deal.potentialARV)    : null;
    const closeOfEscrow   = deal.closeOfEscrow    ?? null;
    const estimatedBudget = deal.estimatedBudget  != null ? Number(deal.estimatedBudget) : null;
    const beds            = deal.beds             ? Number(deal.beds)             : null;
    const baths           = deal.baths || null;
    const sqft            = deal.sqft             ? Number(deal.sqft)             : null;

    const typeStyle            = DEAL_TYPE_STYLES[deal.dealType] ?? DEAL_TYPE_STYLES.agent;
    const hasExpandableContent = !!(deal.notes || (deal.links && deal.links.length > 0) || canRequestContact || isOwner);

    return (
        <div className={`rounded-xl border bg-card overflow-hidden flex flex-col transition-colors ${
            expanded ? "border-primary" : "border-border hover:border-primary"
        }`}>

            {/* ── Main body — click anywhere to expand ─────────────────────── */}
            <div
                className={hasExpandableContent ? "flex flex-col min-[850px]:flex-row cursor-pointer select-none" : "flex flex-col min-[850px]:flex-row"}
                onClick={() => hasExpandableContent && onToggle()}
            >
                {/* Street view image — full-width banner below 500px, fixed sidebar above */}
                <div className="h-64 min-[850px]:h-auto w-full min-[850px]:w-56 shrink-0 min-[850px]:self-stretch bg-muted relative">
                    {imageLoading ? (
                        <Loader2 className="absolute inset-0 m-auto w-5 h-5 animate-spin text-muted-foreground/40" />
                    ) : imageUrl ? (
                        <img
                            src={imageUrl}
                            alt={deal.address ?? ""}
                            className="absolute inset-0 w-full h-full object-cover block"
                        />
                    ) : (
                        <Handshake className="absolute inset-0 m-auto w-8 h-8 text-muted-foreground/30" />
                    )}
                    {/* Deal type badge */}
                    <span
                        className="absolute top-2 left-2 text-[11px] font-semibold px-2 py-0.5 rounded shadow-sm"
                        style={{ backgroundColor: typeStyle.bg, color: "#fff" }}
                    >
                        {typeStyle.label}
                    </span>
                </div>

                {/* ── Right content ─────────────────────────────────────────── */}
                <div className="flex-1 min-w-0 px-4 min-[850px]:px-5 pt-4 pb-2 flex flex-col gap-3">

                    {/* Address row + time ago + 3-dot menu */}
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                            <p className="font-semibold text-base leading-tight truncate text-foreground">
                                {formatAddress(deal.address) ?? "Undisclosed Address"}
                            </p>
                            <p className="text-sm text-muted-foreground truncate mt-0.5">
                                {[formatAddress(deal.city), deal.state, deal.zipCode].filter(Boolean).join(", ")}
                            </p>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                            {canRequestContact && (
                                <Button variant="outline" size="sm" onClick={onRequestInfo} className="hidden min-[850px]:inline-flex gap-1.5 mr-1.5">
                                    <Phone className="w-3.5 h-3.5" />
                                    Request More Info
                                </Button>
                            )}
                            <span className="text-xs text-muted-foreground whitespace-nowrap pr-1">
                                {timeAgo(deal.createdAt)}
                            </span>
                            {(canEdit || canDelete) && (
                                <div onClick={(e) => e.stopPropagation()}>
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
                                </div>
                            )}
                        </div>
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
                    <div className="grid grid-cols-2 min-[850px]:grid-cols-3 gap-x-6 gap-y-3 w-full min-[850px]:w-3/4">
                        <div className="flex flex-col">
                            <span className="text-xs lg:text-sm text-muted-foreground">Purchase Price</span>
                            {price !== null && price > 0
                                ? <span className="text-lg font-bold text-foreground">${price.toLocaleString()}</span>
                                : <span className="text-lg font-bold text-muted-foreground">—</span>
                            }
                        </div>
                        <div className="flex flex-col">
                            <span className="deal-card-label">Potential ARV</span>
                            {potentialARV !== null && potentialARV > 0
                                ? <span className="text-lg font-bold text-[#2e7d32]">${potentialARV.toLocaleString()}</span>
                                : <span className="text-lg font-bold text-muted-foreground">—</span>
                            }
                        </div>
                        <div className="flex flex-col">
                            <span className="deal-card-label">Est. Budget</span>
                            {estimatedBudget !== null && estimatedBudget > 0
                                ? <span className="text-lg font-bold text-foreground">${estimatedBudget.toLocaleString()}</span>
                                : <span className="text-lg font-bold text-muted-foreground">—</span>
                            }
                        </div>
                        <div className="flex flex-col">
                            <span className="deal-card-label">Close of Escrow</span>
                            {closeOfEscrow
                                ? <span className="text-lg font-bold text-foreground">{formatEscrowDate(closeOfEscrow)}</span>
                                : <span className="text-lg font-bold text-muted-foreground">—</span>
                            }
                        </div>
                    </div>

                    {/* View More indicator — part of the card top section */}
                    {hasExpandableContent && (
                        <div className="flex items-center justify-center gap-1 pt-1 text-sm text-muted-foreground select-none">
                            {expanded
                                ? <><ChevronUp className="w-3 h-3" /> View Less</>
                                : <><ChevronDown className="w-3 h-3" /> View More</>
                            }
                        </div>
                    )}
                </div>
            </div>

            {/* ── Expanded section — full width, no image gap ───────────────── */}
            {expanded && hasExpandableContent && (
                <div className="border-t border-border px-5 py-4 flex flex-col gap-4">
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
                    {(canRequestContact || isOwner) && (
                        <div className="flex items-center gap-3 flex-wrap">
                            {canRequestContact && (
                                <div className="min-[850px]:hidden">
                                    <p className="text-xs text-muted-foreground mb-1.5">Contact</p>
                                    <Button variant="outline" size="sm" onClick={onRequestInfo} className="gap-1.5">
                                        <Phone className="w-3.5 h-3.5" />
                                        Request More Info
                                    </Button>
                                </div>
                            )}
                            {isOwner && (
                                <div>
                                    <p className="text-xs text-muted-foreground mb-1.5">Actions</p>
                                    <Button variant="outline" size="sm" onClick={onTopBuyers} className="gap-1.5">
                                        <Trophy className="w-3.5 h-3.5 text-amber-500" />
                                        Top Potential Buyers
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ── Admin: Posted by footer ───────────────────────────────────── */}
            {canViewPoster && (
                <div className="border-t border-border px-5 py-2 flex items-center gap-1.5 text-xs flex-wrap">
                    <User className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                    <span className="text-muted-foreground">Posted by:</span>
                    {[
                        [deal.userFirstName, deal.userLastName].filter(Boolean).join(" ") || "Unknown",
                        deal.userEmail,
                        deal.userPhone,
                    ].filter(Boolean).map((item, i, arr) => (
                        <span key={i} className="flex items-center gap-1.5">
                            <span className="font-medium text-foreground">{item}</span>
                            {i < arr.length - 1 && <span className="text-muted-foreground">|</span>}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}
