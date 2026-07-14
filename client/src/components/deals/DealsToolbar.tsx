import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import DealsLocationSearch from '@/components/deals/DealsLocationSearch';
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

type DealsToolbarProps = {
    typeFilter: DealTypeFilter;
    locationFilter: LocationFilter | null;
    onTypeFilterChange: (type: DealTypeFilter) => void;
    onLocationFilterChange: (filter: LocationFilter | null) => void;
    onAddDeal: () => void;
};

/**
 * The deals filter bar: the location search sits centered with the deal-type dropdown beside it,
 * while the primary Add action is pinned to the far right. Equal flex spacers keep the search
 * cluster optically centered regardless of the Add button's width. Scope (all vs mine) lives on the
 * list column, not here.
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
            {/* Left spacer — balances the right zone so the cluster stays centered (desktop only). */}
            <div className="hidden lg:block lg:flex-1" />

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
