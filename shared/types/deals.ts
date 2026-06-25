export type DealType = 'wholesale' | 'agent' | 'sold' | 'reo';
export type DealTab = 'all' | 'mine';

// Top buyers for a deal's zip — fetched on demand via GET /api/deals/:id/top-buyers
// (owner-only), not bundled into the deal list.
export type TopBuyer = {
    companyId: string | null;
    companyName: string;
    contactName: string | null;
};

// A non-binding offer on a deal, as returned by GET /api/deals/:id/offers (poster-only).
export type DealOffer = {
    id: number;
    dealId: number;
    bidderUserId: string;
    amount: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    createdAt: string;
};

// API response shape returned by GET /api/deals
export type Deal = DealProperty & {
    id: number;
    createdAt: string;
    msaId: number;
    msaName?: string | null;
    county?: string | null;
    userEmail?: string | null;
    userFirstName?: string | null;
    userLastName?: string | null;
    userPhone?: string | null;
    userId: string;
    links: { url: string; domain: string }[];
    photosUrl?: string | null;
    adminNotes?: string | null;

    // Count of offers received — present only on the caller's own deals.
    bidCount?: number;

    // Fields that may be null in the database
    sfrPropertyId?: number | null;
    streetViewUrl?: string | null;

    // Admin / RM-only fields
    isArvExclusive: boolean;
    onBehalfOfEmail?: string | null;
};

// Paginated response shape returned by GET /api/deals (one page of a single column).
export type DealsPage = {
    deals: Deal[];
    total: number;
    hasMore: boolean;
    page: number;
    limit: number;
};

// Distinct deal locations for the location-search autocomplete (GET /api/deals/locations).
export type DealLocations = {
    cities: { city: string; state: string }[];
    zips: string[];
};

export type DealProperty = {
    address?: string;
    city: string;
    state: string;
    zipCode: string;
    dealType: DealType;
    price?: number | string | null;
    potentialARV?: number | string | null;
    showingTime?: string | null;
    estimatedBudget?: number | null;
    beds?: number;
    baths?: number;
    sqft?: number;
    propertyType?: string;
    notes?: string;
    photosUrl?: string | null;
};

export type DealToEdit = DealProperty & {
    id: number;
    msaId: number;
    links?: string[];
    adminNotes?: string | null;
    isArvExclusive?: boolean;
    onBehalfOfEmail?: string | null;
};

// Input for POST /api/deals — msaId is derived server-side from the location (client sends it
// only as a fallback); structural fields + sfrPropertyId are fetched server-side from SFR when
// an address is provided, and supplied by the client only for an undisclosed address.
export type CreateDealInput = DealProperty & {
    userId: string;
    msaId?: number;
    sendNotifications?: boolean;
    links?: string[];
    adminNotes?: string | null;
    isArvExclusive?: boolean;
    onBehalfOfEmail?: string | null;
};

// Input for PATCH /api/deals/:id (all fields optional except identity)
export type UpdateDealInput = DealProperty & {
    msaId?: number;
    links?: string[];
    adminNotes?: string | null;
    isArvExclusive?: boolean;
    onBehalfOfEmail?: string | null;
};
