import { fetchWithRetry } from "server/utils/fetchWithRetry";
import { delay } from "server/utils/delay";

const PAGE_SIZE = 100;
const RATE_LIMIT_DELAY_MS = 1000;
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5000;

export type BuyersMarketRecord = Record<string, unknown>;

export interface GetMarketParams {
    msaName: string;
    scanWindow: string;
    API_KEY: string;
    API_URL: string;
    /** Inclusive start of sale date range (YYYY-MM-DD). */
    saleDateMin: string;
    /** Inclusive end of sale date range (YYYY-MM-DD). */
    saleDateMax: string;
}

export interface GetMarketResult {
    records: BuyersMarketRecord[];
    totalFetched: number;
}

/**
 * Fetches all buyer market records from /buyers/market for the given MSA and
 * sale date range. Paginates until all pages are exhausted. Returns the raw
 * record array — no filtering or transformation applied here.
 */
export async function getMarket(params: GetMarketParams): Promise<GetMarketResult> {
    const { msaName, scanWindow, API_KEY, API_URL, saleDateMin, saleDateMax } = params;
    const label = `[SCAN:${scanWindow}][${msaName}]`;

    console.log(`${label} Fetching buyers/market [${saleDateMin} → ${saleDateMax}]`);

    const allRecords: BuyersMarketRecord[] = [];
    let pageNum = 1;

    while (true) {
        if (pageNum > 1) {
            await delay(RATE_LIMIT_DELAY_MS);
        }

        const queryParams = new URLSearchParams({
            msa: msaName,
            sales_date_min: saleDateMin,
            sales_date_max: saleDateMax,
            page_size: String(PAGE_SIZE),
            sort: "sale_date",
            page: String(pageNum),
        });

        const response = await fetchWithRetry(
            `${API_URL}/buyers/market?${queryParams.toString()}`,
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
            { label: `${label} page ${pageNum}` }
        );

        const raw = (await response.json()) as unknown;
        const page = Array.isArray(raw)
            ? raw
            : (raw as Record<string, unknown>)?.data ?? (raw as Record<string, unknown>)?.results ?? null;

        if (!Array.isArray(page) || page.length === 0) {
            console.log(`${label} No more data on page ${pageNum}, stopping`);
            break;
        }

        console.log(`${label} Page ${pageNum}: ${page.length} records`);
        allRecords.push(...(page as BuyersMarketRecord[]));

        if (page.length < PAGE_SIZE) {
            break;
        }

        pageNum++;
    }

    console.log(`${label} Fetch complete: ${allRecords.length} total records`);

    return {
        records: allRecords,
        totalFetched: allRecords.length,
    };
}
