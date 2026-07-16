import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus } from 'lucide-react';
import { MsaCountyPicker } from '@/components/MsaCountyPicker';
import { msaShortName } from '@/lib/county';
import { getCountiesForMsa } from '@shared/constants/countyToMsa';
import type { MsaCountySelection } from '@/types/filters';
import type { DealTab } from '@shared/types/deals';

type DealsHeaderProps = {
    tab: DealTab;
    selection: MsaCountySelection;
    onTabChange: (tab: DealTab) => void;
    onAddDeal: () => void;
    onSelectionChange: (selection: MsaCountySelection) => void;
};

export default function DealsHeader({
    tab,
    selection,
    onTabChange,
    onAddDeal,
    onSelectionChange,
}: DealsHeaderProps) {
    const allSelected = selection.counties.length === getCountiesForMsa(selection.msa).length;
    const title =
        tab === 'mine'
            ? 'Your Deal Feed'
            : selection.counties.length === 0
              ? 'No Counties Selected'
              : allSelected
                ? `${msaShortName(selection.msa)} MSA Deals`
                : selection.counties.length === 1
                  ? `${selection.counties[0]} County Deals`
                  : `${selection.counties.length} Counties · ${msaShortName(selection.msa)} MSA Deals`;

    return (
        <div className="border-b border-border bg-background flex-shrink-0">
            {/* Primary row */}
            <div className="flex items-center gap-3 px-4 2xl:px-6 py-3">
                <div className="flex-1 min-w-0">
                    <h2 className="font-semibold text-xl text-foreground truncate">
                        Welcome to the ARV Deal Marketplace
                    </h2>
                    <p className="text-sm text-muted-foreground mt-0.5 truncate">{title}</p>
                </div>

                {/* Desktop: county picker + tabs + button inline */}
                <div className="hidden 2xl:flex flex-shrink-0">
                    <MsaCountyPicker selection={selection} onSelectionChange={onSelectionChange} />
                </div>
                <div className="hidden 2xl:flex items-center justify-end gap-3 flex-1">
                    <Tabs value={tab} onValueChange={(v) => onTabChange(v as DealTab)}>
                        <TabsList>
                            <TabsTrigger value="all">All Deals</TabsTrigger>
                            <TabsTrigger value="mine">Your Deals</TabsTrigger>
                        </TabsList>
                    </Tabs>
                    <Button
                        size="sm"
                        onClick={onAddDeal}
                        className="h-9 gap-1.5 text-sm flex-shrink-0"
                    >
                        <Plus className="w-4 h-4" />
                        Add Deal
                    </Button>
                </div>

                {/* Compact: Add Deal button only */}
                <Button
                    size="sm"
                    onClick={onAddDeal}
                    className="2xl:hidden h-9 gap-1.5 text-sm flex-shrink-0"
                >
                    <Plus className="w-4 h-4" />
                    Add Deal
                </Button>
            </div>

            {/* Compact second row: county picker + tabs */}
            <div className="2xl:hidden flex items-center gap-2 px-4 pb-3 overflow-x-auto">
                <div className="flex-1 min-w-0">
                    <MsaCountyPicker selection={selection} onSelectionChange={onSelectionChange} />
                </div>
                <Tabs value={tab} onValueChange={(v) => onTabChange(v as DealTab)}>
                    <TabsList>
                        <TabsTrigger value="all">All</TabsTrigger>
                        <TabsTrigger value="mine">Yours</TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>
        </div>
    );
}
