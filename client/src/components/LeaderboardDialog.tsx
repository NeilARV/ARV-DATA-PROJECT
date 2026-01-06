import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Trophy, Building2, MapPin } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { getCityForZipCode } from "@/lib/zipCodes";

interface LeaderboardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompanyClick?: (companyName: string) => void;
  onZipCodeClick?: (zipCode: string) => void;
}

interface LeaderboardData {
  companies: Array<{ rank: number; name: string; count: number }>;
  zipCodes: Array<{ rank: number; zipCode: string; count: number }>;
}

export default function LeaderboardDialog({ 
  open, 
  onOpenChange,
  onCompanyClick,
  onZipCodeClick,
}: LeaderboardDialogProps) {
  // Fetch leaderboard data from dedicated endpoint (San Diego county only)
  const { data: leaderboardData, isLoading } = useQuery<LeaderboardData>({
    queryKey: ["/api/companies/leaderboard"],
    queryFn: async () => {
      const res = await fetch("/api/companies/leaderboard", {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch leaderboard: ${res.status}`);
      }
      return res.json();
    },
  });

  const topCompanies = leaderboardData?.companies ?? [];
  const topZipCodes = leaderboardData?.zipCodes ?? [];

  const handleCompanyClick = (companyName: string) => {
    if (onCompanyClick) {
      onCompanyClick(companyName);
      onOpenChange(false);
    }
  };

  const handleZipCodeClick = (zipCode: string) => {
    if (onZipCodeClick) {
      onZipCodeClick(zipCode);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Trophy className="w-5 h-5 text-yellow-500" />
            Leaderboard
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          View the top flipping companies and zip codes
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-lg font-semibold border-b pb-2">
              <Building2 className="w-5 h-5 text-primary" />
              Top 10 Companies
            </div>
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(10)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : topCompanies.length === 0 ? (
              <p className="text-muted-foreground text-sm">No property data available</p>
            ) : (
              <div className="space-y-1">
                {topCompanies.map((company) => (
                  <button
                    key={company.name}
                    onClick={() => handleCompanyClick(company.name)}
                    className="w-full flex items-center justify-between p-2 rounded-md bg-muted/50 hover-elevate cursor-pointer text-left transition-colors"
                    data-testid={`leaderboard-company-${company.rank}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        company.rank === 1 ? 'bg-yellow-500 text-yellow-950' :
                        company.rank === 2 ? 'bg-gray-300 text-gray-800' :
                        company.rank === 3 ? 'bg-amber-600 text-amber-50' :
                        'bg-muted-foreground/20 text-muted-foreground'
                      }`}>
                        {company.rank}
                      </span>
                      <span className="font-medium text-sm truncate max-w-[180px]" title={company.name}>
                        {company.name}
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-primary">
                      {company.count} {company.count === 1 ? 'property' : 'properties'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-lg font-semibold border-b pb-2">
              <MapPin className="w-5 h-5 text-primary" />
              Top 10 Zip Codes
            </div>
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(10)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : topZipCodes.length === 0 ? (
              <p className="text-muted-foreground text-sm">No property data available</p>
            ) : (
              <div className="space-y-1">
                {topZipCodes.map((zip) => (
                  <button
                    key={zip.zipCode}
                    onClick={() => handleZipCodeClick(zip.zipCode)}
                    className="w-full flex items-center justify-between p-2 rounded-md bg-muted/50 hover-elevate cursor-pointer text-left transition-colors"
                    data-testid={`leaderboard-zip-${zip.rank}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        zip.rank === 1 ? 'bg-yellow-500 text-yellow-950' :
                        zip.rank === 2 ? 'bg-gray-300 text-gray-800' :
                        zip.rank === 3 ? 'bg-amber-600 text-amber-50' :
                        'bg-muted-foreground/20 text-muted-foreground'
                      }`}>
                        {zip.rank}
                      </span>
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">
                          {zip.zipCode}
                        </span>
                        {getCityForZipCode(zip.zipCode) && (
                          <span className="text-xs text-muted-foreground">
                            {getCityForZipCode(zip.zipCode)}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-primary">
                      {zip.count} {zip.count === 1 ? 'property' : 'properties'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
