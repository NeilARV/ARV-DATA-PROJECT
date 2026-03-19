import { normalizeAddressForLookup, normalizeDateToYMD } from "server/utils/normalization";
import type { BuyersMarketRecord } from "./get-market";
import { fetchWithRetry } from "server/utils/fetchWithRetry";
import { delay } from "server/utils/delay";

const BATCH_SIZE = 100;
const RATE_LIMIT_DELAY_MS = 1000;
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5000;

/** Get first non-empty string from record using any of the given keys (camelCase or snake_case). */
function getString(record: BuyersMarketRecord, ...keys: string[]): string {
    for (const k of keys) {
        const v = record[k];
        if (v != null && typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
}

/** Get address parts from nested object (e.g. record.address or record.property). */
function getAddressPartsFromObj(obj: unknown): { address: string; city: string; state: string; zipCode: string } {
    if (!obj || typeof obj !== "object") return { address: "", city: "", state: "", zipCode: "" };
    const r = obj as Record<string, unknown>;
    const address = getString(r, "address", "street_address", "formatted_street_address", "streetAddress", "formattedStreetAddress");
    const city = getString(r, "city");
    const state = getString(r, "state");
    const zipCode = getString(r, "zipCode", "zip_code");
    return { address, city, state, zipCode };
}

/**
 * Build full address string from a buyers/market record.
 * Handles camelCase, snake_case, and nested address/property objects so we tolerate API response shape changes.
 */
function formatAddressForBatch(record: BuyersMarketRecord): string {
    // Flat keys (camelCase then snake_case)
    let address = getString(record, "address", "street_address", "formatted_street_address");
    let city = getString(record, "city");
    let state = getString(record, "state");
    let zipCode = getString(record, "zipCode", "zip_code");

    // If missing, try nested record.address or record.property
    if (!address || !city || !state) {
        const fromAddr = getAddressPartsFromObj(record.address);
        const fromProp = getAddressPartsFromObj(record.property);
        if (!address) address = fromAddr.address || fromProp.address;
        if (!city) city = fromAddr.city || fromProp.city;
        if (!state) state = fromAddr.state || fromProp.state;
        if (!zipCode) zipCode = fromAddr.zipCode || fromProp.zipCode;
    }

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
        if (records.length > 0) {
            const sample = records[0] as Record<string, unknown>;
            const keys = Object.keys(sample).sort().join(", ");
            const withCamelAddress = records.filter(
                (r) =>
                    r.address && typeof r.address === "string" && (r.address as string).trim() &&
                    r.city && typeof r.city === "string" && (r.city as string).trim() &&
                    r.state && typeof r.state === "string" && (r.state as string).trim()
            ).length;
            console.log(
                `[${cityCode} SYNC] Records with address/city/state (camelCase): ${withCamelAddress}/${records.length}. Sample keys: ${keys}`
            );
        }
        return [];
    }

    const results: MergedProperty[] = [];

    for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
        if (i > 0) await delay(RATE_LIMIT_DELAY_MS);

        const batchAddresses = addresses.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(addresses.length / BATCH_SIZE);

        const addressesParam = batchAddresses.join("|");
        const response = await fetchWithRetry(
            `${API_URL}/properties/batch?addresses=${encodeURIComponent(addressesParam)}`,
            {
                method: "GET",
                headers: {
                    "X-API-TOKEN": API_KEY,
                    "Accept": "application/json",
                    "User-Agent": "PostmanRuntime/7.41.0",
                },
            },
            RETRY_ATTEMPTS,
            RETRY_DELAY_MS,
            { label: `${cityCode} SYNC properties/batch ${batchNum}/${totalBatches}` }
        );
        const batchData = (await response.json()) as Array<{
            address?: string;
            property?: Record<string, unknown>;
            error?: unknown;
        }>;

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
                    seller_1: sellerName,
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