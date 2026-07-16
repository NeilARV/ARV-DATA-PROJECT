import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import DealsLocationSearch, { msaShortName } from '@/components/deals/DealsLocationSearch';
import { getMsaNameFromCounty } from '@/lib/county';
import type { LocationFilter } from '@/types/deals';
import type { DealType } from '@shared/types/deals';

export type DealTypeFilter = DealType | 'all';

const TYPE_OPTIONS: { value: DealTypeFilter; label: string }[] = [
    { value: 'all', label: 'All Types' },
    { value: 'wholesale', label: 'Wholesale' },
    { value: 'reo', label: 'REO' },
    { value: 'agent', label: 'Agent' },
    { value: 'sold', label: 'Sold' },
];

/**
 * The marketplace heading for the market being browsed — the MSA when the filter names one
 * (directly, or via its county), otherwise the generic marketplace title.
 */
function marketplaceTitle(filter: LocationFilter | null): string {
    const msa =
        filter?.type === 'msa'
            ? filter.value
            : filter?.type === 'county'
              ? getMsaNameFromCounty(filter.value)
              : undefined;
    return msa ? `${msaShortName(msa)} Deals Marketplace` : 'Deals Marketplace';
}

type DealsToolbarProps = {
    typeFilter: DealTypeFilter;
    locationFilter: LocationFilter | null;
    onTypeFilterChange: (type: DealTypeFilter) => void;
    onLocationFilterChange: (filter: LocationFilter | null) => void;
    onAddDeal: () => void;
};

/**
 * The deals filter bar: the marketplace title (named for the MSA being browsed) sits on the left,
 * the location search sits centered with the deal-type dropdown beside it, and the primary Add
 * action is pinned to the far right. Equal flex zones keep the search cluster optically centered.
 * Scope (all vs mine) lives on the list column, not here.
 */
export default function DealsToolbar({
    typeFilter,
    locationFilter,
    onTypeFilterChange,
    onLocationFilterChange,
    onAddDeal,
}: DealsToolbarProps) {
    return (
        <div className="flex flex-shrink-0 flex-col gap-2 border-b border-border bg-background px-4 py-3 md:px-6 lg:flex-row lg:items-center">
            {/* Left zone: the page title, truncating before it can push the cluster off-center. */}
            <div className="flex min-w-0 items-center lg:flex-1">
                <h1 className="truncate text-xl font-semibold lg:text-2xl">
                    {marketplaceTitle(locationFilter)}
                </h1>
            </div>

            {/* Centered cluster: type filter next to the search. */}
            <div className="flex flex-wrap items-center justify-center gap-2">
                <Select
                    value={typeFilter}
                    onValueChange={(v) => onTypeFilterChange(v as DealTypeFilter)}
                >
                    <SelectTrigger className="h-9 w-auto min-w-[7.5rem] shrink-0 gap-1.5">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {TYPE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {/* Fixed width so the search sits beside the dropdown instead of pushing it to
                    a second row (DealsLocationSearch is w-full by default). */}
                <div className="w-full sm:w-72 lg:w-80">
                    <DealsLocationSearch value={locationFilter} onChange={onLocationFilterChange} />
                </div>
            </div>

            {/* Right zone: primary action pinned far right. */}
            <div className="flex justify-end lg:flex-1">
                <Button onClick={onAddDeal} className="h-9 shrink-0 gap-1.5">
                    <Plus className="h-4 w-4" />
                    <span className="hidden sm:inline">Add Deal</span>
                </Button>
            </div>
        </div>
    );
}
