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
    Calendar,
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

/**
 * Card for a single deal. Vertical card — streetview banner, address, specs, a
 * three-up financial strip, notes/photos/comps, and a bottom action row.
 *
 * Detail (notes, photos, comparable links) shows inline on desktop (≥820px, where
 * cards sit in a multi-column grid and are locked to equal height); on a narrow
 * single-column layout it collapses behind a "View More" toggle. The showing time
 * rides as a chip on the image so its presence never changes the card's height.
 * An admin-only footer surfaces the poster and internal notes.
 */
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

    // Three-up financial strip — short labels so the columns stay evenly divided.
    const financials: { label: string; value: number | null; positive?: boolean }[] = [
        { label: 'Price', value: price },
        { label: 'Potential ARV', value: potentialARV, positive: true },
        { label: 'Est. Budget', value: estimatedBudget },
    ];

    const showBuyerActions = canSubmitOffer || canRequestContact;
    const showActionRow = showBuyerActions || isOwner;
    const comps = deal.links ?? [];

    return (
        <div
            className={`rounded-xl border-2 bg-card overflow-hidden flex flex-col h-full transition-colors ${
                expanded ? 'border-primary' : 'border-border hover:border-primary'
            }`}
        >
            {/* Streetview banner — deal badges (top-left) + showing-time chip (bottom-left) */}
            <div className="relative aspect-video w-full shrink-0 bg-muted">
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
                <div className="absolute top-2 left-2 flex items-center gap-1.5">
                    {deal.isArvExclusive && <Badge variant="white">★ ARV Exclusive</Badge>}
                    <Badge variant={dealType.variant} size="lg">
                        {dealType.label}
                    </Badge>
                </div>
                {showingTime && (
                    <div className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-md bg-background/90 px-2 py-0.5 text-xs font-medium text-foreground backdrop-blur">
                        <Calendar className="w-3 h-3 shrink-0" />
                        <span className="whitespace-nowrap">{formatShowingTime(showingTime)}</span>
                    </div>
                )}
            </div>

            {/* Body — grows to fill equal-height cells; action row pins to the bottom on desktop */}
            <div className="flex-1 flex flex-col gap-4 px-5 py-4">
                {/* Address + date + 3-dot menu */}
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <p className="font-semibold text-lg leading-tight truncate text-foreground">
                            {formatAddress(deal.address) ?? 'Undisclosed Address'}
                        </p>
                        <p className="deal-card-address mt-0.5">
                            {[formatAddress(deal.city), deal.state, deal.zipCode]
                                .filter(Boolean)
                                .join(', ')}
                        </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                        {isPinned && (
                            <Badge variant="secondary" className="gap-1">
                                <Link2 className="w-3 h-3" />
                                Linked
                            </Badge>
                        )}
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDatePosted(deal.createdAt)}
                        </span>
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

                {/* Financial strip */}
                <div className="grid grid-cols-3 divide-x divide-border rounded-lg border border-border bg-background">
                    {financials.map((f) => (
                        <div key={f.label} className="px-2 py-2.5 text-center min-w-0">
                            <p className="text-xs text-muted-foreground truncate">{f.label}</p>
                            {f.value !== null && f.value > 0 ? (
                                <p
                                    className={`text-base font-bold truncate ${
                                        f.positive ? 'text-spread-positive' : 'text-foreground'
                                    }`}
                                >
                                    ${f.value.toLocaleString()}
                                </p>
                            ) : (
                                <p className="text-base font-bold text-muted-foreground">—</p>
                            )}
                        </div>
                    ))}
                </div>

                {/* View More — single-column (mobile) only; desktop shows the detail inline */}
                <button
                    type="button"
                    onClick={onToggle}
                    className="min-[820px]:hidden flex items-center justify-center gap-1 text-sm text-muted-foreground"
                >
                    {expanded ? (
                        <>
                            <ChevronsUp className="w-4 h-4" /> View Less
                        </>
                    ) : (
                        <>
                            <ChevronDown className="w-4 h-4" /> View More
                        </>
                    )}
                </button>

                {/* Detail — inline on desktop, collapsed behind View More on mobile */}
                <div
                    className={`flex-col gap-4 ${expanded ? 'flex' : 'hidden'} min-[820px]:flex`}
                >
                    <div>
                        <p className="deal-card-label mb-1">Notes</p>
                        <p className="text-sm text-foreground leading-relaxed line-clamp-2 min-h-[2.5rem]">
                            {deal.notes || (
                                <span className="text-muted-foreground">No notes provided.</span>
                            )}
                        </p>
                    </div>
                    {(deal.photosUrl || comps.length > 0) && (
                        <div className="flex flex-wrap items-center gap-2">
                            {deal.photosUrl && (
                                <a
                                    href={deal.photosUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="deal-card-link"
                                >
                                    <Images className="deal-card-sub-icon shrink-0 text-muted-foreground" />
                                    Photos
                                </a>
                            )}
                            {comps.map((link, i) => (
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
                    )}
                </div>

                {/* Action row — buyer CTAs, or owner management CTAs; pinned bottom on desktop */}
                {showActionRow && (
                    <div className="flex gap-2 min-[820px]:mt-auto">
                        {showBuyerActions ? (
                            <>
                                {canSubmitOffer && (
                                    <Button
                                        variant="default"
                                        size="default"
                                        onClick={onSubmitOffer}
                                        className="flex-1 gap-1.5"
                                    >
                                        <HandCoins className="deal-card-sub-icon" />
                                        Send Offer
                                    </Button>
                                )}
                                {canRequestContact && (
                                    <Button
                                        variant={canSubmitOffer ? 'secondary' : 'default'}
                                        size="default"
                                        onClick={onRequestInfo}
                                        disabled={isRequestingInfo}
                                        className="flex-1 gap-1.5"
                                    >
                                        {isRequestingInfo ? (
                                            <Loader2 className="deal-card-sub-icon animate-spin" />
                                        ) : (
                                            <Phone className="deal-card-sub-icon" />
                                        )}
                                        Request More Info
                                    </Button>
                                )}
                            </>
                        ) : (
                            <>
                                <Button
                                    variant="default"
                                    size="default"
                                    onClick={onViewOffers}
                                    className="flex-1 gap-1.5"
                                >
                                    <Inbox className="deal-card-sub-icon" />
                                    Offers{deal.bidCount ? ` (${deal.bidCount})` : ''}
                                </Button>
                                <Button
                                    variant="secondary"
                                    size="default"
                                    onClick={onTopBuyers}
                                    className="flex-1 gap-1.5"
                                >
                                    <Trophy className="deal-card-sub-icon text-amber-500" />
                                    Top Buyers
                                </Button>
                            </>
                        )}
                    </div>
                )}
            </div>

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
