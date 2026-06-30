import { describe, it, expect, vi } from 'vitest';

// Mock the two boundaries this unit doesn't own so importing the service never opens a real
// DB/Storage connection. The functions under test (parseAccelaDate, parseCodeViolationCsv) are
// pure and touch neither.
vi.mock('server/storage', () => ({ db: {} }));
vi.mock('server/lib/supabase', () => ({
    getSupabase: () => ({}),
    codeViolationStorageBucket: 'test-code-violations-bucket',
}));

import {
    parseAccelaDate,
    parseCodeViolationCsv,
    InvalidCsvError,
} from 'server/services/code-violations/code-violations.services';

const HEADER = 'Date,Record Number,Record Type,Address,Application Name,Status,Description,';

function csv(...rows: string[]): Buffer {
    return Buffer.from([HEADER, ...rows].join('\n'), 'utf8');
}

describe('parseAccelaDate', () => {
    it('parseAccelaDate — MM/DD/YYYY — returns YYYY-MM-DD with no timezone shift', () => {
        expect(parseAccelaDate('01/15/2026')).toBe('2026-01-15');
        // A month-boundary date that a Date/toISOString round-trip would shift on a UTC+ server.
        expect(parseAccelaDate('03/01/2026')).toBe('2026-03-01');
    });

    it('parseAccelaDate — single-digit month/day — zero-pads', () => {
        expect(parseAccelaDate('1/5/2026')).toBe('2026-01-05');
    });

    it('parseAccelaDate — empty string — returns null', () => {
        expect(parseAccelaDate('')).toBeNull();
        expect(parseAccelaDate('   ')).toBeNull();
    });

    it('parseAccelaDate — non-MM/DD/YYYY format — returns null', () => {
        expect(parseAccelaDate('2026-01-15')).toBeNull();
        expect(parseAccelaDate('Jan 15, 2026')).toBeNull();
    });

    it('parseAccelaDate — impossible month/day — returns null', () => {
        expect(parseAccelaDate('13/40/2026')).toBeNull();
        expect(parseAccelaDate('00/00/2026')).toBeNull();
    });
});

describe('parseCodeViolationCsv', () => {
    it('parseCodeViolationCsv — valid rows — returns all rows, skips nothing', () => {
        const { rows, skipped } = parseCodeViolationCsv(
            csv(
                '01/15/2026,CE-1,Code Enforcement,123 Main St,Jane Doe,New,Overgrown lot,',
                '01/16/2026,CE-2,Code Enforcement,456 Oak Ave,John Roe,New,Trash,',
            ),
        );
        expect(skipped).toBe(0);
        expect(rows).toHaveLength(2);
        expect(rows[0].recordNumber).toBe('CE-1');
        expect(rows[1].rawAddress).toBe('456 Oak Ave');
    });

    it('parseCodeViolationCsv — junk line with no record number/address — is skipped', () => {
        const { rows, skipped } = parseCodeViolationCsv(
            csv(
                '01/15/2026,CE-1,Code Enforcement,123 Main St,Jane Doe,New,Overgrown lot,',
                ',,,,,,United States,',
            ),
        );
        expect(rows).toHaveLength(1);
        expect(skipped).toBe(1);
    });

    it('parseCodeViolationCsv — does not dedup duplicate record numbers (ingest owns dedup)', () => {
        const { rows } = parseCodeViolationCsv(
            csv(
                '01/15/2026,CE-1,Code Enforcement,123 Main St,Jane Doe,New,First,',
                '01/16/2026,CE-1,Code Enforcement,123 Main St,Jane Doe,Updated,Second,',
            ),
        );
        expect(rows).toHaveLength(2);
    });

    it('parseCodeViolationCsv — missing a required header column — throws InvalidCsvError', () => {
        // Header without the Address column.
        const broken = Buffer.from(
            'Date,Record Number,Record Type,Application Name,Status,Description\n' +
                '01/15/2026,CE-1,Code Enforcement,Jane Doe,New,Overgrown lot',
            'utf8',
        );
        expect(() => parseCodeViolationCsv(broken)).toThrow(InvalidCsvError);
    });

    it('parseCodeViolationCsv — body truncated mid-quoted-field — throws InvalidCsvError', () => {
        // An opening quote that never closes corrupts the parse — must not look like a clean ingest.
        const truncated = csv('01/15/2026,CE-1,Code Enforcement,"123 Main St,Jane Doe,New,Overgrown');
        expect(() => parseCodeViolationCsv(truncated)).toThrow(InvalidCsvError);
    });
});
