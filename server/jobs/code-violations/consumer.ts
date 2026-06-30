import { fetchPendingViolations } from './processes/fetch-queue';
import {
    resetStaleProcessing,
    markProcessing,
    markNoMatch,
    markAmbiguous,
    markAwaitingReview,
    markComplete,
    markFailed,
    refreshUploadStatus,
} from './processes/mark-status';
import { matchViolationBatch } from './processes/match-address';
import { resolveOwner } from './processes/resolve-owner';
import { diffAndStore } from './processes/diff-and-store';

const LABEL = '[CV-CONSUMER]';
const DEFAULT_BATCH_SIZE = 25;
// Soft-lock age: a row stuck in 'processing' longer than this was orphaned by a crash → reset.
const STALE_PROCESSING_MINUTES = 30;

/** `CV_BATCH_SIZE` env override, falling back to {@link DEFAULT_BATCH_SIZE} when unset/invalid. */
function getBatchSize(): number {
    const parsed = Number(process.env.CV_BATCH_SIZE);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_BATCH_SIZE;
}

/**
 * Phase 2 consumer (§4, §5.3): drain a batch of `pending` complaints — MATCH → RESOLVE OWNER → DIFF
 * → set status. One small, frequent pass per run (up to `CV_BATCH_SIZE`), mirroring `data_v2`.
 *
 * Per complaint:
 *  - unmatched → `no_match`; ambiguous → `ambiguous` (both terminal, surfaced for admin review).
 *  - matched → resolve the current owner, write the `cv_matches` row, and route by status:
 *      • nobody to email (individual/unlinked owner, or a company with no users), or a ##TMP→CE
 *        duplicate already alerted elsewhere → `complete`, `notified = false`.
 *      • matched + notifiable → `awaiting_review` (the §4.6 dry-run gate; the email is held for the
 *        admin's Approve). Chunk D adds the `CV_REQUIRE_REVIEW=off` path that notifies inline and
 *        marks `complete` instead, plus the Approve endpoint that drains `awaiting_review`.
 *
 * Resilience (§5.3): rows are soft-locked `processing` before work; a row that throws is marked
 * `failed` with the reason and left for admin review (no auto-retry); one bad row never aborts the
 * batch. Stale `processing` rows are recovered at the top of each run.
 */
export async function runCodeViolationConsumer(): Promise<void> {
    const startedAt = Date.now();

    const staleReset = await resetStaleProcessing(STALE_PROCESSING_MINUTES);
    if (staleReset > 0) {
        console.log(`${LABEL} Recovered ${staleReset} stale 'processing' row(s) → 'pending'`);
    }

    const batch = await fetchPendingViolations(getBatchSize());
    if (batch.length === 0) {
        console.log(`${LABEL} No pending violations`);
        return;
    }

    console.log(`${LABEL} Processing ${batch.length} violation(s)`);
    await markProcessing(batch.map((v) => v.id));

    const matches = await matchViolationBatch(batch);

    const totals = { matched: 0, noMatch: 0, ambiguous: 0, awaitingReview: 0, duplicate: 0, failed: 0 };
    const affectedUploads = new Set<string>();

    for (const { violation, parsed, outcome } of matches) {
        if (violation.firstSeenUploadId) affectedUploads.add(violation.firstSeenUploadId);

        try {
            if (outcome.kind === 'unmatched') {
                await markNoMatch(violation.id, parsed.normalizedStreet);
                totals.noMatch++;
                continue;
            }
            if (outcome.kind === 'ambiguous') {
                await markAmbiguous(violation.id, parsed.normalizedStreet);
                totals.ambiguous++;
                continue;
            }

            const owner = await resolveOwner(outcome.propertyId);
            const { isDuplicate } = await diffAndStore({
                violation,
                propertyId: outcome.propertyId,
                ownerCompanyId: owner.ownerCompanyId,
                ownerName: owner.ownerName,
                normalizedAddress: parsed.normalizedStreet,
            });
            totals.matched++;

            if (!owner.isNotifiable || isDuplicate) {
                if (isDuplicate) totals.duplicate++;
                await markComplete(violation.id, {
                    normalizedAddress: parsed.normalizedStreet,
                    notified: false,
                });
                continue;
            }

            await markAwaitingReview(violation.id, parsed.normalizedStreet);
            totals.awaitingReview++;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`${LABEL} Violation ${violation.recordNumber} failed: ${message}`);
            await markFailed(violation.id, message);
            totals.failed++;
        }
    }

    for (const uploadId of Array.from(affectedUploads)) {
        await refreshUploadStatus(uploadId);
    }

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(
        `${LABEL} Done in ${elapsed}s — ${totals.matched} matched ` +
            `(${totals.awaitingReview} awaiting review, ${totals.duplicate} duplicate), ` +
            `${totals.noMatch} no-match, ${totals.ambiguous} ambiguous, ${totals.failed} failed`,
    );
}
