import {
    ArrowLeft,
    Bath,
    Bed,
    ExternalLink,
    HandCoins,
    Images,
    Inbox,
    Loader2,
    MapPin,
    MoreVertical,
    Pencil,
    Phone,
    Ruler,
    Star,
    Trash2,
    Trophy,
    User,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import DealImage from '@/components/deals/DealImage';
import { cn } from '@/utils/merge';
import { formatAddress } from '@shared/utils/formatAddress';
import { dealTypeMeta, formatPostedDate, formatShowingTime, formatUsd, isSold, toMoney } from '@/utils/deals';
import type { Deal } from '@shared/types/deals';
import type { DealCaps } from '@/types/deals';

type DealDetailProps = {
    deal: Deal;
    caps: DealCaps;
    /** True while this deal's info request is in flight — disables the button, shows a spinner. */
    isRequestingInfo?: boolean;
    /** When set, a back affordance is shown (single-pane / mobile) to return to the list. */
    onBack?: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onRequestInfo: () => void;
    onSubmitOffer: () => void;
    onViewOffers: () => void;
    onTopBuyers: () => void;
};

/** One financial fact as a tile; the value carries the emphasis, muted when the field is empty. */
function Fact({ label, value }: { label: string; value: string | null }) {
    return (
        <div className="rounded-lg border border-card-border bg-card px-3 py-2.5">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p
                className={cn(
                    'mt-0.5 text-lg font-bold tabular-nums',
                    !value
                        ? 'text-muted-foreground/60'
                        : label === 'Potential ARV'
                          ? 'text-spread-positive'
                          : 'text-foreground',
                )}
            >
                {value ?? '—'}
            </p>
        </div>
    );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {children}
        </p>
    );
}

/**
 * The full record for one deal. A two-column hero pairs the street-view image (shown at natural
 * photo proportions) with the key facts; below it sit specs, notes, comps, and the role-gated
 * actions. Stacks to one column on narrow screens. Shows only stored fields — no derived metrics.
 */
