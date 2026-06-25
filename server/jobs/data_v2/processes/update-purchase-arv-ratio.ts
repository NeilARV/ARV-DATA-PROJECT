import { isArmsLength } from 'server/utils/orderTransactions';
import { recomputeRatiosForCompanies } from 'server/services/companies/purchaseArvRatio.services';
import type { PropertyWithStatus } from './resolve-status';

/**
 * Pipeline step: recomputes purchase-to-ARV ratio for every company that appears as the
 * seller on an Arms Length transaction in this batch's properties.
 *
 * Must run after insertProperties so transaction rows carry resolved seller_id UUIDs.
 * The recompute reads each affected company's FULL sale history from the database (not
 * just this batch), so it is idempotent. Only Arms Length sellers are collected — they
 * are the companies whose ratio this batch could change; sellers without a resolved
 * company id contribute nothing.
 *
 * @param properties the batch's properties, each with its resolved transactions
 * @param cityCode MSA label, for logging
 */
export async function updatePurchaseToArvRatios(
    properties: PropertyWithStatus[],
    cityCode: string,
): Promise<void> {
    const sellerIds = new Set<string>();
    for (const item of properties) {
        for (const tx of item.transactions ?? []) {
            if (!isArmsLength(tx)) continue;
            if (tx.seller_id) sellerIds.add(tx.seller_id);
        }
    }

    if (sellerIds.size === 0) return;

    await recomputeRatiosForCompanies(Array.from(sellerIds));

    console.log(
        `[${cityCode}] Recomputed purchase-to-ARV ratio for ${sellerIds.size} compan${
            sellerIds.size === 1 ? 'y' : 'ies'
        }`,
    );
}
