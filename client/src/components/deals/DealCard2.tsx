import { useState, useEffect } from 'react';
import type { Deal } from '@shared/types/deals';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
    Images,
    User,
    ChevronDown,
    ChevronsUp,
    Link2,
    HandCoins,
    Inbox,
} from 'lucide-react';
import { formatAddress } from '@shared/utils/formatAddress';

type DealCardProps = {
    deal: Deal;
    canDelete: boolean;
    canEdit: boolean;
    canRequestContact: boolean;
    canSubmitOffer: boolean;
    isOwner: boolean;
    canViewPoster: boolean;
    expanded: boolean;
    isPinned?: boolean;
    isRequestingInfo?: boolean;
    onToggle: () => void;
    onDelete: () => void;
    onEdit: () => void;
    onRequestInfo: () => void;
    onSubmitOffer: () => void;
    onViewOffers: () => void;
    onTopBuyers: () => void;
};

function formatShowingTime(isoStr: string): string {
    const normalized = isoStr.replace(' ', 'T');
    const [datePart, timePart] = normalized.split('T');
    const [y, m, d] = datePart.split('-');
    if (!timePart) return `${m}/${d}/${y}`;
    const [hhStr, mmStr] = timePart.split(':');
    let hh = parseInt(hhStr, 10);
    const ampm = hh >= 12 ? 'PM' : 'AM';
    if (hh > 12) hh -= 12;
    if (hh === 0) hh = 12;
    return `${m}/${d}/${y} at ${hh}:${mmStr} ${ampm}`;
}

