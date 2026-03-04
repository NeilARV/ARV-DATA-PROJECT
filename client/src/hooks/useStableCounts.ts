import { useState, useEffect } from "react";

export interface UseStableCountsOptions {
  viewMode: string;
  propertiesResponseTotal: number | undefined;
  buyersFeedResponseTotal: number | undefined;
  isLoadingProperties: boolean;
  isLoadingBuyersFeed: boolean;
  selectedCompanyPropertyCount: number;
  selectedCompany: string | null;
}

export interface UseStableCountsResult {
  stablePropertyCount: number;
  stableCompanyPropertyCount: number;
}

/**
 * Tracks stable property counts to avoid flashing "0" during loading.
 * Updates only when we have actual data (not during loading), and resets
 * company count when company is deselected.
 */
export function useStableCounts({
  viewMode,
  propertiesResponseTotal,
  buyersFeedResponseTotal,
  isLoadingProperties,
  isLoadingBuyersFeed,
  selectedCompanyPropertyCount,
  selectedCompany,
}: UseStableCountsOptions): UseStableCountsResult {
  const [stablePropertyCount, setStablePropertyCount] = useState(0);
  const [stableCompanyPropertyCount, setStableCompanyPropertyCount] =
    useState(0);

  useEffect(() => {
    if (viewMode === "buyers-feed") {
      if (
        buyersFeedResponseTotal !== undefined &&
        !isLoadingBuyersFeed
      ) {
        setStablePropertyCount(buyersFeedResponseTotal);
      }
    } else if (viewMode !== "map") {
      if (
        propertiesResponseTotal !== undefined &&
        !isLoadingProperties
      ) {
        setStablePropertyCount(propertiesResponseTotal);
      }
    }
  }, [
    viewMode,
    buyersFeedResponseTotal,
    propertiesResponseTotal,
    isLoadingProperties,
    isLoadingBuyersFeed,
  ]);

  useEffect(() => {
    if (selectedCompanyPropertyCount > 0) {
      setStableCompanyPropertyCount(selectedCompanyPropertyCount);
    } else if (!selectedCompany) {
      setStableCompanyPropertyCount(0);
    }
  }, [selectedCompanyPropertyCount, selectedCompany]);

  return { stablePropertyCount, stableCompanyPropertyCount };
}
