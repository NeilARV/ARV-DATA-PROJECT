import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Users, Building2, MapPin, DollarSign, Calendar } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useEffect, useRef } from "react";

interface RecentPurchase {
  buyerName: string | null;
  address: string;
  price: number | null;
  dateSold: string | null;
  daysAgo: number;
}

interface PaginatedResponse {
  purchases: RecentPurchase[];
  hasMore: boolean;
  total: number;
}

interface BuyersFeedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompanyClick?: (companyName: string) => void;
  county?: string; // County filter from parent
}

export default function BuyersFeedDialog({ 
  open, 
  onOpenChange,
  onCompanyClick,
  county,
}: BuyersFeedDialogProps) {
  const [page, setPage] = useState(1);
  const [allPurchases, setAllPurchases] = useState<RecentPurchase[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, isFetching } = useQuery<PaginatedResponse>({
    queryKey: ["/api/buyers/feed", page, county],
    queryFn: async () => {
      const countyParam = county ? `&county=${encodeURIComponent(county)}` : '';
      const res = await fetch(`/api/buyers/feed?page=${page}&limit=20${countyParam}`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch buyers feed: ${res.status}`);
      }
      return res.json();
    },
    enabled: open, // Only fetch when dialog is open
    staleTime: 0, // Always consider data stale to force refetch
    gcTime: 0, // Don't cache when dialog is closed (formerly cacheTime)
  });

  // Reset when dialog opens or county changes
  useEffect(() => {
    if (open) {
      // Reset state first
      setPage(1);
      setAllPurchases([]);
      setHasMore(true);
      setIsLoadingMore(false);
      // Remove all cached queries for this endpoint to force fresh fetch
      queryClient.removeQueries({ queryKey: ["/api/buyers/feed"] });
    } else {
      // Clear state when dialog closes
      setPage(1);
      setAllPurchases([]);
      setHasMore(true);
      setIsLoadingMore(false);
    }
  }, [open, county, queryClient]);

  // Accumulate purchases when new data arrives
  useEffect(() => {
    if (data && open) { // Only process data when dialog is open
      if (page === 1) {
        // First page - replace all
        setAllPurchases(data.purchases);
      } else {
        // Subsequent pages - append
        setAllPurchases((prev) => [...prev, ...data.purchases]);
      }
      setHasMore(data.hasMore);
      setIsLoadingMore(false);
    }
  }, [data, page, open]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    if (!open || !hasMore || isLoadingMore || isFetching) return;
    if (!loadMoreRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore && !isFetching) {
          setIsLoadingMore(true);
          setPage((prev) => prev + 1);
        }
      },
      { 
        threshold: 0.1,
        rootMargin: '100px' // Start loading 100px before reaching the element
      }
    );

    const currentRef = loadMoreRef.current;
    observer.observe(currentRef);

    return () => {
      observer.disconnect();
    };
  }, [open, hasMore, isLoadingMore, isFetching, allPurchases.length]);

  const formatPrice = (price: number | null) => {
    if (price === null) return "N/A";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);
  };

  const formatDaysAgo = (daysAgo: number) => {
    if (daysAgo === 0) return "Today";
    if (daysAgo === 1) return "1 Day Ago";
    return `${daysAgo} Days Ago`;
  };

  const handleCompanyClick = (companyName: string | null) => {
    if (companyName && onCompanyClick) {
      onCompanyClick(companyName);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Users className="w-5 h-5 text-primary" />
            Buyers Feed
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Recent property purchases by buyers. Click on a company name to view their properties.
        </p>

        <div className="space-y-3 mt-2">
          {(isLoading || isFetching) && page === 1 && allPurchases.length === 0 ? (
            <div className="space-y-2">
              {[...Array(20)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : allPurchases.length === 0 && !isLoading && !isFetching ? (
            <p className="text-muted-foreground text-sm text-center py-8">
              No recent purchases available
            </p>
          ) : (
            <>
              <div className="space-y-2">
                {allPurchases.map((purchase, index) => (
                  <div
                    key={`${purchase.address}-${purchase.dateSold}-${index}`}
                    className="w-full p-4 rounded-md bg-muted/50 border border-border hover:bg-muted transition-colors"
                    data-testid={`buyer-feed-item-${index}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0 space-y-2">
                        {/* Buyer Name */}
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-primary flex-shrink-0" />
                          {purchase.buyerName ? (
                            <button
                              onClick={() => handleCompanyClick(purchase.buyerName)}
                              className="font-semibold text-sm text-primary hover:underline truncate"
                              title={purchase.buyerName}
                            >
                              {purchase.buyerName}
                            </button>
                          ) : (
                            <span className="font-semibold text-sm text-muted-foreground">
                              Unknown Buyer
                            </span>
                          )}
                        </div>

                        {/* Address */}
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          <span className="text-sm text-foreground truncate" title={purchase.address}>
                            {purchase.address}
                          </span>
                        </div>

                        {/* Purchase Price and Date */}
                        <div className="flex items-center gap-4 flex-wrap">
                          <div className="flex items-center gap-2">
                            <DollarSign className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm font-medium text-foreground">
                              {formatPrice(purchase.price)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">
                              {formatDaysAgo(purchase.daysAgo)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Infinite scroll trigger and loading indicator */}
              {hasMore && (
                <div ref={loadMoreRef} className="pt-4 min-h-[50px] flex items-center justify-center">
                  {(isLoadingMore || isFetching) ? (
                    <div className="space-y-2 w-full">
                      {[...Array(5)].map((_, i) => (
                        <Skeleton key={i} className="h-20 w-full" />
                      ))}
                    </div>
                  ) : (
                    <div className="h-1 w-full" /> // Invisible spacer to trigger intersection
                  )}
                </div>
              )}

              {!hasMore && allPurchases.length > 0 && (
                <p className="text-muted-foreground text-sm text-center py-4">
                  No more purchases to load
                </p>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

