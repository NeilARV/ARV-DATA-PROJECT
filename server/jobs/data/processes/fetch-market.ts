import { db } from "server/storage";
import { sfrSyncState } from "@database/schemas/sync.schema";
import { eq } from "drizzle-orm";
import { normalizeDateToYMD } from "server/utils/normalization";
import { MOCK_BUYER_MARKET_DATA } from "server/constants/mocks";

const DEFAULT_START_DATE = "2025-12-03";
const PAGE_SIZE = 100;
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

export interface IFetchMarket {
    msa: string;
    cityCode: string;
    API_KEY: string;
    API_URL: string;
    today: string;
    excludedAddresses: string[];
}

export type BuyersMarketRecord = Record<string, unknown>;

export interface FetchMarketResult {
    records: BuyersMarketRecord[];
    dateRange: { from: string; to: string };
    lastSaleDate: string | null;
}

/**
 * Fetches all market transactions from /buyers/market for an MSA between
 * last_sale_date (from sfr_sync_state) and today. Paginates until response
 * length < 100, indicating no more properties.
 */
export async function fetchMarket(params: IFetchMarket): Promise<FetchMarketResult> {
    const { msa, cityCode, API_KEY, API_URL, today } = params;

    console.log(`[${cityCode} SYNC] Fetching market data for MSA: ${msa}`);

    // -------------------------------------------------------------------------
    // Step 1: Read last_sale_date from sfr_sync_state
    // -------------------------------------------------------------------------
    const syncStateRows = await db
        .select({ lastSaleDate: sfrSyncState.lastSaleDate })
        .from(sfrSyncState)
        .where(eq(sfrSyncState.msa, msa))
        .limit(1);

    const salesDateMin =
        syncStateRows.length > 0 && syncStateRows[0].lastSaleDate != null
        ? normalizeDateToYMD(syncStateRows[0].lastSaleDate) ?? DEFAULT_START_DATE
        : DEFAULT_START_DATE;

    console.log(`[${cityCode} SYNC] Fetching market from ${salesDateMin} to ${today}`);

    const allRecords: BuyersMarketRecord[] = [];
    let currentMinDate = salesDateMin;
    let pageNum = 1;
    let shouldContinue = true;
    let boundaryDate: string | null = null;

    // -------------------------------------------------------------------------
    // Step 2: Paginate /buyers/market until length < PAGE_SIZE
    // -------------------------------------------------------------------------
    while (shouldContinue) {
        if (pageNum > 1) {
            await delay(RATE_LIMIT_DELAY_MS);
        }

        const buyersMarketParams = new URLSearchParams({
            msa,
            sales_date_min: currentMinDate,
            sales_date_max: today,
            page_size: String(PAGE_SIZE),
            sort: "recording_date",
        });

        // Mock - comment out next line and uncomment block below for real API
        // const buyersMarketData = MOCK_BUYER_MARKET_DATA as BuyersMarketRecord[];
        const response = await fetchWithRetry(
            `${API_URL}/buyers/market?${buyersMarketParams.toString()}`,
            {
                method: "GET",
                headers: {
                    "X-API-TOKEN": API_KEY,
                    "Accept": "application/json",
                    "User-Agent": "PostmanRuntime/7.41.0",
                },
            },
            { label: `${cityCode} SYNC buyers/market page ${pageNum}` }
        );
        const buyersMarketData = (await response.json()) as BuyersMarketRecord[];

        if (!buyersMarketData || !Array.isArray(buyersMarketData)) {
            console.log(
                `[${cityCode} SYNC] Invalid or empty response on page ${pageNum}, stopping`
            );
            break;
        }

        if (buyersMarketData.length === 0) {
            console.log(`[${cityCode} SYNC] No more data on page ${pageNum}, stopping`);
            break;
        }

        console.log(
            `[${cityCode} SYNC] Fetched page ${pageNum} (from ${currentMinDate}) with ${buyersMarketData.length} records`
        );

        allRecords.push(...buyersMarketData);

        const lastRecord = buyersMarketData[buyersMarketData.length - 1];
        const pageLastSaleDate = lastRecord
            ? normalizeDateToYMD(lastRecord.saleDate as string)
            : null;

        if (pageLastSaleDate && (!boundaryDate || pageLastSaleDate > boundaryDate)) {
            boundaryDate = pageLastSaleDate;
        }

        if (buyersMarketData.length < PAGE_SIZE) {
            shouldContinue = false;
        } else if (pageLastSaleDate) {
            currentMinDate = pageLastSaleDate;
            pageNum++;
        } else {
            shouldContinue = false;
        }
    }

    console.log(
        `[${cityCode} SYNC] Fetched ${allRecords.length} total market records`
    );

    return {
        records: allRecords,
        dateRange: { from: salesDateMin, to: boundaryDate ?? today },
        lastSaleDate: boundaryDate,
    };
}
