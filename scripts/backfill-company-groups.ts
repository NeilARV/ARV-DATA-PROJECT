/**
 * One-off, idempotent backfill (Company Groups Phase 1): seeds a singleton company_groups row per
 * membered company from today's company_members, links companies.group_id, and copies each
 * membership into group_members. Member-less companies are untouched. Run once against prod after
 * the schema lands; safe to re-run — see backfillCompanyGroups for the resumability guarantees.
 *
 * Usage:
 *   npm run backfill:company-groups
 */

import 'dotenv/config';
import { backfillCompanyGroups } from 'server/jobs/backfill-company-groups';

async function main() {
    const label = '[backfill-company-groups]';
    console.log(`${label} Starting...`);
    const start = Date.now();

    const { companiesScanned, groupsCreated, membersCopied } = await backfillCompanyGroups();

    const elapsedSec = ((Date.now() - start) / 1000).toFixed(1);
    console.log(
        `${label} Done in ${elapsedSec}s — scanned ${companiesScanned} ungrouped membered ` +
            `compan${companiesScanned === 1 ? 'y' : 'ies'}, created ${groupsCreated} group(s), ` +
            `copied ${membersCopied} membership(s).`,
    );
}

main()
    .catch((err) => {
        console.error('[backfill-company-groups] Fatal error:', err);
        process.exit(1);
    })
    .finally(() => process.exit(0));
