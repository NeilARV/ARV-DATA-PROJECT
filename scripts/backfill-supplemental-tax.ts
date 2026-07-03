/**
 * One-time/re-runnable script: computes supplemental tax bills for EVERY existing
 * supplemental-tax-state property (CA today — driven by SUPPLEMENTAL_TAX_STATES)
 * from its stored transaction history (the pipeline's Step 12 only covers
 * properties that flow through a consumer run).
 *
 * Pages properties keyset-style (by properties.id) and runs the same shared
 * routine as the pipeline step, so there is exactly one implementation.
 * Idempotent — rows are upserted on (property_transaction_id, fiscal_year), so it
 * is safe to re-run and resumable if interrupted.
 *
 * Usage:
 *   npm run backfill:supplemental-tax
 *   npm run backfill:supplemental-tax -- --recompute   # also purge rows the
 *     recomputation no longer produces (stale fiscal years / disqualified
 *     transactions); plain re-runs already refresh amounts via the upsert
 */

import 'dotenv/config';
import { db } from 'server/storage';
import { and, asc, eq, gt, or, sql } from 'drizzle-orm';
import { properties, addresses } from '@database/schemas/properties.schema';
import { SUPPLEMENTAL_TAX_STATES } from 'server/utils/supplementalTax';
import { syncSupplementalTaxForProperties } from 'server/jobs/data_v2/processes/insert-supplemental-tax';

const PAGE_SIZE = 500;

// Case- AND whitespace-tolerant exact match, mirroring isSupplementalTaxState (the routine's
// per-property gate): addresses.state is stored verbatim from SFR, so 'ca'/' CA ' must page too —
// otherwise the two gates would disagree about which rows are billable. Derived from the same set
// the pipeline gates on, so enabling a new state covers the backfill automatically.
const supplementalStateFilter = or(
    ...Array.from(
        SUPPLEMENTAL_TAX_STATES,
        (state) => sql`upper(trim(${addresses.state})) = ${state}`,
    ),
);

async function main() {
    const recompute = process.argv.includes('--recompute');
    const label = '[backfill-supplemental-tax]';
    console.log(`${label} Starting${recompute ? ' in --recompute mode' : ''}...`);
    const start = Date.now();

    const totals = {
        propertiesScanned: 0,
        billRowsWritten: 0,
        refundRowsWritten: 0,
        skipped: 0,
        failedProperties: 0,
    };

    let cursor: string | null = null;
    for (;;) {
        const page: { id: string }[] = await db
            .select({ id: properties.id })
            .from(properties)
            .innerJoin(addresses, eq(addresses.propertyId, properties.id))
            .where(
                and(
                    supplementalStateFilter,
                    cursor === null ? undefined : gt(properties.id, cursor),
                ),
            )
            .orderBy(asc(properties.id))
            .limit(PAGE_SIZE);

        if (page.length === 0) break;
        cursor = page[page.length - 1].id;

        const result = await syncSupplementalTaxForProperties(
            page.map((row) => row.id),
            { recompute },
        );

        totals.propertiesScanned += page.length;
        totals.billRowsWritten += result.billRowsWritten;
        totals.refundRowsWritten += result.refundRowsWritten;
        totals.skipped += result.skippedTotal;
        totals.failedProperties += result.failedProperties;

        console.log(
            `${label} ${totals.propertiesScanned} properties scanned — ` +
                `${totals.billRowsWritten} bills, ${totals.refundRowsWritten} refunds written so far`,
        );
    }

    const elapsedSec = ((Date.now() - start) / 1000).toFixed(1);
    console.log(
        `${label} Done in ${elapsedSec}s — scanned ${totals.propertiesScanned} properties, ` +
            `wrote ${totals.billRowsWritten} bill(s) + ${totals.refundRowsWritten} refund(s), ` +
            `skipped ${totals.skipped} transaction(s) (no price / no prior value / zero-diff)` +
            (totals.failedProperties > 0
                ? `, ${totals.failedProperties} propert(ies) failed (see errors above)`
                : ''),
    );
}

main()
    .catch((err) => {
        console.error('[backfill-supplemental-tax] Fatal error:', err);
        process.exit(1);
    })
    .finally(() => process.exit(0));
