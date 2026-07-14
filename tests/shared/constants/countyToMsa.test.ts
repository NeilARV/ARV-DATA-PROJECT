import { describe, it, expect } from 'vitest';
import {
    COUNTY_TO_MSA,
    getMsaForCounty,
    getCountiesForMsa,
    getStateFromMsaName,
    getTrackedCounties,
} from '@shared/constants/countyToMsa';
import { COUNTIES } from '@/constants/filters.constants';

// These helpers are the single source of truth for county↔MSA membership that the county
// subscription schema, recipient resolver, and State→MSA→county picker all build on. The
// reconciliation tests below fail loudly the moment COUNTIES and COUNTY_TO_MSA drift apart.

const TRACKED_MSAS = [...new Set(Object.values(COUNTY_TO_MSA))];

describe('getMsaForCounty', () => {
    it.each(Object.entries(COUNTY_TO_MSA))('maps %s → its MSA', (county, msa) => {
        expect(getMsaForCounty(county)).toBe(msa);
    });

    it.each(['Nowhere', 'orange', 'San Diego County', ''])(
        'returns null for the untracked county %j',
        (county) => {
            expect(getMsaForCounty(county)).toBeNull();
        },
    );
});

describe('getCountiesForMsa', () => {
    it.each(TRACKED_MSAS)('returns exactly the counties whose map value is %s', (msa) => {
        const expected = Object.entries(COUNTY_TO_MSA)
            .filter(([, m]) => m === msa)
            .map(([c]) => c);
        expect(getCountiesForMsa(msa)).toEqual(expected);
        expect(getCountiesForMsa(msa).length).toBeGreaterThan(0);
    });

    it('returns an empty array for an untracked MSA', () => {
        expect(getCountiesForMsa('Nowhere, ZZ')).toEqual([]);
    });

    it('every county round-trips: county → MSA → counties includes it', () => {
        for (const county of Object.keys(COUNTY_TO_MSA)) {
            const msa = getMsaForCounty(county)!;
            expect(getCountiesForMsa(msa)).toContain(county);
        }
    });
});

describe('getStateFromMsaName', () => {
    it.each(TRACKED_MSAS)('parses a two-letter state from %s', (msa) => {
        expect(getStateFromMsaName(msa)).toMatch(/^[A-Z]{2}$/);
    });

    it('returns null when there is no trailing state code', () => {
        expect(getStateFromMsaName('Denver-Aurora-Centennial')).toBeNull();
        expect(getStateFromMsaName('')).toBeNull();
    });
});

describe('getTrackedCounties', () => {
    it('covers every entry in COUNTY_TO_MSA exactly once', () => {
        const tracked = getTrackedCounties();
        expect(tracked).toHaveLength(Object.keys(COUNTY_TO_MSA).length);
        expect(new Set(tracked.map((t) => t.county))).toEqual(new Set(Object.keys(COUNTY_TO_MSA)));
    });

    it('resolves a concrete two-letter state for every tracked county', () => {
        for (const { county, state } of getTrackedCounties()) {
            expect(state, `state for ${county}`).toMatch(/^[A-Z]{2}$/);
        }
    });
});

describe('COUNTIES ↔ COUNTY_TO_MSA reconciliation', () => {
    it('offers exactly the counties tracked in COUNTY_TO_MSA — no drift either way', () => {
        const offered = new Set(COUNTIES.map((c) => c.county));
        const tracked = new Set(Object.keys(COUNTY_TO_MSA));
        expect(offered).toEqual(tracked);
    });

    it('every offered county belongs to a tracked MSA', () => {
        for (const { county } of COUNTIES) {
            expect(getMsaForCounty(county), `MSA for ${county}`).not.toBeNull();
        }
    });

    it("each offered county's state matches its MSA-derived state", () => {
        for (const { county, state } of COUNTIES) {
            const msaState = getStateFromMsaName(getMsaForCounty(county)!);
            expect(msaState, `state for ${county}`).toBe(state);
        }
    });
});
