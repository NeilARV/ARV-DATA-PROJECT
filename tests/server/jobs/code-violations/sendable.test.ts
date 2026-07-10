import { describe, it, expect } from 'vitest';
import { isSendableComplaint } from 'server/jobs/code-violations/processes/sendable';

// isSendableComplaint gates which matched complaints actually email (§ code-enforcement send filter):
// only CE-* records with an open Accela status (New / Active*). Everything else is stored, not sent.
// The real San Diego export's status set is the fixture universe here.

function v(recordNumber: string, statusText: string | null) {
    return { recordNumber, statusText };
}

describe('isSendableComplaint', () => {
    it.each([
        ['CE-0542048', 'New'],
        ['CE-0542048', 'Active Investigation'],
        ['CE-0542048', 'Active Enforcement'],
        ['CE0542161', 'New'], // no dash variant
        ['ce-0542048', 'new'], // case-insensitive on both fields
        ['  CE-1  ', '  Active Investigation  '], // surrounding whitespace tolerated
    ])('sends a code-enforcement complaint with an open status: %s / %s', (record, status) => {
        expect(isSendableComplaint(v(record, status))).toBe(true);
    });

    it.each([
        ['CE-0542019', 'Closed - No Violation'],
        ['CE-0541971', 'Closed - Duplicate Case'],
        ['CE-1', 'Closed -Alternative Compliance'],
        ['CE-1', 'Closed-Administrative Closure'],
        ['CE-1', 'Closed - Not Accepted - Budget'],
    ])('does not send a closed code-enforcement complaint: %s / %s', (record, status) => {
        expect(isSendableComplaint(v(record, status))).toBe(false);
    });

    it.each([
        ['26TMP-050225', ''], // temporary complaints carry no status
        ['26TMP-049793', null],
        ['26TMP-049892', 'New'], // even if a TMP row somehow had a status, it is never sent
    ])('never sends a temporary (TMP) complaint: %s / %s', (record, status) => {
        expect(isSendableComplaint(v(record, status))).toBe(false);
    });

    it('does not send a CE record with a missing/blank status', () => {
        expect(isSendableComplaint(v('CE-1', null))).toBe(false);
        expect(isSendableComplaint(v('CE-1', ''))).toBe(false);
    });
});
