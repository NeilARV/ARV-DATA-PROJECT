import { describe, it, expect } from 'vitest';
import { parseAddress, streetKeyFromComponents } from 'server/services/codeViolations/address.services';
import {
    buildCandidateIndex,
    matchAddress,
    type AddressCandidate,
} from 'server/services/codeViolations/match.services';

// Build a candidate the way production does: canonical street from our stored components.
function candidate(
    propertyId: string,
    streetNumber: string,
    components: Parameters<typeof streetKeyFromComponents>[0],
    city: string | null,
    zip: string | null,
): AddressCandidate {
    return {
        propertyId,
        streetNumber,
        canonicalStreet: streetKeyFromComponents(components),
        city,
        zip,
    };
}

describe('parseAddress', () => {
    it('parses a full "City ST ZIP United States" address', () => {
        expect(parseAddress('991 Worthington St, San Diego CA 92114 United States')).toEqual({
            streetNumber: '991',
            streetName: 'worthington st',
            unit: null,
            city: 'San Diego',
            state: 'CA',
            zip: '92114',
            normalized: '991 worthington st',
        });
    });

    it('handles a missing zip (City ST only)', () => {
        const parsed = parseAddress('3750 Torrey View Ct, San Diego CA United States');
        expect(parsed.zip).toBeNull();
        expect(parsed.city).toBe('San Diego');
        expect(parsed.streetName).toBe('torrey view ct');
    });

    it('extracts a middle unit segment ("Apt 101")', () => {
        const parsed = parseAddress('4637 34th St, Apt 101, San Diego CA 92103 United States');
        expect(parsed.streetNumber).toBe('4637');
        expect(parsed.streetName).toBe('34th st');
        expect(parsed.unit).toBe('Apt 101');
        expect(parsed.zip).toBe('92103');
    });

    it('treats a bare trailing segment with no state as a unit, not a locality', () => {
        const parsed = parseAddress('299 16TH St, 109');
        expect(parsed.streetNumber).toBe('299');
        expect(parsed.streetName).toBe('16th st');
        expect(parsed.unit).toBe('109');
        expect(parsed.city).toBeNull();
        expect(parsed.state).toBeNull();
    });

    it('strips "(Sb)" parenthetical noise', () => {
        expect(parseAddress('892 27th (Sb) St, San Diego CA United States').streetName).toBe(
            '27th st',
        );
    });

    it('canonicalizes "Bl" → blvd and "Av" → ave', () => {
        expect(parseAddress('5125 Foothill Bl, San Diego CA 92109 United States').streetName).toBe(
            'foothill blvd',
        );
        expect(parseAddress('4837 Del Monte Av, San Diego CA United States').streetName).toBe(
            'del monte ave',
        );
    });

    it('normalizes a zero-padded ordinal ("02nd" → 2nd)', () => {
        expect(parseAddress('1525 02nd Av, San Diego CA United States').streetName).toBe('2nd ave');
    });

    it('returns an empty shape for blank input', () => {
        expect(parseAddress('').streetNumber).toBeNull();
        expect(parseAddress(null).normalized).toBeNull();
    });
});

describe('streetKeyFromComponents', () => {
    it('matches the canonical form parseAddress produces for the CSV side', () => {
        // Our stored "Foothill" + "Blvd" must equal the CSV's "Foothill Bl".
        expect(streetKeyFromComponents({ streetName: 'Foothill', streetSuffix: 'Blvd' })).toBe(
            'foothill blvd',
        );
        expect(
            streetKeyFromComponents({
                streetPreDirection: 'N',
                streetName: 'Main',
                streetSuffix: 'St',
            }),
        ).toBe('n main st');
    });
});

describe('matchAddress', () => {
    const candidates: AddressCandidate[] = [
        candidate('p-worthington', '991', { streetName: 'Worthington', streetSuffix: 'St' }, 'San Diego', '92114'),
        candidate('p-foothill', '5125', { streetName: 'Foothill', streetSuffix: 'Blvd' }, 'San Diego', '92109'),
        candidate('p-hope', '3963', { streetName: 'Hope', streetSuffix: 'St' }, 'San Diego', '92115'),
        // Same number + street in two county cities → ambiguous without a zip.
        candidate('p-main-sd', '100', { streetName: 'Main', streetSuffix: 'St' }, 'San Diego', '92101'),
        candidate('p-main-cv', '100', { streetName: 'Main', streetSuffix: 'St' }, 'Chula Vista', '91910'),
    ];
    const index = buildCandidateIndex(candidates);

    it('Tier 1 — exact match on number + street + zip', () => {
        const match = matchAddress(
            parseAddress('991 Worthington St, San Diego CA 92114 United States'),
            index,
        );
        expect(match).toEqual({ propertyId: 'p-worthington', method: 'exact', confidence: 1 });
    });

    it('Tier 2 — unambiguous number + street with no zip → exact_no_zip', () => {
        const match = matchAddress(
            parseAddress('5125 Foothill Bl, San Diego CA United States'),
            index,
        );
        expect(match?.propertyId).toBe('p-foothill');
        expect(match?.method).toBe('exact_no_zip');
    });

    it('Tier 2 — ambiguous number + street resolved by the CSV city', () => {
        const match = matchAddress(parseAddress('100 Main St, San Diego CA United States'), index);
        expect(match?.propertyId).toBe('p-main-sd');
        expect(match?.method).toBe('exact_no_zip');
    });

    it('Tier 1 still wins over ambiguity when a zip is present', () => {
        const match = matchAddress(
            parseAddress('100 Main St, San Diego CA 91910 United States'),
            index,
        );
        expect(match).toEqual({ propertyId: 'p-main-cv', method: 'exact', confidence: 1 });
    });

    it('Tier 3 — fuzzy match on a misspelled street name', () => {
        const match = matchAddress(
            parseAddress('3963 Hpe St, San Diego CA 92115 United States'),
            index,
        );
        expect(match?.propertyId).toBe('p-hope');
        expect(match?.method).toBe('fuzzy');
        expect(match?.confidence).toBeGreaterThanOrEqual(0.7);
        expect(match?.confidence).toBeLessThan(1);
    });

    it('returns null when nothing is close', () => {
        expect(
            matchAddress(
                parseAddress('12345 Nonexistent Rd, San Diego CA 99999 United States'),
                index,
            ),
        ).toBeNull();
    });
});
