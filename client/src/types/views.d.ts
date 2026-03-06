import { SidebarView } from "./options";

export type WholesaleLeaderboardEntry = {
  rank: number;
  companyId: string;
  companyName: string;
  wholesaleCount: number;
}

export type GridViewProps = {
  properties: Property[];
  showWholesaleLeaderboard?: boolean;
  sideBarView?: SidebarView
}

export type TableViewProps = {
  properties: Property[];
}