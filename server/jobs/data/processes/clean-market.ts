import { isFlippingCompany } from "server/utils/dataSyncHelpers";
import type {
  BuyersMarketRecord,
  FetchMarketResult,
} from "./fetch-market";

export interface CleanMarketResult {
  records: BuyersMarketRecord[];
  dateRange: { from: string; to: string };
  lastSaleDate: string | null;
  stats: { total: number; kept: number; removed: number };
}

/**
 * Filters market records to keep only transactions with at least one corporate
 * entity as buyer or seller. Corporate = name contains LLC, Corp, Ltd, etc.
 * and is NOT a trust. Trusts are excluded even if they contain corporate endings.
 *
 * Keep: buyer corporate, seller not | buyer not, seller corporate | both corporate
 * Remove: both buyer and seller are NOT corporate
 */
export function cleanMarket(fetchResult: FetchMarketResult, cityCode: string): CleanMarketResult {
    const { records, dateRange, lastSaleDate } = fetchResult;
    const total = records.length;
    const kept: BuyersMarketRecord[] = [];

    for (const record of records) {
        const buyerName = (record.buyerName as string) || "";
        const sellerName = (record.sellerName as string) || "";
        const buyerOwnershipCode = (record.buyerOwnershipCode as string) || null;

        const isBuyerCorporate = isFlippingCompany(buyerName, buyerOwnershipCode);
        const isSellerCorporate = isFlippingCompany(sellerName, null);

        if (isBuyerCorporate || isSellerCorporate) {
            kept.push(record);
        }
    }

    console.log(`[${cityCode} SYNC] Cleaned market: ${kept.length} kept, ${total - kept.length} removed (${total} total)`);

    return {
        records: kept,
        dateRange,
        lastSaleDate,
        stats: {
            total,
            kept: kept.length,
            removed: total - kept.length,
        },
    };
}
