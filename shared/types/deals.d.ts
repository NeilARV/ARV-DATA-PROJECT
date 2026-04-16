type DealType = "wholesale" | "agent" | "sold"
type DealTab = "all" | "mine"

type TopBuyer = {
  companyId: string | null;
  companyName: string;
  contactName: string | null;
}

// API response shape returned by GET /api/deals
type Deal = DealProperty & {
    id: number;
    createdAt: string;
    msaId: number;
    msaName?: string | null;
    userEmail?: string | null;
    userId: string;
    topBuyers: TopBuyer[];
    links: { url: string; domain: string }[];

    // Fields that may be null in the database
    sfrPropertyId?: number | null;
    streetViewUrl?: string | null;

}

type DealProperty = {
    address?: string;
    city: string;
    state: string;
    zipCode: string;
    dealType: DealType;
    price: number | string;
    potentialARV?: number | string;
    beds?: number;
    baths?: number;
    sqft?: number;
    propertyType?: string;
    notes?: string;
}

type DealToEdit = DealProperty & {
    id: number;
    links?: string[];
}

// Input for POST /api/deals
type CreateDealInput = DealProperty & {
    userId: string;
    sendNotifications?: boolean;
    links?: string[];
}

// Input for PATCH /api/deals/:id (all fields optional except identity)
type UpdateDealInput = DealProperty & {
    links?: string[];
}