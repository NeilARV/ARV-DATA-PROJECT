import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus } from "lucide-react";

type DealsHeaderProps = {
    tab: DealTab;
    msaName: string;
    onTabChange: (tab: DealTab) => void;
    onAddDeal: () => void;
};

export default function DealsHeader({ tab, msaName, onTabChange, onAddDeal }: DealsHeaderProps) {
    return (
        <div className="border-b border-border bg-background px-6 py-3 flex items-center justify-between gap-4 flex-shrink-0">
            <div>
                <h2 className="font-semibold text-lg text-foreground">
                    {tab === "mine" ? "Your Deal Feed" : `${msaName} Deal Feed`}
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                    {tab === "mine" ? "Deals you have posted" : "Active deals in your market"}
                </p>
            </div>
            <div className="flex items-center gap-3">
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
        </div>
    );
}
