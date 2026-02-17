import type { MergedProperty } from "./batch-lookup";

const RATE_LIMIT_DELAY_MS = 500;
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 3000;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithRetry(
    url: string,
    init: RequestInit,
    options: { maxAttempts?: number; retryDelayMs?: number; label?: string } = {}
): Promise<Response> {
    const {
        maxAttempts = RETRY_ATTEMPTS,
        retryDelayMs = RETRY_DELAY_MS,
        label = "API",
    } = options;
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const response = await fetch(url, init);
            if (response.ok) return response;
            lastError = new Error(`${label} returned ${response.status}`);
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
        }
        if (attempt < maxAttempts) {
            console.warn(`[${label}] Attempt ${attempt}/${maxAttempts} failed, retrying in ${retryDelayMs}ms...`);
            await delay(retryDelayMs);
        }
    }
    throw lastError ?? new Error(`${label} failed after ${maxAttempts} attempts`);
}

/** Transaction record from SFR properties/transactions API (one entry in history). */
export type TransactionRecord = Record<string, unknown>;

/** API may return { property_id?, address?, transactions: [] } or just the array. */
function parseTransactionsResponse(data: unknown): TransactionRecord[] {
    if (Array.isArray(data)) return data as TransactionRecord[];
    if (data && typeof data === "object" && "transactions" in data) {
        const t = (data as { transactions: unknown }).transactions;
        return Array.isArray(t) ? (t as TransactionRecord[]) : [];
    }
    return [];
}

function getAddressForProperty(item: MergedProperty): string {
    if (item.address && String(item.address).trim()) return item.address.trim();
    const p = item.property as Record<string, unknown>;
    const address = (p.address as string) || "";
    const city = (p.city as string) || "";
    const state = (p.state as string) || "";
    const zip = (p.zip as string) || (p.zipCode as string) || "";
    if (!address || !city || !state) return "";
    return zip ? `${address}, ${city}, ${state} ${zip}` : `${address}, ${city}, ${state}`;
}

export interface GetTransactionsParams {
    properties: MergedProperty[];
    API_KEY: string;
    API_URL: string;
    cityCode: string;
}

/**
 * Property with transactions array attached (same shape as input
 * plus transactions for insert later).
 */
export interface PropertyWithTransactions extends MergedProperty {
    transactions: TransactionRecord[];
}

/**
 * Fetches transaction history for each property via GET properties/transactions?address=...
 * (one request per property). Returns the same properties with a new key transactions: [].
 */
export async function getTransactions(
    params: GetTransactionsParams
): Promise<PropertyWithTransactions[]> {
    const { properties, API_KEY, API_URL, cityCode } = params;

    if (properties.length === 0) {
        console.log(`[${cityCode} SYNC] No properties to fetch transactions for`);
        return [];
    }

    console.log(`[${cityCode} SYNC] Fetching transactions for ${properties.length} properties`);

    const results: PropertyWithTransactions[] = [];

    for (let i = 0; i < properties.length; i++) {
        if (i > 0) await delay(RATE_LIMIT_DELAY_MS);

        const item = properties[i];
        const address = getAddressForProperty(item);

        if (!address) {
            results.push({ ...item, transactions: [] });
            continue;
        }

        try {
            const url = `${API_URL}/properties/transactions?address=${encodeURIComponent(address)}`;
            const response = await fetchWithRetry(
                url,
                {
                    method: "GET",
                    headers: {
                        "X-API-TOKEN": API_KEY,
                        "Accept": "application/json",
                        "User-Agent": "PostmanRuntime/7.41.0",
                    },
                },
                { label: `${cityCode} SYNC transactions ${i + 1}/${properties.length}` }
            );
            const data = (await response.json()) as unknown;
            const transactions = parseTransactionsResponse(data);
            results.push({ ...item, transactions });
        } catch (err) {
            console.warn(
                `[${cityCode} SYNC] Failed to fetch transactions for ${address}:`,
                err instanceof Error ? err.message : err
            );
            results.push({ ...item, transactions: [] });
        }
    }

    const withTransactions = results.filter((r) => r.transactions.length > 0);
    console.log(
        `[${cityCode} SYNC] Transactions complete: ${withTransactions.length}/${results.length} properties have transaction history`
    );

    return results;
}
