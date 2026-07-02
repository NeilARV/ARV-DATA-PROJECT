// Postmark template aliases. These are non-secret, environment-independent identifiers (the same
// alias is used in dev and prod), so they live here as constants rather than env vars — one fewer
// thing to configure when standing up a new environment. Mirrors the bucket-name precedent in
// `server/lib/supabase.ts`. Secrets (POSTMARK_SERVER_API_KEY, POSTMARK_ACCOUNT_TOKEN) stay in env.
export const POSTMARK_TEMPLATES = {
    /** Property-update digest sent per MSA by the data-sync email job. */
    PROPERTY_UPDATE: 'property-email-v2',
    /** New deal posted to a subscribed MSA. */
    DEAL_NEW: 'new-deal-v1',
    /** A deal was marked sold. */
    DEAL_SOLD: 'deal-sold-v1',
    /** A deal's price was updated. */
    DEAL_UPDATED: 'deal-updated-v1',
    /** An offer (bid) was submitted on a deal. */
    DEAL_OFFER: 'deal-offer-v1',
    /** Single-click "request info" inquiry routed to the poster/RM. */
    DEAL_INQUIRY: 'deal-inquiry-v1',
    /** Mastermind @mention / @announcement notification email. */
    MASTERMIND_MENTION: 'mastermind-v1',
} as const;
