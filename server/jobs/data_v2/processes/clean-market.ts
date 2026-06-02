import { isFlippingCompany } from 'server/utils/dataSyncHelpers';
import type { BuyersMarketRecord } from './get-market';

export interface CleanMarketResult {
    records: BuyersMarketRecord[];
    stats: { total: number; kept: number; removed: number };
}

/**
 * Filters buyer market records to only those where at least one party is a
 * corporate flipping entity. Records where both buyer and seller are
 * individuals (non-corporate) are removed.
 *
 * Keep if: buyer is corporate OR seller is corporate.
 * Remove if: both buyer and seller are non-corporate individuals.
 *
 * Uses the isCorporate field from the API as a fast first check for buyers,
 * then falls back to isFlippingCompany name matching for both parties.
 */
export function cleanMarket(
    records: BuyersMarketRecord[],
    scanWindow: string,
    msaName: string,
): CleanMarketResult {
    const label = `[SCAN:${scanWindow}][${msaName}]`;
    const total = records.length;
    const kept: BuyersMarketRecord[] = [];

    for (const record of records) {
        const buyerName = String(record.buyerName ?? '').trim();
        const sellerName = String(record.sellerName ?? '').trim();

        // isCorporate from the API is a reliable fast path for buyer
        const isBuyerCorporate = record.isCorporate === true || isFlippingCompany(buyerName, null);

        // Seller has no isCorporate flag — rely on name matching only
        const isSellerCorporate = isFlippingCompany(sellerName, null);

        if (isBuyerCorporate || isSellerCorporate) {
            kept.push(record);
        }
    }

    console.log(
        `${label} Clean market: ${kept.length} kept, ${total - kept.length} removed (${total} total)`,
    );

    return {
        records: kept,
        stats: { total, kept: kept.length, removed: total - kept.length },
    };
}
