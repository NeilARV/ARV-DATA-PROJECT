import { DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Trophy, Building2, MapPin } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { getCityForZipCode } from '@/lib/zipCodes';
import { useFilters } from '@/hooks/useFilters';
import { useCompanies } from '@/hooks/useCompanies';
import { useProperty } from '@/hooks/useProperty';
import { useView } from '@/hooks/useView';
import { getDefaultFilters } from '@/lib/propertyFilters';
import { useGeoMap } from '@/hooks/useMap';
import { MAP_ZOOM_DEFAULT } from '@/constants/map.constants';

type LeaderboardData = {
    companies: Array<{ rank: number; name: string; count: number; contactName: string | null }>;
    zipCodes: Array<{ rank: number; zipCode: string; count: number }>;
};

interface LeaderboardContentProps {
    onClose: () => void;
}

export function LeaderboardDialog({ onClose }: LeaderboardContentProps) {
    const { filters, setFilters } = useFilters();
    const { setCompany, handleCompanyClick } = useCompanies();
    const { setProperty } = useProperty();
    const { setSidebarView } = useView();
    const { setMapZoom, setMapCenter } = useGeoMap();

    const { data: leaderboardData, isLoading } = useQuery<LeaderboardData>({
        queryKey: ['/api/companies/leaderboard', { counties: filters.counties }],
        queryFn: async () => {
            const params = new URLSearchParams();
            filters.counties.forEach((county) => params.append('county', county));
            const qs = params.toString();
            const res = await fetch(`/api/companies/leaderboard${qs ? `?${qs}` : ''}`, {
                credentials: 'include',
            });
            if (!res.ok) throw new Error(`Failed to fetch leaderboard: ${res.status}`);
            return res.json();
        },
        // With no counties selected there is nothing to rank — render empty boards, skip the fetch.
        enabled: filters.counties.length > 0,
    });

    const topCompanies = leaderboardData?.companies ?? [];
    const topZipCodes = leaderboardData?.zipCodes ?? [];

    const onCompanyClick = (companyName: string) => {
        setProperty(null);
        handleCompanyClick(companyName, null);
        onClose();
    };

    const handleZipCodeClick = (zipCode: string) => {
        setMapCenter(undefined);
        setMapZoom(MAP_ZOOM_DEFAULT);
        setCompany(null);
        setFilters(
            getDefaultFilters({
                zipCode,
                msa: filters.msa,
                counties: filters.counties,
                statusFilters: ['in-renovation', 'on-market', 'sold'],
            }),
        );
        setSidebarView('filters');
        onClose();
    };

    return (
        <>
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-xl">
                    <Trophy className="w-5 h-5 text-yellow-500" />
                    Leaderboard
                </DialogTitle>
            </DialogHeader>

            <p className="text-sm text-muted-foreground">
                View the most active companies and zip codes{' '}
                {filters.counties.length === 1
                    ? ` in ${filters.counties[0]} County`
                    : filters.counties.length > 1
                      ? ` across ${filters.counties.length} counties`
                      : ''}
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
                                    onClick={() => onCompanyClick(company.name)}
                                    className="w-full flex items-center justify-between p-2 rounded-md bg-muted/50 hover-elevate cursor-pointer text-left transition-colors"
                                    data-testid={`leaderboard-company-${company.rank}`}
                                >
                                    <div className="flex items-start gap-3">
                                        <span
                                            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mt-0.5 ${
                                                company.rank === 1
                                                    ? 'bg-yellow-500 text-yellow-950'
                                                    : company.rank === 2
                                                      ? 'bg-muted-foreground text-background'
                                                      : company.rank === 3
                                                        ? 'bg-amber-600 text-amber-50'
                                                        : 'bg-muted-foreground/20 text-muted-foreground'
                                            }`}
                                        >
                                            {company.rank}
                                        </span>
                                        <div className="flex flex-col min-w-0">
                                            <span
                                                className="font-medium text-sm truncate max-w-[180px]"
                                                title={company.name}
                                            >
                                                {company.name}
                                            </span>
                                            {company.contactName && (
                                                <span
                                                    className="text-xs text-muted-foreground truncate max-w-[180px]"
                                                    title={company.contactName}
                                                >
                                                    {company.contactName}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <span className="text-sm font-semibold text-primary">
                                        {company.count}{' '}
                                        {company.count === 1 ? 'property' : 'properties'}
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
                                        <span
                                            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                                zip.rank === 1
                                                    ? 'bg-yellow-500 text-yellow-950'
                                                    : zip.rank === 2
                                                      ? 'bg-muted-foreground text-background'
                                                      : zip.rank === 3
                                                        ? 'bg-amber-600 text-amber-50'
                                                        : 'bg-muted-foreground/20 text-muted-foreground'
                                            }`}
                                        >
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
        </>
    );
}
