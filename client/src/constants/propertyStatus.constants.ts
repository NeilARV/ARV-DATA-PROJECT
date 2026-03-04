import type { Status } from "@/types/options";

/** Property status string constants - use these instead of magic strings. */
export const PROPERTY_STATUS = {
  IN_RENOVATION: "in-renovation",
  WHOLESALE: "wholesale",
  ON_MARKET: "on-market",
  SOLD: "sold",
} as const satisfies Record<string, Status>;

export type PropertyStatusValue = (typeof PROPERTY_STATUS)[keyof typeof PROPERTY_STATUS];

/** Default status filter (single status). */
export const DEFAULT_STATUS_FILTERS: Status[] = [PROPERTY_STATUS.IN_RENOVATION];

/** Status filters when opening leaderboard zip (in-renovation, on-market, sold). */
export const LEADERBOARD_ZIP_STATUS_FILTERS: Status[] = [
  PROPERTY_STATUS.IN_RENOVATION,
  PROPERTY_STATUS.ON_MARKET,
  PROPERTY_STATUS.SOLD,
];

/** Status filters for buyers feed view. */
export const BUYERS_FEED_STATUS_FILTERS: Status[] = [
  PROPERTY_STATUS.WHOLESALE,
  PROPERTY_STATUS.IN_RENOVATION,
];

/** Status filter for wholesale-only view. */
export const WHOLESALE_VIEW_STATUS_FILTERS: Status[] = [PROPERTY_STATUS.WHOLESALE];

/** All status filters (e.g. when a company is selected in directory). */
export const ALL_STATUS_FILTERS: Status[] = [
  PROPERTY_STATUS.IN_RENOVATION,
  PROPERTY_STATUS.WHOLESALE,
  PROPERTY_STATUS.ON_MARKET,
  PROPERTY_STATUS.SOLD,
];