function formatDatePosted(dateStr: string): string {
    const posted = new Date(dateStr);
    const now = new Date();
    const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    if (posted < oneYearAgo) {
        return posted.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    }
    return posted.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const DEAL_TYPE_MAP: Record<
    string,
    { variant: 'purple' | 'red' | 'orange' | 'indigo'; label: string }
> = {
    wholesale: { variant: 'purple', label: 'Wholesale' },
    sold: { variant: 'red', label: 'Sold' },
    agent: { variant: 'orange', label: 'Agent' },
    reo: { variant: 'indigo', label: 'REO' },
};

export default function DealCard2({
    deal,
    canDelete,
    canEdit,
    canRequestContact,
    canSubmitOffer,
    isOwner,
    canViewPoster,
    expanded,
    isPinned = false,
    isRequestingInfo = false,
    onToggle,
    onDelete,
    onEdit,
    onRequestInfo,
    onSubmitOffer,
    onViewOffers,
    onTopBuyers,
}: DealCardProps) {
    const [imageUrl, setImageUrl] = useState('');
    const [imageLoading, setImageLoading] = useState(true);

    useEffect(() => {
        if (!deal.streetViewUrl) {
            setImageLoading(false);
            return;
        }
        const img = new Image();
        img.onload = () => {
            setImageUrl(deal.streetViewUrl!);
            setImageLoading(false);
        };
        img.onerror = () => setImageLoading(false);
        img.src = deal.streetViewUrl;
    }, [deal.streetViewUrl]);

    const price = deal.price ? Number(deal.price) : null;
    const potentialARV = deal.potentialARV ? Number(deal.potentialARV) : null;
    const showingTime = deal.showingTime ?? null;
    const estimatedBudget = deal.estimatedBudget != null ? Number(deal.estimatedBudget) : null;
    const beds = deal.beds ? Number(deal.beds) : null;
    const baths = deal.baths || null;
    const sqft = deal.sqft ? Number(deal.sqft) : null;

    const dealType = DEAL_TYPE_MAP[deal.dealType] ?? DEAL_TYPE_MAP.agent;
    const hasExpandableContent = true; // notes section always renders in expanded view

    return (
        <div
            className={`rounded-xl border-2 bg-card overflow-hidden flex flex-col transition-colors ${
                expanded ? 'border-primary' : 'border-border hover:border-primary'
            }`}
        >
            {/* ── Main body — click anywhere to expand ─────────────────────── */}
            <div
                className={
                    hasExpandableContent
                        ? 'flex flex-col md:flex-row cursor-pointer select-none'
                        : 'flex flex-col md:flex-row'
                }
                onClick={() => hasExpandableContent && onToggle()}
            >
                {/* Street view image — full-width banner below 500px, fixed sidebar above */}
                <div className="h-64 md:h-auto w-full md:w-64 shrink-0 md:self-stretch bg-muted relative">
                    {imageLoading ? (
                        <Loader2 className="absolute inset-0 m-auto w-5 h-5 animate-spin text-muted-foreground/40" />
                    ) : imageUrl ? (
                        <img
                            src={imageUrl}
                            alt={deal.address ?? ''}
                            className="absolute inset-0 w-full h-full object-cover block"
                        />
                    ) : (
                        <Handshake className="absolute inset-0 m-auto w-8 h-8 text-muted-foreground/30" />
                    )}
                    {/* Badges: ARV Exclusive (left) + deal type (right), both left-aligned */}
                    <div className="absolute top-2 left-2 flex items-center gap-1.5">
                        {deal.isArvExclusive && <Badge variant="white">★ ARV Exclusive</Badge>}
                        <Badge variant={dealType.variant} size="lg">
                            {dealType.label}
                        </Badge>
                    </div>
                </div>

                {/* ── Right content ─────────────────────────────────────────── */}
                <div className="flex-1 min-w-0 px-4 md:px-5 pt-4 pb-2 flex flex-col gap-3">
                    {/* Address row + time ago + 3-dot menu */}
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                            <p className="font-semibold text-base leading-tight truncate text-foreground">
                                {formatAddress(deal.address) ?? 'Undisclosed Address'}
                            </p>
                            <p className="deal-card-address mt-0.5">
                                {[formatAddress(deal.city), deal.state, deal.zipCode]
                                    .filter(Boolean)
                                    .join(', ')}
                            </p>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                            {isPinned && (
                                <Badge variant="secondary" className="gap-1 mr-1.5 shrink-0">
                                    <Link2 className="w-3 h-3" />
                                    Linked
                                </Badge>
                            )}
                            <span className="text-xs text-muted-foreground whitespace-nowrap pr-4">
                                {formatDatePosted(deal.createdAt)}
                            </span>
                            {canSubmitOffer && (
                                <div onClick={(e) => e.stopPropagation()}>
                                    <Button
                                        variant="default"
                                        size="base"
                                        onClick={onSubmitOffer}
                                        className="hidden md:inline-flex gap-1.5 mr-1.5"
                                    >
                                        <HandCoins className="deal-card-sub-icon" />
                                        Send Offer
                                    </Button>
                                </div>
                            )}
                            {canRequestContact && (
                                <div onClick={(e) => e.stopPropagation()}>
                                    <Button
                                        variant="default"
                                        size="base"
                                        onClick={onRequestInfo}
                                        disabled={isRequestingInfo}
                                        className="hidden md:inline-flex gap-1.5 mr-1.5"
                                    >
                                        {isRequestingInfo ? (
                                            <Loader2 className="deal-card-sub-icon animate-spin" />
                                        ) : (
                                            <Phone className="deal-card-sub-icon" />
                                        )}
                                        Request More Info
                                    </Button>
                                </div>
                            )}
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
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Specs row */}
                    {(beds !== null || baths !== null || sqft !== null) && (
                        <div className="flex items-center gap-4 text-base text-foreground">
                            {beds !== null && (
                                <span className="flex items-center gap-1.5">
                                    <Bed className="deal-card-icon" />
                                    {beds} bd
                                </span>
                            )}
                            {baths !== null && (
                                <span className="flex items-center gap-1.5">
                                    <Bath className="deal-card-icon" />
                                    {baths} ba
                                </span>
                            )}
                            {sqft !== null && (
                                <span className="flex items-center gap-1.5">
                                    <Maximize2 className="deal-card-icon" />
                                    {sqft.toLocaleString()} sqft
                                </span>
                            )}
                        </div>
                    )}

                    {/* Financials */}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3 w-full md:w-3/4">
                        <div className="flex flex-col">
                            <span className="deal-card-label">Purchase Price</span>
                            {price !== null && price > 0 ? (
                                <span className="deal-card-value">${price.toLocaleString()}</span>
                            ) : (
                                <span className="deal-card-value-empty">—</span>
                            )}
                        </div>
                        <div className="flex flex-col">
                            <span className="deal-card-label">Potential ARV</span>
                            {potentialARV !== null && potentialARV > 0 ? (
                                <span className="deal-card-value text-spread-positive">
                                    ${potentialARV.toLocaleString()}
                                </span>
                            ) : (
                                <span className="deal-card-value-empty">—</span>
                            )}
                        </div>
                        <div className="flex flex-col">
                            <span className="deal-card-label">Est. Budget</span>
                            {estimatedBudget !== null && estimatedBudget > 0 ? (
                                <span className="deal-card-value">
                                    ${estimatedBudget.toLocaleString()}
                                </span>
                            ) : (
                                <span className="deal-card-value-empty">—</span>
                            )}
                        </div>
                        <div className="flex flex-col">
                            <span className="deal-card-label">Showing</span>
                            {showingTime ? (
                                <span className="deal-card-value">
                                    {formatShowingTime(showingTime)}
                                </span>
                            ) : (
                                <span className="deal-card-value-empty">—</span>
                            )}
                        </div>
                    </div>

                    {/* View More indicator — part of the card top section */}
                    {hasExpandableContent && (
                        <div className="flex items-center justify-center gap-1 pt-1 text-sm text-muted-foreground select-none">
                            {expanded ? (
                                <>
                                    <ChevronsUp className="w-4 h-4" /> View Less
                                </>
                            ) : (
                                <>
                                    <ChevronDown className="w-4 h-4" /> View More
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Expanded section — full width, no image gap ───────────────── */}
            {expanded && hasExpandableContent && (
                <div className="border-t border-border px-5 py-4 flex flex-col gap-4">
                    <div>
                        <p className="deal-card-label">Notes</p>
                        <p className="text-sm text-foreground leading-relaxed">
                            {deal.notes || (
                                <span className="text-foreground">No notes available.</span>
                            )}
                        </p>
                    </div>
                    {deal.photosUrl && (
                        <div>
                            <p className="deal-card-label mb-1.5">Photos</p>
                            <a
                                href={deal.photosUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="deal-card-link"
                            >
                                <Images className="deal-card-sub-icon shrink-0 text-muted-foreground" />
                                View Photos
                            </a>
                        </div>
                    )}
                    {deal.links && deal.links.length > 0 && (
                        <div>
                            <p className="deal-card-label mb-1.5">Comparable Sale Links</p>
                            <div className="flex flex-wrap gap-2">
                                {deal.links.map((link, i) => (
                                    <a
                                        key={i}
                                        href={link.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="deal-card-link"
                                    >
                                        <ExternalLink className="deal-card-sub-icon text-muted-foreground" />
                                        {link.domain}
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}
                    {(canRequestContact || canSubmitOffer || isOwner) && (
                        <div className="flex items-center gap-6 flex-wrap">
                            {(canRequestContact || canSubmitOffer) && (
                                <div className="md:hidden">
                                    <p className="deal-card-label mb-1.5">Contact</p>
                                    <div className="flex flex-col gap-1.5">
                                        {canSubmitOffer && (
                                            <button
                                                onClick={onSubmitOffer}
                                                className="deal-card-link"
                                            >
                                                <HandCoins className="deal-card-sub-icon" />
                                                Send Offer
                                            </button>
                                        )}
                                        {canRequestContact && (
                                            <button
                                                onClick={onRequestInfo}
                                                disabled={isRequestingInfo}
                                                className="deal-card-link disabled:opacity-50"
                                            >
                                                {isRequestingInfo ? (
                                                    <Loader2 className="deal-card-sub-icon animate-spin" />
                                                ) : (
                                                    <Phone className="deal-card-sub-icon" />
                                                )}
                                                Request More Info
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                            {isOwner && (
                                <div>
                                    <p className="deal-card-label mb-1.5">Actions</p>
                                    <div className="flex flex-col gap-1.5">
                                        <button
                                            onClick={onViewOffers}
                                            className="deal-card-link"
                                        >
                                            <Inbox className="deal-card-sub-icon text-primary" />
                                            Offers{deal.bidCount ? ` (${deal.bidCount})` : ''}
                                        </button>
                                        <button
                                            onClick={onTopBuyers}
                                            rel="noopener noreferrer"
                                            className="deal-card-link"
                                        >
                                            <Trophy className="deal-card-sub-icon text-amber-500" />
                                            Top Potential Buyers
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ── Admin: Posted by + internal notes footer ─────────────────── */}
            {canViewPoster && (
                <div className="border-t border-border px-5 py-3 flex flex-col gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <User className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                        <span className="deal-card-label">Posted by:</span>
                        {[
                            [deal.userFirstName, deal.userLastName].filter(Boolean).join(' ') ||
                                'Unknown',
                            deal.userEmail,
                            deal.userPhone,
                        ]
                            .filter(Boolean)
                            .map((item, i, arr) => (
                                <span key={i} className="flex items-center gap-1.5">
                                    <span className="text-sm text-foreground">{item}</span>
                                    {i < arr.length - 1 && (
                                        <span className="text-muted-foreground">|</span>
                                    )}
                                </span>
                            ))}
                    </div>
                    {deal.onBehalfOfEmail && (
                        <div className="flex items-center gap-1.5">
                            <span className="deal-card-label shrink-0">On Behalf Of:</span>
                            <span className="text-sm text-foreground">{deal.onBehalfOfEmail}</span>
                        </div>
                    )}
                    {deal.adminNotes && (
                        <div className="flex items-center gap-1.5">
                            <span className="deal-card-label shrink-0">Internal Note:</span>
                            <span className="text-sm text-foreground">{deal.adminNotes}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
