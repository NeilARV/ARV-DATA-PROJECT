import { db } from 'server/storage';
import { and, eq, ne, sql } from 'drizzle-orm';
import { cvMatches, cvViolations } from '@database/schemas/code-violations.schema';
import type { CvViolation } from '@database/types/code-violations';

interface DiffAndStoreParams {
    violation: CvViolation;
    propertyId: string;
    ownerCompanyId: string | null;
    ownerName: string | null;
    /** The complaint's canonical street key — the address half of the secondary dedup. */
    normalizedAddress: string;
}

/** Result of the DIFF stage: whether notifying this complaint would be a double-alert. */
export interface DiffResult {
    /** True when this is the same physical complaint as one already alerted under another record number. */
    isDuplicate: boolean;
}

/**
 * DIFF stage (§4.5): write the violation↔property match and decide whether notifying would
 * double-alert.
 *
 * Always records the `cv_matches` row (idempotent on the violation's UNIQUE) so the ledger captures
 * every resolved complaint, notifiable or not. Then runs the **##TMP→CE secondary dedup**: Accela
 * sometimes issues a temporary `##TMP-*` record number that a permanent `CE-*` later replaces — the
 * same physical complaint under two record numbers, which dodges the `record_number` UNIQUE and would
 * double-alert. We catch it by looking for another complaint with the same normalized street,
 * violation date, and description that is already alerted (or queued to be) — see
 * {@link isTmpCeDuplicate}.
 *
 * @returns whether this complaint is a duplicate that should be stored but not notified
 */
export async function diffAndStore(params: DiffAndStoreParams): Promise<DiffResult> {
    const { violation, propertyId, ownerCompanyId, ownerName, normalizedAddress } = params;

    const isDuplicate = await isTmpCeDuplicate(violation, normalizedAddress);

    await db
        .insert(cvMatches)
        .values({ violationId: violation.id, propertyId, ownerCompanyId, ownerName })
        .onConflictDoNothing({ target: cvMatches.violationId });

    return { isDuplicate };
}

/**
 * Detect a ##TMP→CE duplicate: another complaint, under a different record number, that is the same
 * physical complaint (same normalized street + violation date + description) and is already alerted
 * or queued to alert. Needs a normalized address and a violation date to be reliable — without both,
 * the key is too weak and we don't dedup.
 *
 * "Already alerted or queued" = `awaiting_review` (will email on Approve) or `complete` + `notified`
 * (already emailed). A duplicate of a complaint that merely had nobody to email isn't suppressed —
 * it would land in the same non-notifying state on its own.
 */
async function isTmpCeDuplicate(violation: CvViolation, normalizedAddress: string): Promise<boolean> {
    if (!normalizedAddress || !violation.violationDate) return false;

    const [duplicate] = await db
        .select({ id: cvViolations.id })
        .from(cvViolations)
        .where(
            and(
                ne(cvViolations.id, violation.id),
                eq(cvViolations.normalizedAddress, normalizedAddress),
                eq(cvViolations.violationDate, violation.violationDate),
                sql`md5(coalesce(${cvViolations.description}, '')) = md5(${violation.description ?? ''})`,
                sql`(${cvViolations.processingStatus} = 'awaiting_review' or (${cvViolations.processingStatus} = 'complete' and ${cvViolations.notified} = true))`,
            ),
        )
        .limit(1);

    if (duplicate) {
        console.log(
            `[CV-CONSUMER] ##TMP→CE duplicate: ${violation.recordNumber} matches already-alerted ${duplicate.id} — storing, not notifying`,
        );
    }

    return Boolean(duplicate);
}
