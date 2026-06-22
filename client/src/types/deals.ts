// Client-only UI filter for the deals location search (county / MSA / city / zip).
export type LocationFilter =
    | { type: 'county'; value: string; state: string }
    | { type: 'msa'; value: string }
    | { type: 'city'; value: string; state: string }
    | { type: 'zip'; value: string };
