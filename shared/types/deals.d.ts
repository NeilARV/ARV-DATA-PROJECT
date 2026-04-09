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

    // Fields that may be null in the database
    sfrPropertyId?: number | null;
    streetViewUrl?: string | null;

    // Fields that need to be updated
    // baths?: string | null;
    // price?: string | null;
    // potentialARV?: string | null;

    // notes?: string | null;

    // address?: string;
    // city: string;
    // state: string;
    // zipCode: string;
    // dealType: DealType;
    // price: number | string;
    // potentialARV?: number | string;
    // beds?: number;
    // baths?: number;
    // sqft?: number;
    // propertyType?: string;
    // notes?: string;
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
}

// Input for POST /api/deals
type CreateDealInput = DealProperty & {
    userId: string;
    sendNotifications?: boolean;
}

// Input for PATCH /api/deals/:id (all fields optional except identity)
type UpdateDealInput = DealProperty