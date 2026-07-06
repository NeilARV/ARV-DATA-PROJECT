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

/** Accrued ownership-window supplemental tax for one transaction's buyer (admin/owner-only). */
export type TransactionSupplementalTax = {
    /** Signed display value: bill = negative (owed), refund = positive. */
    amount: number;
    /** Presumed-date months between acquisition and resale/asOf (month granularity). */
    monthsOwned: number;
    /** 'final' once resold or every billed window is fully elapsed; else still growing. */
    status: 'accruing' | 'final';
};

/** Full audit breakdown of one stored statutory bill row (admin/owner-only). */
export type SupplementalTaxBillRow = {
    /** Starting calendar year of the fiscal year (2026 = FY 2026-27). */
    fiscalYear: number;
    /** Mirrors the supplemental_bill_type pg enum (inline — shared can't import database). */
    billType: 'bill' | 'refund';
    /** Stored positive magnitude — the direction lives in billType. */
    amount: number;
    priorAssessedValue: number | null;
    priorValueSource: string;
    netSupplementalValue: number;
    taxRate: number;
    prorationFactor: number;
};

/** One row of the property-detail transaction history (GET /api/properties/:id, newest first). */
export type PropertyDetailTransaction = {
    id: number;
    transactionType: string | null;
    saleDate: string | null;
    recordingDate: string | null;
    salePrice: number | null;
    buyerId: string | null;
    buyerName: string | null;
    sellerId: string | null;
    sellerName: string | null;
    isAssignment: boolean;
    assignorName: string | null;
    /** THIS row's buyer's ownership-window accrual; null for non-admins or when $0/none. */
    supplementalTax: TransactionSupplementalTax | null;
    /** Stored statutory rows backing the accrual; [] for non-admins or when none exist. */
    supplementalTaxBills: SupplementalTaxBillRow[];
};
