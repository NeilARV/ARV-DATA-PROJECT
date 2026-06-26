import Papa from 'papaparse';

// Tolerant parser for the City of San Diego Accela "Code Enforcement" CSV export.
// The export is quirky (verified against a real download): a trailing comma adds an
// empty 8th column; descriptions contain embedded commas, newlines, smart quotes and
// doubled "" escapes; and `##TMP-` intake rows often have blank Application Name /
// Status / Description. We lean on a real CSV parser (papaparse) — never split(',').

/** One complaint row, post-parse. `violationDate` is normalized to YYYY-MM-DD. */
export interface ParsedViolationRow {
    recordNumber: string;
    recordType: string | null;
    rawAddress: string;
    applicationName: string | null;
    status: string | null;
    description: string | null;
    violationDate: string | null;
}

// Expected header columns (the trailing empty 8th column is ignored).
const COLUMNS = {
    date: 'Date',
    recordNumber: 'Record Number',
    recordType: 'Record Type',
    address: 'Address',
    applicationName: 'Application Name',
    status: 'Status',
    description: 'Description',
} as const;

function stripBom(text: string): string {
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

// Trim a field; collapse empties (and the literal "null") to null so blank ##TMP fields
// don't store empty strings.
function clean(value: string | undefined): string | null {
    if (value == null) return null;
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.toLowerCase() === 'null') return null;
    return trimmed;
}

// Accela dates are MM/DD/YYYY; convert to YYYY-MM-DD (the cv_violations.violation_date
// column is a DATE). Returns null on any unexpected shape rather than guessing.
function toIsoDate(value: string | undefined): string | null {
    const trimmed = clean(value);
    if (!trimmed) return null;
    const m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    const [, month, day, year] = m;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/**
 * Parse a raw Accela CE CSV string into normalized violation rows.
 * Rows without a record number or address are dropped (unmatchable / not a real record).
 * Within one file, a duplicated record number keeps the last occurrence — the DB upsert
 * on `record_number` is the cross-file idempotency backstop.
 * @param rawCsv the full CSV file contents
 * @returns one ParsedViolationRow per usable complaint
 */
export function parseCsv(rawCsv: string): ParsedViolationRow[] {
    const result = Papa.parse<Record<string, string>>(stripBom(rawCsv), {
        header: true,
        skipEmptyLines: 'greedy',
        transformHeader: (header) => header.trim(),
    });

    const byRecordNumber = new Map<string, ParsedViolationRow>();

    for (const raw of result.data) {
        const recordNumber = clean(raw[COLUMNS.recordNumber]);
        const rawAddress = clean(raw[COLUMNS.address]);
        if (!recordNumber || !rawAddress) continue;

        byRecordNumber.set(recordNumber, {
            recordNumber,
            recordType: clean(raw[COLUMNS.recordType]),
            rawAddress,
            applicationName: clean(raw[COLUMNS.applicationName]),
            status: clean(raw[COLUMNS.status]),
            description: clean(raw[COLUMNS.description]),
            violationDate: toIsoDate(raw[COLUMNS.date]),
        });
    }

    return Array.from(byRecordNumber.values());
}
