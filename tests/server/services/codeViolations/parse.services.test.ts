import { describe, it, expect } from 'vitest';
import { parseCsv } from 'server/services/codeViolations/parse.services';

// Fixtures mirror the real San Diego Accela export quirks (verified against a live
// download): a header with a trailing empty 8th column, CE-/##TMP- record numbers,
// blank ##TMP fields, doubled "" escapes, embedded commas + newlines in descriptions.
const HEADER = '"Date","Record Number","Record Type","Address","Application Name","Status","Description",';

describe('parseCsv', () => {
    it('parses a standard CE complaint row and normalizes the date to YYYY-MM-DD', () => {
        const csv = `${HEADER}
"06/26/2026","CE-0542079","Complaint","991 Worthington St, San Diego CA 92114 United States","Noise-Barking Dogs","New","A neighboring dog barks all morning.",`;

        const rows = parseCsv(csv);

        expect(rows).toHaveLength(1);
        expect(rows[0]).toEqual({
            recordNumber: 'CE-0542079',
            recordType: 'Complaint',
            rawAddress: '991 Worthington St, San Diego CA 92114 United States',
            applicationName: 'Noise-Barking Dogs',
            status: 'New',
            description: 'A neighboring dog barks all morning.',
            violationDate: '2026-06-26',
        });
    });

    it('keeps a ##TMP intake row with blank application/status/description as nulls', () => {
        const csv = `${HEADER}
"06/25/2026","26TMP-050225","Complaint","3585 HANCOCK St, SAN DIEGO CA 92110 United States",,,,`;

        const rows = parseCsv(csv);

        expect(rows).toHaveLength(1);
        expect(rows[0].recordNumber).toBe('26TMP-050225');
        expect(rows[0].applicationName).toBeNull();
        expect(rows[0].status).toBeNull();
        expect(rows[0].description).toBeNull();
    });

    it('decodes doubled "" quotes and preserves commas inside a quoted description', () => {
        const csv = `${HEADER}
"06/25/2026","CE-0542077","Complaint","3566 43rd St, San Diego CA 92105 United States","Noise-Other","New","GID DEH""Rooster is back, again"" please investigate.",`;

        const rows = parseCsv(csv);

        expect(rows[0].description).toBe('GID DEH"Rooster is back, again" please investigate.');
    });

    it('preserves newlines embedded in a quoted description (multiline field)', () => {
        const csv = `${HEADER}
"06/25/2026","CE-0542066","Complaint","4637 34th St, Apt 101, San Diego CA 92103 United States","Building","New","Line one of the complaint.
Line two of the complaint.",`;

        const rows = parseCsv(csv);

        expect(rows).toHaveLength(1);
        expect(rows[0].description).toContain('Line one of the complaint.');
        expect(rows[0].description).toContain('Line two of the complaint.');
        expect(rows[0].description).toContain('\n');
    });

    it('drops rows missing a record number or address', () => {
        const csv = `${HEADER}
"06/25/2026","CE-0542074","Complaint","4837 Del Monte Av, San Diego CA United States","Building","New","valid",
"06/25/2026","","Complaint","",,,,
"06/25/2026","CE-0542073","Complaint","",,,,`;

        const rows = parseCsv(csv);

        expect(rows).toHaveLength(1);
        expect(rows[0].recordNumber).toBe('CE-0542074');
    });

    it('dedupes a record number repeated within one file, keeping the last occurrence', () => {
        const csv = `${HEADER}
"06/25/2026","CE-0542079","Complaint","991 Worthington St, San Diego CA 92114 United States","Noise","New","first",
"06/26/2026","CE-0542079","Complaint","999 Updated Ave, San Diego CA 92114 United States","Noise","Closed","second",`;

        const rows = parseCsv(csv);

        expect(rows).toHaveLength(1);
        expect(rows[0].status).toBe('Closed');
        expect(rows[0].rawAddress).toBe('999 Updated Ave, San Diego CA 92114 United States');
    });

    it('tolerates a UTF-8 BOM on the first header cell', () => {
        const csv = `﻿${HEADER}
"06/26/2026","CE-1","Complaint","1 Test St, San Diego CA 92101 United States","X","New","y",`;

        const rows = parseCsv(csv);

        expect(rows).toHaveLength(1);
        expect(rows[0].recordNumber).toBe('CE-1');
        expect(rows[0].violationDate).toBe('2026-06-26');
    });
});
