// Client-only UI filter for the deals location search (county / MSA / city / zip).
export type LocationFilter =
    | { type: 'county'; value: string; state: string }
    | { type: 'msa'; value: string }
    | { type: 'city'; value: string; state: string }
    | { type: 'zip'; value: string };

// What the current viewer may do with a specific deal — computed per-deal from role + ownership,
// so the row/detail stay presentational and the preview can supply its own caps.
export type DealCaps = {
    canEdit: boolean;
    canDelete: boolean;
    canRequestContact: boolean;
    canSubmitOffer: boolean;
    /** Viewer posted this deal — may see received offers and top potential buyers. */
    isOwner: boolean;
    /** Admin / owner / RM — sees the poster + internal-notes footer. */
    canViewPoster: boolean;
};
