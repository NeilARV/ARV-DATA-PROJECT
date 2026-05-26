import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trophy } from "lucide-react";
import { useCompanies } from "@/hooks/useCompanies";

type BestBuyersContentProps = {
  buyers: TopBuyer[];
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
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

export function BestBuyersDialog({
  buyers,
  address,
  city,
  state,
  zipCode,
  onClose,
}: BestBuyersContentProps) {
  const { handleCompanyClick } = useCompanies();

  const locationStr = [address, city, state, zipCode].filter(Boolean).join(", ");

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-xl">
          <Trophy className="w-5 h-5 text-amber-500" />
          Top Potential Buyers
        </DialogTitle>
      </DialogHeader>

      {locationStr && (
        <p className="text-sm text-muted-foreground">
          Top buyer matches for {locationStr}
        </p>
      )}

      <div className="flex flex-col gap-2 mt-2">
        {buyers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No buyers found for this property.</p>
        ) : (
          buyers.map((buyer, i) => {
            const rank = i + 1;
            const isLinked = !!buyer.companyId;
            const Wrapper = isLinked ? "button" : "div";
            return (
              <Wrapper
                key={buyer.companyName}
                {...(isLinked
                  ? {
                      type: "button" as const,
                      onClick: () => {
                        handleCompanyClick(buyer.companyName, buyer.companyId);
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
                  <p className="text-sm font-medium truncate">{buyer.companyName}</p>
                  {buyer.contactName && (
                    <p className="text-xs text-muted-foreground truncate">{buyer.contactName}</p>
                  )}
                </div>
              </Wrapper>
            );
          })
        )}
      </div>
    </>
  );
}
