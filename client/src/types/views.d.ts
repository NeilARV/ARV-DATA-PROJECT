export type WholesaleLeaderboardEntry = {
  rank: number;
  companyId: string;
  companyName: string;
  wholesaleCount: number;
}

export type GridView = {
  properties: Property[];
  selectedCompany: string | null;
  totalCompanyProperties: number;
  totalFilteredProperties: number;
  hasActiveFilters: boolean;
  sortBy: SortOption;
  onSortChange: (sortBy: SortOption) => void;
  onPropertyClick: (property: Property) => void;
  onClearCompanyFilter: () => void;
  onClearFilters: () => void;
  gridColsClass: string;
  propertiesHasMore: boolean;
  isLoadingMoreProperties: boolean;
  isLoading?: boolean;
  loadMoreRef: React.RefObject<HTMLDivElement>;
  /** When true (wholesale feed), show top 3 wholesalers leaderboard in the header */
  showWholesaleLeaderboard?: boolean;
  /** County filter for wholesale leaderboard (e.g. "San Diego") */
  county?: string;
  /** Called when user clicks a company in the wholesale leaderboard */
  onWholesaleLeaderboardCompanyClick?: (companyName: string, companyId?: string) => void;
}

export type TableView = {
  properties: Property[];
  selectedCompany: string | null;
  totalCompanyProperties: number;
  totalFilteredProperties: number;
  hasActiveFilters: boolean;
  onPropertyClick: (property: Property) => void;
  onClearCompanyFilter: () => void;
  onClearFilters: () => void;
  propertiesHasMore: boolean;
  isLoadingMoreProperties: boolean;
  isLoading?: boolean;
  loadMoreRef: React.RefObject<HTMLDivElement>;
}