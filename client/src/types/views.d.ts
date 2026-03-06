import { SidebarView } from "./options";

export type WholesaleLeaderboardEntry = {
  rank: number;
  companyId: string;
  companyName: string;
  wholesaleCount: number;
}

export type GridViewProps = {
  showWholesaleLeaderboard?: boolean;
  sideBarView?: SidebarView
}