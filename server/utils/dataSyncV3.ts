/**
 * Data Sync V3
 *
 * Rebuild of SFR property data sync with a slower, more deliberate design.
 * Takes the same parameters as dataSync (V2) for compatibility: msa, api key,
 * api url, today's date, excluded addresses, and city code.
 */

import { db } from "server/storage";
import { companies } from "../../database/schemas/companies.schema";
import { sfrSyncState } from "../../database/schemas/sync.schema";
import { eq } from "drizzle-orm";
import { normalizeDateToYMD, normalizeCompanyNameForComparison } from "server/utils/normalization";
import { isTrust, isFlippingCompany } from "server/utils/dataSyncHelpers";

const DEFAULT_START_DATE = "2025-12-03";
const BUYERS_MARKET_PAGE_SIZE = 100;
const BATCH_FETCH_SIZE = 100;
const SFR_RATE_LIMIT_DELAY_MS = 1000;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface SyncMSAV3Params {
    msa: string;
    cityCode: string;
    API_KEY: string;
    API_URL: string;
    today: string;
    excludedAddresses?: string[];
}

/**
 * Row from sfr_sync_state (id, msa, last_sale_date, last_recording_date,
 * total_records_synced, last_sync_at, created_at) plus derived date range.
 * Rows are added manually per MSA; we only read and later update via persistSyncState.
 */
export interface SyncStateByMSA {
    id: number;
    msa: string;
    /** Raw last_sale_date from DB (null if never synced). */
    lastSaleDate: Date | string | null;
    /** Raw last_recording_date from DB. */
    lastRecordingDate: Date | string | null;
    totalRecordsSynced: number;
    lastSyncAt: Date | null;
    createdAt: Date | null;
    /** Start of date range for this run (normalized last_sale_date or DEFAULT_START_DATE). */
    minSaleDate: string;
}

/** One company row from DB; used for existence checks. */
export type CompanyRow = typeof companies.$inferSelect;

/** Map of normalized company name (for comparison) -> company row. Used to see if companies exist yet. */
export type CompaniesMap = Map<string, CompanyRow>;

/** One item from GET /properties/batch response: address queried, property payload or null, optional error. */
export interface PropertiesBatchItem {
  address: string;
  property: Record<string, unknown> | null;
  error: { code?: string; message?: string; retryable?: boolean } | null;
}

/**
 * Property object ready for storage. Prioritized fields from /buyers/market;
 * rest from /properties/batch (address, assessments, parcel, structure, etc.).
 */
export interface PropertyForStorage {
  /** From buyers/market (priority). */
  property_id: number;
  address: string;
  city: string;
  zipcode: string;
  msa: string;
  sellerName: string | null;
  buyerName: string | null;
  state: string;
  saleValue: number | null;
  recordingDate: string | null;
  saleDate: string | null;
  /** Rest from /properties/batch (batch property payload, possibly with overlays). */
  batch: Record<string, unknown>;
}

export interface SyncMSAV3Result {
    success: boolean;
    msa: string;
    message?: string;
    /** Sync state from sfr_sync_state so we know which dates we're working with. */
    syncState?: SyncStateByMSA;
    /** All companies keyed by normalized name for existence checks (optional in result for now). */
    companiesMap?: CompaniesMap;
    /** Number of records returned from /buyers/market across all pages (after corporate filter). */
    buyersMarketRecordCount?: number;
    /** Property objects built from buyers/market + batch, ready for storage. */
    propertiesForStorage?: PropertyForStorage[];
}

/**
 * Pull last_sale_date and other sfr_sync_state fields for the given MSA.
 * We do not insert: there is one row per MSA, added manually when adding new MSAs.
 * Saves are done via persistSyncState in dataSyncHelpers (update by id: lastSaleDate,
 * totalRecordsSynced, lastSyncAt). Throws if no row exists for the MSA.
 */
export async function getSyncStateByMSA(msa: string): Promise<SyncStateByMSA> {
    const rows = await db
        .select()
        .from(sfrSyncState)
        .where(eq(sfrSyncState.msa, msa))
        .limit(1);

    if (rows.length === 0) {
        throw new Error(`No sfr_sync_state row for MSA: ${msa}. Add a row manually when adding a new MSA.`);
    }

    const row = rows[0];
    const minSaleDate = normalizeDateToYMD(row.lastSaleDate) ?? DEFAULT_START_DATE;
    return {
            id: row.id,
            msa: row.msa,
            lastSaleDate: row.lastSaleDate,
            lastRecordingDate: row.lastRecordingDate,
            totalRecordsSynced: row.totalRecordsSynced ?? 0,
            lastSyncAt: row.lastSyncAt,
            createdAt: row.createdAt,
            minSaleDate,
    };
}

