import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus } from "lucide-react";
import DealsLocationSearch from "@/components/deals/DealsLocationSearch";
import type { LocationFilter } from "@/components/deals/DealsLocationSearch";

type DealsHeaderProps = {
    tab: DealTab;
    deals: Deal[];
    locationFilter: LocationFilter | null;
    onTabChange: (tab: DealTab) => void;
    onAddDeal: () => void;
    onLocationFilterChange: (filter: LocationFilter | null) => void;
};

export default function DealsHeader({
    tab,
    deals,
    locationFilter,
    onTabChange,
    onAddDeal,
    onLocationFilterChange,
}: DealsHeaderProps) {
    const title = tab === "mine"
        ? "Your Deal Feed"
        : locationFilter?.type === "msa"  ? `${locationFilter.county} County Deals`
        : locationFilter?.type === "city" ? `${locationFilter.label} Deals`
        : locationFilter?.type === "zip"  ? `Zip ${locationFilter.label} Deals`
        : "All Deals";

    const subtitle = tab === "mine"
        ? "Deals you have posted"
        : locationFilter
        ? "Filtered by location"
        : "All active deals";

    return (
        <div className="border-b border-border bg-background flex-shrink-0">
            {/* Primary row */}
            <div className="flex items-center gap-3 px-4 2xl:px-6 py-3">
                <div className="flex-1 min-w-0">
                    <h2 className="font-semibold text-base 2xl:text-lg text-foreground truncate">{title}</h2>
                    <p className="hidden 2xl:block text-sm text-muted-foreground mt-0.5">{subtitle}</p>
                </div>

                {/* Desktop: location search + tabs + button inline */}
                <div className="hidden 2xl:flex flex-shrink-0">
                    <DealsLocationSearch deals={deals} value={locationFilter} onChange={onLocationFilterChange} />
                </div>
                <div className="hidden 2xl:flex items-center justify-end gap-3 flex-1">
                    <Tabs value={tab} onValueChange={(v) => onTabChange(v as DealTab)}>
                        <TabsList>
                            <TabsTrigger value="all">All Deals</TabsTrigger>
                            <TabsTrigger value="mine">Your Deals</TabsTrigger>
                        </TabsList>
                    </Tabs>
                    <Button size="sm" onClick={onAddDeal} className="h-9 gap-1.5 text-sm flex-shrink-0">
                        <Plus className="w-4 h-4" />
                        Add Deal
                    </Button>
                </div>

                {/* Compact: Add Deal button only */}
                <Button size="sm" onClick={onAddDeal} className="2xl:hidden h-9 gap-1.5 text-sm flex-shrink-0">
                    <Plus className="w-4 h-4" />
                    Add Deal
                </Button>
            </div>

            {/* Compact second row: search + tabs */}
            <div className="2xl:hidden flex items-center gap-2 px-4 pb-3">
                <div className="flex-1 min-w-0">
                    <DealsLocationSearch deals={deals} value={locationFilter} onChange={onLocationFilterChange} />
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
