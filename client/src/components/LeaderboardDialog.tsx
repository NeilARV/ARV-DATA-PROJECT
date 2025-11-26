import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Trophy, Building2, MapPin } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Property } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";

interface LeaderboardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompanyClick?: (companyName: string) => void;
  onZipCodeClick?: (zipCode: string) => void;
}

export default function LeaderboardDialog({ 
  open, 
  onOpenChange,
  onCompanyClick,
  onZipCodeClick,
}: LeaderboardDialogProps) {
  const { data: properties, isLoading } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });

  const getTopCompanies = () => {
    if (!properties) return [];
    
    const companyCounts: Record<string, number> = {};
    properties.forEach((property) => {
      const owner = property.propertyOwner || "Unknown";
      companyCounts[owner] = (companyCounts[owner] || 0) + 1;
    });

    return Object.entries(companyCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count], index) => ({ rank: index + 1, name, count }));
  };

  const getTopZipCodes = () => {
    if (!properties) return [];
    
    const zipCounts: Record<string, number> = {};
    properties.forEach((property) => {
      const zip = property.zipCode || "Unknown";
      zipCounts[zip] = (zipCounts[zip] || 0) + 1;
    });

    return Object.entries(zipCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([zipCode, count], index) => ({ rank: index + 1, zipCode, count }));
  };

  const topCompanies = getTopCompanies();
  const topZipCodes = getTopZipCodes();

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
          Click on any entry to view those properties
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-lg font-semibold border-b pb-2">
              <Building2 className="w-5 h-5 text-primary" />
              Top 10 Flipping Companies
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
                      <span className="font-medium text-sm">
                        {zip.zipCode}
                      </span>
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
