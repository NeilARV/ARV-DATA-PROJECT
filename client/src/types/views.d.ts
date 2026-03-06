export type WholesaleLeaderboardEntry = {
  rank: number;
  companyId: string;
  companyName: string;
  wholesaleCount: number;
}

export type GridViewProps = {
  properties: Property[];
  gridColsClass: string;
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

export type TableViewProps = {
  properties: Property[];
  isLoadingMoreProperties: boolean;
  isLoading?: boolean;
  loadMoreRef: React.RefObject<HTMLDivElement>;
}