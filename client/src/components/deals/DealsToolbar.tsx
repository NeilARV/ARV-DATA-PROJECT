import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { MsaCountyPicker } from '@/components/MsaCountyPicker';
import { msaShortName } from '@/lib/county';
import type { MsaCountySelection } from '@/types/filters';
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
    selection: MsaCountySelection;
    onTypeFilterChange: (type: DealTypeFilter) => void;
    onSelectionChange: (selection: MsaCountySelection) => void;
    onAddDeal: () => void;
};

/**
 * The deals filter bar: the marketplace title (named for the MSA being browsed) sits on the left,
 * the county picker sits centered with the deal-type dropdown beside it, and the primary Add
 * action is pinned to the far right. Equal flex zones keep the picker cluster optically centered.
 * Scope (all vs mine) lives on the list column, not here.
 */
export default function DealsToolbar({
    typeFilter,
    selection,
    onTypeFilterChange,
    onSelectionChange,
    onAddDeal,
}: DealsToolbarProps) {
    return (
        <div className="flex flex-shrink-0 flex-col gap-2 border-b border-border bg-background px-4 py-3 md:px-6 lg:flex-row lg:items-center">
            {/* Left zone: the page title, truncating before it can push the cluster off-center. */}
            <div className="flex min-w-0 items-center lg:flex-1">
                <h1 className="truncate text-xl font-semibold lg:text-2xl">
                    {`${msaShortName(selection.msa)} Deals Marketplace`}
                </h1>
            </div>

            {/* Centered cluster: type filter next to the county picker. */}
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

                <MsaCountyPicker selection={selection} onSelectionChange={onSelectionChange} />
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
