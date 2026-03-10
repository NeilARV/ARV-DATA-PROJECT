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
        const buyerName = String(record.buyerName ?? record.buyer_name ?? "").trim() || "";
        const sellerName = String(record.sellerName ?? record.seller_name ?? "").trim() || "";
        const buyerOwnershipCode = (record.buyerOwnershipCode ?? record.buyer_ownership_code) as string | null | undefined;
        const buyerOwnershipStr = buyerOwnershipCode != null && typeof buyerOwnershipCode === "string" ? buyerOwnershipCode : null;

        const isBuyerCorporate = isFlippingCompany(buyerName, buyerOwnershipStr);
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
