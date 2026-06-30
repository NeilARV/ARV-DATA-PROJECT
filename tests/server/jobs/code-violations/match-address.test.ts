import { describe, it, expect, vi } from 'vitest';

// parseCsvAddress and matchParsedAddress are the pure core of the MATCH stage (§4.3) — they touch
// no DB. Mock server/storage only so importing the module (which also exports the db-backed
// loadCandidateAddresses / matchViolationBatch) never opens a real connection.
vi.mock('server/storage', () => ({ db: {} }));

import {
    parseCsvAddress,
    matchParsedAddress,
    type MatchCandidate,
    type ParsedCsvAddress,
} from 'server/jobs/code-violations/processes/match-address';

describe('parseCsvAddress', () => {
    it('parseCsvAddress — full address — splits street/city/state/zip', () => {
        const parsed = parseCsvAddress('3421 Adams Av, San Diego CA 92116 United States');
        expect(parsed).toEqual<ParsedCsvAddress>({
            streetNumber: '3421',
            normalizedStreet: '3421 ADAMS AVE',
            city: 'SAN DIEGO',
            state: 'CA',
            zip: '92116',
        });
    });

    it('parseCsvAddress — no zip — leaves zip null but keeps city/state', () => {
        const parsed = parseCsvAddress('3426 Adams Av, San Diego CA United States');
        expect(parsed.zip).toBeNull();
        expect(parsed.state).toBe('CA');
        expect(parsed.city).toBe('SAN DIEGO');
        expect(parsed.normalizedStreet).toBe('3426 ADAMS AVE');
    });

    it('parseCsvAddress — no state and no zip — leaves both null', () => {
        const parsed = parseCsvAddress('3095 W CANYON Av, SAN DIEGO United States');
        expect(parsed.state).toBeNull();
        expect(parsed.zip).toBeNull();
        expect(parsed.city).toBe('SAN DIEGO');
        expect(parsed.streetNumber).toBe('3095');
        expect(parsed.normalizedStreet).toBe('3095 W CANYON AVE');
    });

    it('parseCsvAddress — no country suffix — still parses zip', () => {
        const parsed = parseCsvAddress('3029 Broadway, San Diego CA 92102');
        expect(parsed).toEqual<ParsedCsvAddress>({
            streetNumber: '3029',
            normalizedStreet: '3029 BROADWAY',
            city: 'SAN DIEGO',
            state: 'CA',
            zip: '92102',
        });
    });

    it('parseCsvAddress — bare-junk row — yields no house number so it never matches', () => {
        const parsed = parseCsvAddress('United States');
        // The leading "United States" isn't a trailing country suffix, so it survives cleaning — but
        // with no leading house number the row can never match a property (matchParsedAddress below).
        expect(parsed.streetNumber).toBeNull();
        expect(parsed.city).toBeNull();
        expect(matchParsedAddress(parsed, [candidate({ normalizedStreet: parsed.normalizedStreet })])).toEqual({
            kind: 'unmatched',
        });
    });

    it('parseCsvAddress — ordinal street name — is not mistaken for a house number', () => {
        const parsed = parseCsvAddress('First Av, San Diego CA');
        // "FIRST" → "1ST" stays in the body; the leading token isn't digits-only → no house number.
        expect(parsed.streetNumber).toBeNull();
        expect(parsed.normalizedStreet).toBe('1ST AVE');
    });

    it('parseCsvAddress — unit-suffixed house number — collapses to the bare numeric form', () => {
        const parsed = parseCsvAddress('123B Main St, San Diego CA 92101');
        expect(parsed.streetNumber).toBe('123');
        expect(parsed.normalizedStreet).toBe('123 MAIN ST');
    });
});

// Build a candidate with its street key precomputed exactly as matchViolationBatch does (the real
// normalizeAddressForMatch runs there); here we just hand the matcher the canonical key directly.
function candidate(overrides: Partial<MatchCandidate> = {}): MatchCandidate {
    return {
        propertyId: 'p1',
        normalizedStreet: '3421 ADAMS AVE',
        city: 'San Diego',
        state: 'CA',
        zipCode: '92116',
        ...overrides,
    };
}

function parsed(overrides: Partial<ParsedCsvAddress> = {}): ParsedCsvAddress {
    return {
        streetNumber: '3421',
        normalizedStreet: '3421 ADAMS AVE',
        city: 'SAN DIEGO',
        state: 'CA',
        zip: '92116',
        ...overrides,
    };
}

describe('matchParsedAddress', () => {
    it('matchParsedAddress — exactly one street+city+state hit — matched', () => {
        const outcome = matchParsedAddress(parsed(), [candidate()]);
        expect(outcome).toEqual({ kind: 'matched', propertyId: 'p1' });
    });

    it('matchParsedAddress — no usable street — unmatched without scanning candidates', () => {
        expect(matchParsedAddress(parsed({ normalizedStreet: '', streetNumber: null }), [candidate()])).toEqual({
            kind: 'unmatched',
        });
        expect(matchParsedAddress(parsed({ streetNumber: null }), [candidate()])).toEqual({
            kind: 'unmatched',
        });
    });

    it('matchParsedAddress — zero street hits — unmatched', () => {
        const outcome = matchParsedAddress(parsed(), [candidate({ normalizedStreet: '99 OTHER ST' })]);
        expect(outcome).toEqual({ kind: 'unmatched' });
    });

    it('matchParsedAddress — city present in CSV but candidate city differs — filtered out', () => {
        const outcome = matchParsedAddress(parsed(), [candidate({ city: 'La Mesa' })]);
        expect(outcome).toEqual({ kind: 'unmatched' });
    });

    it('matchParsedAddress — state present in CSV but candidate state differs — filtered out', () => {
        const outcome = matchParsedAddress(parsed(), [candidate({ state: 'NV' })]);
        expect(outcome).toEqual({ kind: 'unmatched' });
    });

    it('matchParsedAddress — CSV has no city/state — does not filter on them', () => {
        const outcome = matchParsedAddress(parsed({ city: null, state: null }), [
            candidate({ city: 'La Mesa', state: 'NV' }),
        ]);
        expect(outcome).toEqual({ kind: 'matched', propertyId: 'p1' });
    });

    it('matchParsedAddress — two distinct properties on the same street — ambiguous', () => {
        const outcome = matchParsedAddress(parsed({ zip: null }), [
            candidate({ propertyId: 'p1', zipCode: '92116' }),
            candidate({ propertyId: 'p2', zipCode: '92117' }),
        ]);
        expect(outcome).toEqual({ kind: 'ambiguous', propertyIds: ['p1', 'p2'] });
    });

    it('matchParsedAddress — zip breaks an otherwise-ambiguous tie — matched', () => {
        const outcome = matchParsedAddress(parsed({ zip: '92117' }), [
            candidate({ propertyId: 'p1', zipCode: '92116' }),
            candidate({ propertyId: 'p2', zipCode: '92117' }),
        ]);
        expect(outcome).toEqual({ kind: 'matched', propertyId: 'p2' });
    });

    it('matchParsedAddress — same property under two address rows — one match, not ambiguous', () => {
        const outcome = matchParsedAddress(parsed(), [
            candidate({ propertyId: 'p1', zipCode: '92116' }),
            candidate({ propertyId: 'p1', zipCode: '92117' }),
        ]);
        expect(outcome).toEqual({ kind: 'matched', propertyId: 'p1' });
    });
});
