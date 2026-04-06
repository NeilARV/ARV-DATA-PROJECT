import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trophy } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompanies } from "@/hooks/useCompanies";

interface BestBuyer {
  name: string;
  formattedName: string;
  matchScore: number;
  matchReasons: string[];
  totalAcquisitions: number;
  purchasesWithinQuarterMile: number;
  purchasesWithinOneMile: number;
  recentPurchasesCount: number;
  companyId: string | null;
  contactName: string | null;
}

interface BestBuyersContentProps {
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  onClose: () => void;
}

function rankBadgeClass(rank: number) {
  return rank === 1
    ? "bg-amber-400 text-white"
    : rank === 2
    ? "bg-slate-400 text-white"
    : "bg-amber-700 text-amber-100";
}

function borderAccentClass(rank: number) {
  return rank === 1
    ? "border-l-amber-400"
    : rank === 2
    ? "border-l-slate-400"
    : "border-l-amber-700";
}

export default function BestBuyersContent({ address, city, state, zipCode, onClose }: BestBuyersContentProps) {
  const { handleCompanyClick } = useCompanies();

  const hasAddress = !!address && !!city && !!state;

  const { data, isLoading, isError } = useQuery<{ buyers: BestBuyer[] }>({
    queryKey: ["/api/deals/best-buyers", address, city, state, zipCode],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("address", address!);
      params.set("city", city!);
      params.set("state", state!);
      if (zipCode) params.set("zipCode", zipCode);
      const res = await fetch(`/api/deals/best-buyers?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch best buyers");
      return res.json();
    },
    enabled: hasAddress,
  });

  const buyers = data?.buyers ?? [];

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-xl">
          <Trophy className="w-5 h-5 text-amber-500" />
          Top Buyers
        </DialogTitle>
      </DialogHeader>

      <p className="text-sm text-muted-foreground">
        {hasAddress
          ? `Best cash buyer matches for ${[address, city, state, zipCode].filter(Boolean).join(", ")}`
          : "No address available for this deal"}
      </p>

      <div className="flex flex-col gap-2 mt-2">
        {!hasAddress ? (
          <p className="text-sm text-muted-foreground">
            An address is required to find top buyers.
          </p>
        ) : isLoading ? (
          [...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
        ) : isError ? (
          <p className="text-sm text-destructive">Failed to load buyers. Please try again.</p>
        ) : buyers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No buyers found for this property.</p>
        ) : (
          buyers.map((buyer, i) => {
            const rank = i + 1;
            const isLinked = !!buyer.companyId;
            const Wrapper = isLinked ? "button" : "div";
            return (
              <Wrapper
                key={buyer.formattedName}
                {...(isLinked
                  ? {
                      type: "button" as const,
                      onClick: () => {
                        handleCompanyClick(buyer.name, buyer.companyId);
                        onClose();
                      },
                      className: `w-full flex items-center gap-3 p-3 rounded-md border border-border border-l-4 bg-background text-left transition-colors hover:bg-muted/50 cursor-pointer ${borderAccentClass(rank)}`,
                    }
                  : {
                      className: `flex items-center gap-3 p-3 rounded-md border border-border border-l-4 bg-background ${borderAccentClass(rank)}`,
                    })}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${rankBadgeClass(rank)}`}
                >
                  {rank}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{buyer.name}</p>
                  {buyer.contactName && (
                    <p className="text-xs text-muted-foreground truncate">{buyer.contactName}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-semibold text-primary">
                    {buyer.totalAcquisitions} acq.
                  </p>
                </div>
              </Wrapper>
            );
          })
        )}
      </div>
    </>
  );
}
