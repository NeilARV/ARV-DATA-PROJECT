import { normalizeDateToYMD } from "server/utils/normalization";

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
    /** Inclusive start of date range (YYYY-MM-DD). */
    saleDateMin: string;
    /** Exclusive end of date range (YYYY-MM-DD); e.g. last_sale_date + 1 for one day. */
    saleDateMax: string;
    excludedAddresses?: string[];
}

export type BuyersMarketRecord = Record<string, unknown>;

export interface FetchMarketResult {
    records: BuyersMarketRecord[];
    dateRange: { from: string; to: string };
    lastSaleDate: string | null;
}

/**
 * Fetches market transactions from /buyers/market for an MSA within the given
 * date range [saleDateMin, saleDateMax). Paginates by passing page=1, 2, 3, ...
 * until the API returns fewer than page_size records. Caller is responsible
 * for reading/updating last_sale_date in sfr_sync_state (e.g. via fetch-date
 * and update-date).
 */
export async function fetchMarket(params: IFetchMarket): Promise<FetchMarketResult> {
    const { msa, cityCode, API_KEY, API_URL, saleDateMin, saleDateMax } = params;

    console.log(`[${cityCode} SYNC] Fetching market data for MSA: ${msa} [${saleDateMin}, ${saleDateMax}]`);

    const allRecords: BuyersMarketRecord[] = [];
    let pageNum = 1;
    let boundaryDate: string | null = null;

    while (true) {
        if (pageNum > 1) {
            await delay(RATE_LIMIT_DELAY_MS);
        }

        const buyersMarketParams = new URLSearchParams({
            msa,
            sales_date_min: saleDateMin,
            sales_date_max: saleDateMax,
            page_size: String(PAGE_SIZE),
            sort: "sale_date",
            page: String(pageNum),
        });

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
            `[${cityCode} SYNC] Fetched page ${pageNum} with ${buyersMarketData.length} records`
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
            break;
        }
        pageNum++;
    }

    console.log(`[${cityCode} SYNC] Fetch market complete for ${msa}: ${allRecords.length} records`);

    return {
        records: allRecords,
        dateRange: { from: saleDateMin, to: boundaryDate ?? saleDateMax },
        lastSaleDate: boundaryDate,
    };
}
