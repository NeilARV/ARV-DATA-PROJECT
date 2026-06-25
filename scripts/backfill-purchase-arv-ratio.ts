/**
 * One-time script: recomputes purchase-to-ARV ratio for EVERY company from the full
 * property_transactions history and writes it to companies.purchase_to_arv_ratio.
 *
 * A company's ratio is the average, across every Arms Length sale where it was the
 * seller, of (its purchase price for that property ÷ its sale price). Run this after
 * adding the purchase_to_arv_ratio column so companies don't have to wait for the next
 * sync to get a value. Safe to re-run — it clears and recomputes every company.
 *
 * Usage:
 *   npm run backfill:purchase-arv-ratio
 */

import 'dotenv/config';
import { recomputeAllPurchaseToArvRatios } from 'server/services/companies/purchaseArvRatio.services';

async function main() {
    console.log('[backfill-purchase-arv-ratio] Recomputing purchase-to-ARV ratio for all companies...');
    const start = Date.now();

    const { companiesUpdated, propertiesScanned } = await recomputeAllPurchaseToArvRatios();

    const elapsedSec = ((Date.now() - start) / 1000).toFixed(1);
    console.log(
        `[backfill-purchase-arv-ratio] Done in ${elapsedSec}s — ` +
            `scanned ${propertiesScanned} properties, ` +
            `set a ratio on ${companiesUpdated} compan${companiesUpdated === 1 ? 'y' : 'ies'}.`,
    );
}

main()
    .catch((err) => {
        console.error('[backfill-purchase-arv-ratio] Fatal error:', err);
        process.exit(1);
    })
    .finally(() => process.exit(0));
