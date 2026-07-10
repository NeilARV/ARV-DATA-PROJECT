import type { CvViolation } from '@database/types/code-violations';

/**
 * Whether a matched complaint is the kind we email an alert for. Two independent gates, both required:
 * only **code-enforcement** records (`CE-*`) and only **open** dispositions (a brand-new complaint or
 * an active investigation/enforcement).
 *
 * Everything else is still matched and stored — we just never email it:
 *  - **Temporary complaints** (`##TMP-*`) carry no status/type and are excluded outright.
 *  - **Closed** code-enforcement records (every closed disposition's Accela status starts with
 *    "Closed") are stored but not alerted.
 *
 * The Accela `Status` column is the source: `New`, `Active Investigation`, and `Active Enforcement`
 * are the open states; a missing status (as `##TMP-*` rows have) is not sendable.
 */
export function isSendableComplaint(
    violation: Pick<CvViolation, 'recordNumber' | 'statusText'>,
): boolean {
    // Only code-enforcement (CE-*) records are alerted; ##TMP-* and any other prefix are stored only.
    if (!violation.recordNumber.trim().toUpperCase().startsWith('CE')) return false;

    // Alert only on open cases; every closed disposition's status starts with "Closed".
    const status = (violation.statusText ?? '').trim().toUpperCase();
    return status === 'NEW' || status.startsWith('ACTIVE');
}
