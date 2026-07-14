/**
 * One-time/re-runnable backfill (issue #113): expands every existing user_msa_subscriptions row into
 * one user_county_subscriptions row per county in that MSA, so no subscriber loses coverage when the
 * app moves to county grain. Runs the same shared routine the integration test exercises, so there is
 * exactly one implementation. Idempotent — rows conflict on the (user_id, county, state) PK and are
 * skipped, so re-running is a no-op. Requires the table to exist (run scripts/apply-0010.ts first).
 *
 * Usage:
 *   npm run backfill:county-subscriptions
 */

import 'dotenv/config';
import { backfillCountySubscriptions } from 'server/services/subscriptions/countySubscriptions.services';

async function main() {
    const label = '[backfill-county-subscriptions]';
    console.log(`${label} Starting...`);
    const start = Date.now();

    const { msaSubscriptionsScanned, countyRowsInserted } = await backfillCountySubscriptions();

    const elapsedSec = ((Date.now() - start) / 1000).toFixed(1);
    console.log(
        `${label} Done in ${elapsedSec}s — scanned ${msaSubscriptionsScanned} MSA subscription(s), ` +
            `inserted ${countyRowsInserted} county row(s) (already-present rows skipped).`,
    );
}

main()
    .catch((err) => {
        console.error('[backfill-county-subscriptions] Fatal error:', err);
        process.exit(1);
    })
    .finally(() => process.exit(0));
