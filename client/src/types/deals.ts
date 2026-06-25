import type { Deal } from '@shared/types/deals';

// Client-only UI filter for the deals location search (county / MSA / city / zip).
export type LocationFilter =
    | { type: 'county'; value: string; state: string }
    | { type: 'msa'; value: string }
    | { type: 'city'; value: string; state: string }
    | { type: 'zip'; value: string };

// One deal column's view-model (New or Sold): its loaded deals plus pagination state.
// Bundled so DealsGrid takes one object per column instead of parallel new*/sold* props.
export type DealColumn = {
    deals: Deal[];
    count: number;
    hasMore: boolean;
    isLoadingMore: boolean;
    onLoadMore: () => void;
};
