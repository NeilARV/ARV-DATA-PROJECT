import { memo } from 'react';
import { MoveRight, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import DealImage from '@/components/deals/DealImage';
import { cn } from '@/utils/merge';
import { formatAddress } from '@shared/utils/formatAddress';
import {
    dealSpecs,
    dealTypeMeta,
    formatCompactUsd,
    formatPostedDate,
    toMoney,
} from '@/utils/deals';
import type { Deal } from '@shared/types/deals';

type DealListRowProps = {
    deal: Deal;
    selected: boolean;
    onSelect: () => void;
};

/**
 * One row in the deals master list — image with the posted date overlaid, address over
 * city/state, price → potential ARV, and specs, with the deal type badged top-right.
 * Deliberately lean: everything else lives in the detail panel. `selected` paints the
 * current-selection wash (cyan, the sanctioned "current" accent).
 */
function DealListRow({ deal, selected, onSelect }: DealListRowProps) {
    const type = dealTypeMeta(deal.dealType);
    const price = toMoney(deal.price);
    const arv = toMoney(deal.potentialARV);
    const cityLine = [formatAddress(deal.city), deal.state].filter(Boolean).join(', ');
    const posted = formatPostedDate(deal.createdAt);

    const { beds, baths, sqft } = dealSpecs(deal);
    const specs: string[] = [];
    if (beds !== null) specs.push(`${beds} bd`);
    if (baths !== null) specs.push(`${baths} ba`);
    if (sqft !== null) specs.push(`${sqft.toLocaleString()} sqft`);
    if (deal.propertyType) specs.push(deal.propertyType);

    return (
        <button
            type="button"
            onClick={onSelect}
            aria-current={selected}
            className={cn(
                'flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors',
                selected ? 'border-primary/40 bg-primary/10' : 'border-transparent hover-elevate',
            )}
        >
            {/* Posted date rides the thumbnail (the "days on market" spot) so the text
                column stays purely address / location / numbers / specs. */}
            <div className="relative shrink-0">
                <DealImage
                    src={deal.streetViewUrl}
                    alt={formatAddress(deal.address) ?? 'Deal property'}
                    className="h-20 w-20 rounded-md"
                    iconClassName="h-6 w-6"
                />
                {posted && (
                    <span className="absolute inset-x-0 bottom-0 rounded-b-md bg-background/85 py-0.5 text-center text-xs font-medium text-muted-foreground backdrop-blur">
                        {posted}
                    </span>
                )}
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-start justify-between gap-2">
                    <p className="flex min-w-0 items-center gap-1.5 font-medium leading-tight text-foreground">
                        {deal.isArvExclusive && (
                            <Star
                                className="h-3.5 w-3.5 shrink-0 fill-primary text-primary"
                                aria-label="ARV Exclusive"
                            />
                        )}
                        <span className="truncate">
                            {formatAddress(deal.address) ?? 'Undisclosed Address'}
                        </span>
                    </p>
                    <Badge variant={type.badge} size="sm" className="shrink-0">
                        {type.label}
                    </Badge>
                </div>

                <p className="truncate text-xs text-muted-foreground">
                    {cityLine || 'Location undisclosed'}
                </p>

                {/* Compact form ($620K) keeps the price scannable in a narrow column; the arrow
                    tells the flip story — buy at price, worth ARV after repair. */}
                <p className="flex items-center gap-1.5 tabular-nums">
                    {price !== null && (
                        <span className="text-base font-semibold leading-tight text-foreground">
                            {formatCompactUsd(price)}
                        </span>
                    )}
                    {price !== null && arv !== null && (
                        <MoveRight
                            className="h-4 w-4 shrink-0 text-spread-positive"
                            aria-hidden="true"
                        />
                    )}
                    {arv !== null && (
                        <span className="text-base font-semibold leading-tight text-spread-positive">
                            {formatCompactUsd(arv)}
                        </span>
                    )}
                    {price === null && arv === null && (
                        <span className="text-sm font-medium text-muted-foreground">
                            Price on request
                        </span>
                    )}
                </p>

                {specs.length > 0 && (
                    <p className="truncate text-xs text-muted-foreground">
                        {specs.map((spec, i) => (
                            <span key={spec}>
                                {i > 0 && <span className="px-1 text-muted-foreground/50">·</span>}
                                {spec}
                            </span>
                        ))}
                    </p>
                )}
            </div>
        </button>
    );
}

export default memo(DealListRow);
