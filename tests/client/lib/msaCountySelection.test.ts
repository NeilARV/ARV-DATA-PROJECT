import { describe, it, expect } from 'vitest';
import {
    DEFAULT_MSA_COUNTY_SELECTION,
    isSameSelection,
    parseMsaCountyParams,
    selectionFromCounty,
    writeMsaCountyParams,
} from '@/lib/msaCountySelection';
import { getCountiesForMsa } from '@shared/constants/countyToMsa';

// URL ↔ selection contract for the Data app (issue #119): ?msa=<name>&counties=<comma-joined>
// carries the county set (counties= empty means none selected), legacy ?county= URLs still
// resolve, and anything untracked or cross-MSA is dropped at parse time.

const DENVER_MSA = 'Denver-Aurora-Centennial, CO';
const SD_MSA = 'San Diego-Chula Vista-Carlsbad, CA';

describe('parseMsaCountyParams', () => {
    it('parses msa + comma-joined counties', () => {
        const params = new URLSearchParams({ msa: DENVER_MSA, counties: 'Denver,Adams' });
        expect(parseMsaCountyParams(params)).toEqual({
            msa: DENVER_MSA,
            counties: ['Denver', 'Adams'],
        });
    });

    it('an empty counties param means none selected', () => {
        const params = new URLSearchParams({ msa: DENVER_MSA, counties: '' });
        expect(parseMsaCountyParams(params)).toEqual({ msa: DENVER_MSA, counties: [] });
    });

    it('a missing counties param selects the whole MSA', () => {
        const params = new URLSearchParams({ msa: DENVER_MSA });
        expect(parseMsaCountyParams(params)).toEqual({
            msa: DENVER_MSA,
            counties: getCountiesForMsa(DENVER_MSA),
        });
    });

    it('drops counties that do not belong to the msa', () => {
        const params = new URLSearchParams({
            msa: DENVER_MSA,
            counties: 'Denver,San Diego,Nowhere',
        });
        expect(parseMsaCountyParams(params)).toEqual({ msa: DENVER_MSA, counties: ['Denver'] });
    });

    it('returns null for an untracked msa', () => {
        const params = new URLSearchParams({ msa: 'Nowhere, ZZ', counties: 'Denver' });
        expect(parseMsaCountyParams(params)).toBeNull();
    });

    it('resolves a legacy ?county= URL to that county within its MSA', () => {
        const params = new URLSearchParams({ county: 'Adams' });
        expect(parseMsaCountyParams(params)).toEqual({ msa: DENVER_MSA, counties: ['Adams'] });
    });

    it('returns null for a legacy untracked county', () => {
        expect(parseMsaCountyParams(new URLSearchParams({ county: 'Nowhere' }))).toBeNull();
    });

    it('returns null when no geo params are present', () => {
        expect(parseMsaCountyParams(new URLSearchParams())).toBeNull();
    });
});

describe('writeMsaCountyParams', () => {
    it('writes msa + counties and removes the legacy county param', () => {
        const params = new URLSearchParams({ county: 'San Diego', property: 'p1' });
        writeMsaCountyParams(params, { msa: DENVER_MSA, counties: ['Denver', 'Adams'] });
        expect(params.get('msa')).toBe(DENVER_MSA);
        expect(params.get('counties')).toBe('Denver,Adams');
        expect(params.get('county')).toBeNull();
        expect(params.get('property')).toBe('p1');
    });

    it('round-trips through parseMsaCountyParams, including none selected', () => {
        for (const counties of [['Denver'], [], getCountiesForMsa(DENVER_MSA)]) {
            const params = new URLSearchParams();
            writeMsaCountyParams(params, { msa: DENVER_MSA, counties });
            expect(parseMsaCountyParams(params)).toEqual({ msa: DENVER_MSA, counties });
        }
    });
});

describe('selectionFromCounty', () => {
    it('anchors on the home county within its MSA', () => {
        expect(selectionFromCounty('Adams')).toEqual({ msa: DENVER_MSA, counties: ['Adams'] });
    });

    it.each([null, undefined, 'Nowhere'])('falls back to the default for %j', (county) => {
        expect(selectionFromCounty(county)).toEqual(DEFAULT_MSA_COUNTY_SELECTION);
    });
});

describe('DEFAULT_MSA_COUNTY_SELECTION', () => {
    it('is San Diego county in the San Diego MSA (today’s default)', () => {
        expect(DEFAULT_MSA_COUNTY_SELECTION).toEqual({ msa: SD_MSA, counties: ['San Diego'] });
    });
});

describe('isSameSelection', () => {
    it('compares the msa and the county set, ignoring order', () => {
        expect(
            isSameSelection(
                { msa: DENVER_MSA, counties: ['Adams', 'Denver'] },
                { msa: DENVER_MSA, counties: ['Denver', 'Adams'] },
            ),
        ).toBe(true);
        expect(
            isSameSelection(
                { msa: DENVER_MSA, counties: ['Denver'] },
                { msa: DENVER_MSA, counties: ['Denver', 'Adams'] },
            ),
        ).toBe(false);
        expect(
            isSameSelection({ msa: DENVER_MSA, counties: [] }, { msa: SD_MSA, counties: [] }),
        ).toBe(false);
    });
});
