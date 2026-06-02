import { Trophy } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchRecommendedVendors } from '@/api/vendors.api';
import { VendorCard } from './VendorCard';
import type { Vendor } from '@/types/vendors';

type RecommendedVendorsProps = {
    selectedVendorId: string | null;
    onSelectVendor: (vendor: Vendor) => void;
};

export function RecommendedVendors({ selectedVendorId, onSelectVendor }: RecommendedVendorsProps) {
    const { data: vendors, isLoading } = useQuery({
        queryKey: ['vendors-recommended'],
        queryFn: fetchRecommendedVendors,
        staleTime: 5 * 60 * 1000,
    });

    return (
        <div>
            <div className="flex items-center gap-2 mb-3">
                <Trophy className="w-4 h-4 text-primary flex-shrink-0" />
                <h2 className="font-semibold text-lg text-foreground">
                    Most Recommended this Month
                </h2>
            </div>

            {isLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3 gap-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />
                    ))}
                </div>
            ) : !vendors || vendors.length === 0 ? (
                <div className="flex items-center justify-center h-24">
                    <p className="text-sm text-muted-foreground">No Recommendations</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3 gap-3">
                    {vendors.map((vendor) => (
                        <VendorCard
                            key={vendor.id}
                            vendor={vendor}
                            isSelected={selectedVendorId === vendor.id}
                            onClick={onSelectVendor}
                        />
                    ))}
                </div>
            )}

            <div className="my-4 border-b border-border" />
        </div>
    );
}