/**
 * Load all companies into a map keyed by normalized name so we can compare
 * and see if a company already exists in the database. Same approach as V2.
 */
export async function loadCompaniesForComparison(): Promise<CompaniesMap> {
    const allCompanies = await db.select().from(companies);
    const map = new Map<string, CompanyRow>();
    for (const company of allCompanies) {
        const normalizedKey = normalizeCompanyNameForComparison(company.companyName);
        if (normalizedKey) {
            map.set(normalizedKey, company);
        }
    }
    return map;
}

/** One raw record from SFR /buyers/market (shape from API). */
export type BuyersMarketRecord = Record<string, unknown>;

/**
 * Corporate = not a trust and matches flipping-company patterns (LLC, INC, etc.).
 * Non-corporate = trust or individual (isFlippingCompany false or isTrust true).
 * Used to filter market transactions: we only keep records where at least one of buyer/seller is corporate.
 */
function isCorporateEntity(name: string | null | undefined, ownershipCode: string | null | undefined): boolean {
    if (!name) return false;
    return !isTrust(name, ownershipCode) && isFlippingCompany(name, ownershipCode);
}

/**
 * Fetch /buyers/market with the given date range and MSA. Returns the array of records.
 * Params: sales_date_min, sales_date_max (today), sort=recording_date, page_size=100, msa.
 */
async function fetchBuyersMarketPage(options: {
    API_URL: string;
    API_KEY: string;
    msa: string;
    salesDateMin: string;
    salesDateMax: string;
}): Promise<BuyersMarketRecord[]> {
    const { API_URL, API_KEY, msa, salesDateMin, salesDateMax } = options;
    const params = new URLSearchParams({
        msa,
        sales_date_min: salesDateMin,
        sales_date_max: salesDateMax,
        sort: "recording_date",
        page_size: String(BUYERS_MARKET_PAGE_SIZE),
    });
    const url = `${API_URL}/buyers/market?${params.toString()}`;
    const response = await fetch(url, {
        method: "GET",
        headers: { "X-API-TOKEN": API_KEY },
    });
    if (!response.ok) {
        throw new Error(`/buyers/market returned ${response.status}`);
    }
    const data = await response.json();
    if (!Array.isArray(data)) {
        return [];
    }
    return data as BuyersMarketRecord[];
}

/**
 * Loop: call /buyers/market until we get a page with length < page_size (100).
 * Uses sales_date_min from sync state, sales_date_max = today. After each full page,
 * advances sales_date_min to the last record's sale_date so the next call gets the next page.
 */
export async function fetchAllBuyersMarketPages(options: {
    API_URL: string;
    API_KEY: string;
    msa: string;
    salesDateMin: string;
    salesDateMax: string;
    cityCode: string;
}): Promise<BuyersMarketRecord[]> {
    const { API_URL, API_KEY, msa, salesDateMin, salesDateMax, cityCode } = options;
    const allRecords: BuyersMarketRecord[] = [];
    let currentMin = salesDateMin;
    let pageNum = 1;

    while (true) {
        if (pageNum > 1) {
            await delay(SFR_RATE_LIMIT_DELAY_MS);
        }

        const page = await fetchBuyersMarketPage({
            API_URL,
            API_KEY,
            msa,
            salesDateMin: currentMin,
            salesDateMax,
        });

        if (page.length > 0) {
            const buyerName = (r: BuyersMarketRecord) => (r.buyerName as string) ?? "";
            const sellerName = (r: BuyersMarketRecord) => (r.sellerName as string) ?? "";
            const buyerOwnershipCode = (r: BuyersMarketRecord) => (r.buyerOwnershipCode as string) ?? null;
            const sellerOwnershipCode = (r: BuyersMarketRecord) => (r.sellerOwnershipCode as string) ?? null;
            const included = page.filter((r) => {
                const buyerCorp = isCorporateEntity(buyerName(r), buyerOwnershipCode(r));
                const sellerCorp = isCorporateEntity(sellerName(r), sellerOwnershipCode(r));
                return buyerCorp || sellerCorp;
            });

            console.log(`Included: `, included)
            allRecords.push(...included);
            console.log(`[${cityCode} SYNC V3] buyers/market page ${pageNum}: ${page.length} raw, ${included.length} corporate (total so far: ${allRecords.length})`);
        }

        if (page.length < BUYERS_MARKET_PAGE_SIZE) {
            console.log(`[${cityCode} SYNC V3] buyers/market done: ${page.length} on last page, no more pages`);
            break;
        }

        const lastRecord = page[page.length - 1];
        const nextMin = normalizeDateToYMD(lastRecord.saleDate as string);
        
        if (!nextMin) {
            console.warn(`[${cityCode} SYNC V3] Last record had no saleDate, stopping pagination`);
            break;
        }
        
        currentMin = nextMin;
        pageNum++;
    }

    return allRecords;
}

