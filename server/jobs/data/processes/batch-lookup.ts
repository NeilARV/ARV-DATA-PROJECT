import { normalizeAddressForLookup, normalizeDateToYMD } from "server/utils/normalization";
import { MOCK_BATCH_LOOKUP_DATA } from "server/constants/mocks";
import type { BuyersMarketRecord } from "./fetch-market";

const BATCH_SIZE = 100;
const RATE_LIMIT_DELAY_MS = 1000;
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5000;

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

function formatAddressForBatch(record: BuyersMarketRecord): string {
    const address = (record.address as string) || "";
    const city = (record.city as string) || "";
    const state = (record.state as string) || "";
    const zipCode = (record.zipCode as string) || "";
    if (!address || !city || !state) return "";
    return zipCode
        ? `${address}, ${city}, ${state} ${zipCode}`
        : `${address}, ${city}, ${state}`;
}

export interface BatchLookupParams {
    records: BuyersMarketRecord[];
    API_KEY: string;
    API_URL: string;
    cityCode: string;
}

/**
 * Merged property object: batch property data with buyers/market overlay
 * for saleValue, buyerName, sellerName, recordingDate, saleDate.
 */
export interface MergedProperty {
    address?: string;
    property: Record<string, unknown>;
    error?: unknown;
}

/**
 * Batch fetches properties via /properties/batch, then merges buyers/market
 * data (saleValue, buyerName, sellerName, recordingDate, saleDate) into the
 * batch response. Returns merged property objects for later DB insert.
 */
export async function batchLookup(
    params: BatchLookupParams
): Promise<MergedProperty[]> {
    const { records, API_KEY, API_URL, cityCode } = params;

    // Build address -> best record (latest recordingDate)
    const recordsByAddress = new Map<string, BuyersMarketRecord>();
    const normalizedToCanonical = new Map<string, string>();

    for (const record of records) {
        const addr = formatAddressForBatch(record);
        if (!addr) continue;

        const recordingDate = normalizeDateToYMD(record.recordingDate as string) || "";
        const existing = recordsByAddress.get(addr);

        if (!existing || recordingDate > (normalizeDateToYMD(existing.recordingDate as string) || "")) {
            recordsByAddress.set(addr, record);
        }

        const norm = normalizeAddressForLookup(addr);
        if (norm && !normalizedToCanonical.has(norm)) {
            normalizedToCanonical.set(norm, addr);
        }
    }

    const addresses = Array.from(recordsByAddress.keys());
    if (addresses.length === 0) {
        console.log(`[${cityCode} SYNC] No addresses to batch lookup`);
        return [];
    }

    const results: MergedProperty[] = [];

    for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
        if (i > 0) await delay(RATE_LIMIT_DELAY_MS);

        const batchAddresses = addresses.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(addresses.length / BATCH_SIZE);

        // Mock - comment out next line and uncomment block below for real API
        const batchData = MOCK_BATCH_LOOKUP_DATA as Array<{
            address?: string;
            property?: Record<string, unknown>;
            error?: unknown;
        }>;
        // const addressesParam = batchAddresses.join("|");
        // const response = await fetchWithRetry(
        //     `${API_URL}/properties/batch?addresses=${encodeURIComponent(addressesParam)}`,
        //     {
        //         method: "GET",
        //         headers: {
        //             "X-API-TOKEN": API_KEY,
        //             "Accept": "application/json",
        //             "User-Agent": "PostmanRuntime/7.41.0",
        //         },
        //     },
        //     { label: `${cityCode} SYNC properties/batch ${batchNum}/${totalBatches}` }
        // );
        // const batchData = (await response.json()) as Array<{
        //     address?: string;
        //     property?: Record<string, unknown>;
        //     error?: unknown;
        // }>;

        if (!batchData || !Array.isArray(batchData)) {
            console.warn(`[${cityCode} SYNC] Invalid batch response format, skipping batch ${batchNum}`);
            continue;
        }

        console.log(`[${cityCode} SYNC] Batch ${batchNum}/${totalBatches}: fetched ${batchData.length} properties`);

        for (const item of batchData) {
            if (item.error || !item.property) {
                results.push({
                address: item.address,
                property: item.property || {},
                error: item.error,
                });
                continue;
            }

            const batchAddress = item.address;
            if (!batchAddress) {
                results.push({ property: item.property, error: item.error });
                continue;
            }

            let marketRecord = recordsByAddress.get(batchAddress);
            if (!marketRecord) {
                const norm = normalizeAddressForLookup(batchAddress);
                const canonical = norm ? normalizedToCanonical.get(norm) : null;
                marketRecord = canonical ? recordsByAddress.get(canonical) : undefined;
            }

            const merged: MergedProperty = {
                address: batchAddress,
                property: { ...item.property },
                error: item.error,
            };

            if (marketRecord) {
                const saleDate = normalizeDateToYMD(marketRecord.saleDate as string);
                const recordingDate = normalizeDateToYMD(marketRecord.recordingDate as string);
                const saleValue = marketRecord.saleValue;
                const buyerName = (marketRecord.buyerName as string) || null;
                const sellerName = (marketRecord.sellerName as string) || null;

                const property = merged.property as Record<string, unknown>;
                const lastSale = (property.last_sale as Record<string, unknown>) || {};
                const currentSale = (property.current_sale as Record<string, unknown>) || {};

                property.last_sale = {
                    ...lastSale,
                    date: saleDate ?? lastSale.date,
                    price: saleValue ?? lastSale.price,
                    recording_date: recordingDate ?? lastSale.recording_date,
                };

                property.current_sale = {
                    ...currentSale,
                    buyer_1: buyerName ?? currentSale.buyer_1,
                    seller_1: sellerName ?? currentSale.seller_1,
                };
            }

            results.push(merged);
        }
    }

    console.log(
        `[${cityCode} SYNC] Batch lookup complete: ${results.length} properties`
    );

    return results;
}
