// What the current viewer may do with a specific deal — computed per-deal from role + ownership
// (dealCaps in utils/deals.ts), so the row/detail stay presentational.
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