/**
 * Build address string for /properties/batch from buyers/market record.
 * Format: "address, city, state zipcode" (e.g. "42795 Deauville Park Ct, Fremont, CA 94538")
 */
function buildBatchAddressString(record: BuyersMarketRecord): string {
    const address = (record.address as string) ?? "";
    const city = (record.city as string) ?? "";
    const state = (record.state as string) ?? "";
    const zipcode = (record.zipCode as string) ?? (record.zip_code as string) ?? "";
    const parts = [address.trim(), city.trim()].filter(Boolean);
    const stateZip = [state.trim(), String(zipcode).trim()].filter(Boolean).join(" ");
    if (stateZip) parts.push(stateZip);
    return parts.join(", ");
}

/**
 * GET /properties/batch with a single addresses param (pipe-separated).
 * Returns array of { address, property, error }.
 */
async function fetchPropertiesBatch(options: {
    API_URL: string;
    API_KEY: string;
    addressesParam: string;
}): Promise<PropertiesBatchItem[]> {
    const { API_URL, API_KEY, addressesParam } = options;
    const url = `${API_URL}/properties/batch?addresses=${encodeURIComponent(addressesParam)}`;
    const response = await fetch(url, {
        method: "GET",
        headers: { "X-API-TOKEN": API_KEY },
    });
    if (!response.ok) {
        throw new Error(`/properties/batch returned ${response.status}`);
    }
    const data = await response.json();
    if (!Array.isArray(data)) return [];
    return data as PropertiesBatchItem[];
}

/**
 * Fetch all property batch pages: unique addresses from market records,
 * in chunks of BATCH_FETCH_SIZE, with rate limit between calls.
 */
export async function fetchAllPropertiesBatches(options: {
    API_URL: string;
    API_KEY: string;
    buyersMarketRecords: BuyersMarketRecord[];
    cityCode: string;
}): Promise<PropertiesBatchItem[]> {
    const { API_URL, API_KEY, buyersMarketRecords, cityCode } = options;
    const addressToFirstRecord = new Map<string, BuyersMarketRecord>();
    for (const record of buyersMarketRecords) {
        const addr = buildBatchAddressString(record);
        if (!addr) continue;
        if (!addressToFirstRecord.has(addr)) {
            addressToFirstRecord.set(addr, record);
        }
    }
    const uniqueAddresses = Array.from(addressToFirstRecord.keys());
    if (uniqueAddresses.length === 0) {
        console.log(`[${cityCode} SYNC V3] No valid addresses for batch`);
        return [];
    }

    const allBatchItems: PropertiesBatchItem[] = [];
    const totalBatches = Math.ceil(uniqueAddresses.length / BATCH_FETCH_SIZE);

    for (let i = 0; i < uniqueAddresses.length; i += BATCH_FETCH_SIZE) {
        if (i > 0) await delay(SFR_RATE_LIMIT_DELAY_MS);

        const batchAddresses = uniqueAddresses.slice(i, i + BATCH_FETCH_SIZE);
        const addressesParam = batchAddresses.join(" | ");
        const batchNum = Math.floor(i / BATCH_FETCH_SIZE) + 1;

        console.log(`[${cityCode} SYNC V3] properties/batch ${batchNum}/${totalBatches} (${batchAddresses.length} addresses)`);

        const page = await fetchPropertiesBatch({ API_URL, API_KEY, addressesParam });
        allBatchItems.push(...page);
    }

    console.log(`[${cityCode} SYNC V3] properties/batch done: ${allBatchItems.length} items`);
    return allBatchItems;
}

/**
 * Build property objects for storage: merge buyers/market (priority) with batch.
 * Uses property_id, address, city, zipcode, msa, sellerName, buyerName, state,
 * saleValue, recordingDate, saleDate from buyers/market; rest from batch.
 */
