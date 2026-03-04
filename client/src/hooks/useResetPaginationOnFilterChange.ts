import React, { useEffect } from "react";
import type { PropertyFilters } from "@/types/filters";
import type { SortOption } from "@/types/options";
import type { Property } from "@/types/property";

export interface UseResetPaginationOnFilterChangeOptions {
  viewMode: string;
  filters: PropertyFilters;
  selectedCompanyId: string | null;
  selectedCompany: string | null;
  sortBy: SortOption;
  setPropertiesPage: (n: number | ((prev: number) => number)) => void;
  setAllProperties: React.Dispatch<React.SetStateAction<Property[]>>;
  setPropertiesHasMore: (v: boolean) => void;
  setIsLoadingMoreProperties: (v: boolean) => void;
  setBuyersFeedPage: (n: number | ((prev: number) => number)) => void;
  setAllBuyersFeedProperties: React.Dispatch<React.SetStateAction<Property[]>>;
  setBuyersFeedHasMore: (v: boolean) => void;
  setIsLoadingMoreBuyersFeed: (v: boolean) => void;
}

/**
 * Resets pagination when filters, company selection, view mode, or sort change.
 * - For grid/table/wholesale: resets properties page, list, hasMore, loading.
 * - For buyers-feed: resets buyers feed page, list, hasMore, loading.
 */
export function useResetPaginationOnFilterChange({
  viewMode,
  filters,
  selectedCompanyId,
  selectedCompany,
  sortBy,
  setPropertiesPage,
  setAllProperties,
  setPropertiesHasMore,
  setIsLoadingMoreProperties,
  setBuyersFeedPage,
  setAllBuyersFeedProperties,
  setBuyersFeedHasMore,
  setIsLoadingMoreBuyersFeed,
}: UseResetPaginationOnFilterChangeOptions): void {
  useEffect(() => {
    if (viewMode !== "map" && viewMode !== "buyers-feed") {
      setPropertiesPage(1);
      setAllProperties([]);
      setPropertiesHasMore(true);
      setIsLoadingMoreProperties(false);
    }
  }, [
    viewMode,
    filters,
    selectedCompanyId,
    selectedCompany,
    sortBy,
    setPropertiesPage,
    setAllProperties,
    setPropertiesHasMore,
    setIsLoadingMoreProperties,
  ]);

  useEffect(() => {
    if (viewMode === "buyers-feed") {
      setBuyersFeedPage(1);
      setAllBuyersFeedProperties([]);
      setBuyersFeedHasMore(true);
      setIsLoadingMoreBuyersFeed(false);
    }
  }, [
    viewMode,
    filters,
    selectedCompanyId,
    selectedCompany,
    sortBy,
    setBuyersFeedPage,
    setAllBuyersFeedProperties,
    setBuyersFeedHasMore,
    setIsLoadingMoreBuyersFeed,
  ]);
}
