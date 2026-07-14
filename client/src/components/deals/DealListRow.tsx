import { memo } from 'react';
import { Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import DealImage from '@/components/deals/DealImage';
import { cn } from '@/utils/merge';
import { formatAddress } from '@shared/utils/formatAddress';
import { dealTypeMeta, formatCompactUsd, formatPostedDate, toMoney } from '@/utils/deals';
import type { Deal } from '@shared/types/deals';

type DealListRowProps = {
    deal: Deal;
    selected: boolean;
    onSelect: () => void;
};

/**
 * One row in the deals master list — image, address, deal type, asking price, and where/when.
 * Deliberately lean: everything else lives in the detail panel. `selected` paints the current-
 * selection wash (cyan, the sanctioned "current" accent).
 */
function DealListRow({ deal, selected, onSelect }: DealListRowProps) {
    const type = dealTypeMeta(deal.dealType);
    const price = toMoney(deal.price);
    const cityLine = [formatAddress(deal.city), deal.state].filter(Boolean).join(', ');

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
            <DealImage
                src={deal.streetViewUrl}
                alt={formatAddress(deal.address) ?? 'Deal property'}
                className="h-16 w-16 shrink-0 rounded-md"
                iconClassName="h-6 w-6"
            />

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

                {/* Compact form ($620K) keeps the price scannable in a narrow column. */}
                <p className="text-base font-semibold tabular-nums text-foreground">
                    {price !== null ? formatCompactUsd(price) : 'Price on request'}
                </p>

                <p className="truncate text-xs text-muted-foreground">
                    {cityLine || 'Location undisclosed'}
                    <span className="px-1 text-muted-foreground/50">·</span>
                    {formatPostedDate(deal.createdAt)}
                </p>
            </div>
        </button>
    );
}

export default memo(DealListRow);
