export type ZipCount = {
    zipCode: string;
    count: number;
};

// Property autocomplete suggestion (GET /api/properties/suggestions). Wire shape — fields are
// nullable because the underlying address columns are.
export type PropertySuggestion = {
    id: string;
    address: string | null;
    city: string | null;
    state: string | null;
    zipcode: string | null;
};

// Canonical property status. Shared by the data pipeline, status filters, and notification prefs.
export type PropertyStatus = 'in-renovation' | 'wholesale' | 'on-market' | 'sold';