export function buildPropertiesForStorage(
    buyersMarketRecords: BuyersMarketRecord[],
    batchItems: PropertiesBatchItem[]
): PropertyForStorage[] {
    const addressToFirstRecord = new Map<string, BuyersMarketRecord>();
    for (const record of buyersMarketRecords) {
        const addr = buildBatchAddressString(record);
        if (!addr) continue;
        if (!addressToFirstRecord.has(addr)) {
        addressToFirstRecord.set(addr, record);
        }
    }

    const normalizedToCanonical = new Map<string, string>();
    for (const addr of Array.from(addressToFirstRecord.keys())) {
        const normalized = addr.trim().toLowerCase().replace(/\s+/g, " ");
        if (normalized && !normalizedToCanonical.has(normalized)) {
        normalizedToCanonical.set(normalized, addr);
        }
    }

    const result: PropertyForStorage[] = [];
    for (const item of batchItems) {
        if (item.error || !item.property) continue;
        const batchAddress = item.address?.trim();
        if (!batchAddress) continue;

        let marketRecord: BuyersMarketRecord | undefined = addressToFirstRecord.get(batchAddress);
        if (!marketRecord) {
            const norm = batchAddress.toLowerCase().replace(/\s+/g, " ");
            const canonical = normalizedToCanonical.get(norm);
            marketRecord = canonical ? addressToFirstRecord.get(canonical) : undefined;
        }
        if (!marketRecord) continue;

        const batchProp = item.property as Record<string, unknown>;
        const propertyId = (marketRecord.property_id ?? batchProp.property_id) as number;
        if (propertyId == null) continue;

        const address = (marketRecord.address as string) ?? (batchProp.address as Record<string, unknown>)?.formatted_street_address as string ?? "";
        const city = (marketRecord.city as string) ?? (batchProp.address as Record<string, unknown>)?.city as string ?? "";
        const state = (marketRecord.state as string) ?? (batchProp.address as Record<string, unknown>)?.state as string ?? "";
        const zipcode = (marketRecord.zipCode as string) ?? (marketRecord.zip_code as string) ?? (batchProp.address as Record<string, unknown>)?.zip_code as string ?? "";

        result.push({
            property_id: Number(propertyId),
            address: String(address ?? ""),
            city: String(city ?? ""),
            zipcode: String(zipcode ?? ""),
            msa: String((marketRecord.msa as string) ?? (batchProp.msa as string) ?? ""),
            sellerName: marketRecord.sellerName != null ? String(marketRecord.sellerName) : null,
            buyerName: marketRecord.buyerName != null ? String(marketRecord.buyerName) : null,
            state: String(state ?? ""),
            saleValue: marketRecord.saleValue != null ? Number(marketRecord.saleValue) : null,
            recordingDate: marketRecord.recordingDate != null ? normalizeDateToYMD(String(marketRecord.recordingDate)) : null,
            saleDate: marketRecord.saleDate != null ? normalizeDateToYMD(String(marketRecord.saleDate)) : null,
            batch: batchProp,
        });
    }
    return result;
}

/**
 * Sync SFR data for a single MSA (V3).
 * Same parameters as syncMSAV2 for drop-in compatibility.
 */
export async function dataSyncV3(params: SyncMSAV3Params): Promise<SyncMSAV3Result> {
    const { msa, cityCode, API_KEY, API_URL, today, excludedAddresses = [] } = params;

    // -------------------------------------------------------------------------
    // Pull sfr_sync_state by MSA so we know which dates we're working with
    // -------------------------------------------------------------------------
    const syncState = await getSyncStateByMSA(msa);

    console.log(`[${cityCode} SYNC V3] sfr_sync_state: id=${syncState.id} last_sale_date=${syncState.lastSaleDate ?? "null"} last_recording_date=${syncState.lastRecordingDate ?? "null"} total_records_synced=${syncState.totalRecordsSynced} → date range ${syncState.minSaleDate} to ${today}`);

    // -------------------------------------------------------------------------
    // Load all companies so we have something to compare to (exist or not)
    // -------------------------------------------------------------------------
    const companiesMap = await loadCompaniesForComparison();
    console.log(`[${cityCode} SYNC V3] Loaded ${companiesMap.size} companies into cache for comparison`);

    // -------------------------------------------------------------------------
    // Paginate /buyers/market until we get a page with < 100 records
    // -------------------------------------------------------------------------
    const buyersMarketRecords = await fetchAllBuyersMarketPages({
      API_URL,
      API_KEY,
      msa,
      salesDateMin: syncState.minSaleDate,
      salesDateMax: today,
      cityCode,
    });
    console.log(`[${cityCode} SYNC V3] buyers/market total records: ${buyersMarketRecords.length}`);

    // -------------------------------------------------------------------------
    // GET /properties/batch for each unique address (address, city, state zip)
    // -------------------------------------------------------------------------
    let propertiesForStorage: PropertyForStorage[] = [];
    if (buyersMarketRecords.length > 0) {
      const batchItems = await fetchAllPropertiesBatches({
        API_URL,
        API_KEY,
        buyersMarketRecords,
        cityCode,
      });
      propertiesForStorage = buildPropertiesForStorage(buyersMarketRecords, batchItems);
      console.log(`[${cityCode} SYNC V3] properties for storage length: ${propertiesForStorage.length}`);
    }

    return {
        success: true,
        msa,
        message: `Sync state and companies loaded; date range ${syncState.minSaleDate} → ${today}`,
        syncState,
        companiesMap,
        buyersMarketRecordCount: buyersMarketRecords.length,
        propertiesForStorage,
    };
}