export default function DealDetail({
    deal,
    caps,
    isRequestingInfo = false,
    onBack,
    onEdit,
    onDelete,
    onRequestInfo,
    onSubmitOffer,
    onViewOffers,
    onTopBuyers,
}: DealDetailProps) {
    const type = dealTypeMeta(deal.dealType);
    const sold = isSold(deal);
    const price = toMoney(deal.price);
    const arv = toMoney(deal.potentialARV);
    const budget = toMoney(deal.estimatedBudget);

    const beds = deal.beds ? Number(deal.beds) : null;
    const baths = deal.baths ? Number(deal.baths) : null;
    const sqft = deal.sqft ? Number(deal.sqft) : null;
    const hasSpecs = beds !== null || baths !== null || sqft !== null || !!deal.propertyType;

    const cityState = [formatAddress(deal.city), deal.state].filter(Boolean).join(', ');
    const cityLine = [cityState, deal.zipCode].filter(Boolean).join(' ');
    const showActions = !sold && (caps.canRequestContact || caps.canSubmitOffer);

    return (
        <div className="flex h-full flex-col">
            {/* ── Header (min-h matches the list column's scope bar so the two align) ── */}
            <div className="flex min-h-[4.25rem] shrink-0 items-center border-b border-border px-4 py-2 md:px-6">
                <div className="mx-auto flex w-full max-w-4xl items-center gap-2">
                    {onBack && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onBack}
                            aria-label="Back to deals"
                            className="-ml-2 shrink-0 lg:hidden"
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    )}
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            {deal.isArvExclusive && (
                                <Star
                                    className="h-4 w-4 shrink-0 fill-primary text-primary"
                                    aria-label="ARV Exclusive"
                                />
                            )}
                            <h2 className="truncate text-lg font-semibold text-foreground">
                                {formatAddress(deal.address) ?? 'Undisclosed Address'}
                            </h2>
                        </div>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            {cityLine || 'Location undisclosed'}
                            <span className="px-1.5 text-muted-foreground/50">·</span>
                            Posted {formatPostedDate(deal.createdAt)}
                        </p>
                    </div>
                    <Badge variant={type.badge} size="lg" className="mt-0.5 shrink-0">
                        {type.label}
                    </Badge>
                    {(caps.canEdit || caps.canDelete) && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label="Deal actions"
                                    className="-mr-2 h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                                >
                                    <MoreVertical className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                {caps.canEdit && (
                                    <DropdownMenuItem className="cursor-pointer gap-2" onSelect={onEdit}>
                                        <Pencil className="h-4 w-4" />
                                        Edit Deal
                                    </DropdownMenuItem>
                                )}
                                {caps.canDelete && (
                                    <DropdownMenuItem
                                        className="cursor-pointer gap-2 text-destructive focus:text-destructive"
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

            {/* ── Body ────────────────────────────────────────────────────────── */}
            <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
                    {/* Hero: image + key facts */}
                    <div className="flex flex-col gap-5 lg:flex-row">
                        <div className="lg:w-[42%] lg:shrink-0">
                            <div className="relative">
                                <DealImage
                                    src={deal.streetViewUrl}
                                    alt={formatAddress(deal.address) ?? 'Deal property'}
                                    className="aspect-[16/10] w-full rounded-xl border border-card-border"
                                    iconClassName="h-10 w-10"
                                />
                                {deal.streetViewUrl && (
                                    <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-md border border-border bg-background/85 px-2 py-0.5 text-xs font-medium text-muted-foreground backdrop-blur">
                                        <MapPin className="h-3 w-3" />
                                        Street View
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="flex min-w-0 flex-1 flex-col gap-4">
                            <div className="grid grid-cols-2 gap-3">
                                <Fact
                                    label={sold ? 'Sold Price' : 'Purchase Price'}
                                    value={price !== null ? formatUsd(price) : null}
                                />
                                <Fact
                                    label="Potential ARV"
                                    value={arv !== null ? formatUsd(arv) : null}
                                />
                                <Fact
                                    label="Est. Budget"
                                    value={budget !== null ? formatUsd(budget) : null}
                                />
                                <Fact
                                    label="Showing"
                                    value={deal.showingTime ? formatShowingTime(deal.showingTime) : null}
                                />
                            </div>

                            {hasSpecs && (
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-foreground">
                                    {beds !== null && (
                                        <span className="flex items-center gap-1.5">
                                            <Bed className="h-4 w-4 text-muted-foreground" />
                                            {beds} bd
                                        </span>
                                    )}
                                    {baths !== null && (
                                        <span className="flex items-center gap-1.5">
                                            <Bath className="h-4 w-4 text-muted-foreground" />
                                            {baths} ba
                                        </span>
                                    )}
                                    {sqft !== null && (
                                        <span className="flex items-center gap-1.5">
                                            <Ruler className="h-4 w-4 text-muted-foreground" />
                                            {sqft.toLocaleString()} sqft
                                        </span>
                                    )}
                                    {deal.propertyType && (
                                        <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                                            {deal.propertyType}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Buyer actions */}
                    {showActions && (
                        <div className="flex flex-col gap-2 sm:flex-row">
                            {caps.canSubmitOffer && (
                                <Button onClick={onSubmitOffer} size="lg" className="flex-1 gap-1.5">
                                    <HandCoins className="h-4 w-4" />
                                    Send Offer
                                </Button>
                            )}
                            {caps.canRequestContact && (
                                <Button
                                    onClick={onRequestInfo}
                                    disabled={isRequestingInfo}
                                    variant={caps.canSubmitOffer ? 'outline' : 'default'}
                                    size="lg"
                                    className="flex-1 gap-1.5"
                                >
                                    {isRequestingInfo ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Phone className="h-4 w-4" />
                                    )}
                                    Request More Info
                                </Button>
                            )}
                        </div>
                    )}

                    {/* Notes */}
                    <div>
                        <SectionLabel>Notes</SectionLabel>
                        <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
                            {deal.notes?.trim() || (
                                <span className="text-muted-foreground">No notes provided.</span>
                            )}
                        </p>
                    </div>

                    {/* Comps & photos */}
                    {(deal.links?.length || deal.photosUrl) && (
                        <div className="grid gap-5 sm:grid-cols-2">
                            {deal.links && deal.links.length > 0 && (
                                <div>
                                    <SectionLabel>Comparable Sales</SectionLabel>
                                    <div className="flex flex-wrap gap-2">
                                        {deal.links.map((link) => (
                                            <a
                                                key={link.url}
                                                href={link.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-2.5 py-1 text-sm capitalize transition-colors hover-elevate"
                                            >
                                                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                                                {link.domain}
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {deal.photosUrl && (
                                <div>
                                    <SectionLabel>Photos</SectionLabel>
                                    <a
                                        href={deal.photosUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-2.5 py-1 text-sm transition-colors hover-elevate"
                                    >
                                        <Images className="h-3.5 w-3.5 text-muted-foreground" />
                                        View photo album
                                    </a>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Owner tools */}
                    {caps.isOwner && (
                        <div className="rounded-xl border border-card-border bg-card p-4">
                            <SectionLabel>Your Deal</SectionLabel>
                            <div className="flex flex-col gap-2 sm:flex-row">
                                <Button
                                    variant="outline"
                                    onClick={onViewOffers}
                                    className="flex-1 justify-start gap-2"
                                >
                                    <Inbox className="h-4 w-4 text-primary" />
                                    Offers{deal.bidCount ? ` (${deal.bidCount})` : ''}
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={onTopBuyers}
                                    className="flex-1 justify-start gap-2"
                                >
                                    <Trophy className="h-4 w-4 text-amber-500" />
                                    Top Potential Buyers
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Admin footer */}
                    {caps.canViewPoster && (
                        <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-4 text-sm">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                <span className="text-xs font-medium text-muted-foreground">
                                    Posted by
                                </span>
                                {[
                                    [deal.userFirstName, deal.userLastName]
                                        .filter(Boolean)
                                        .join(' ') || 'Unknown',
                                    deal.userEmail,
                                    deal.userPhone,
                                ]
                                    .filter(Boolean)
                                    .map((item, i, arr) => (
                                        <span key={item} className="flex items-center gap-2">
                                            <span className="text-foreground">{item}</span>
                                            {i < arr.length - 1 && (
                                                <span className="text-muted-foreground/50">|</span>
                                            )}
                                        </span>
                                    ))}
                            </div>
                            {deal.onBehalfOfEmail && (
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-medium text-muted-foreground">
                                        On behalf of
                                    </span>
                                    <span className="text-foreground">{deal.onBehalfOfEmail}</span>
                                </div>
                            )}
                            {deal.adminNotes && (
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-xs font-medium text-muted-foreground">
                                        Internal note
                                    </span>
                                    <span className="text-foreground">{deal.adminNotes}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
