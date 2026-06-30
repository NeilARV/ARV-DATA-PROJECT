import { describe, it, expect } from 'vitest';
import { formatAddress, normalizeAddressForMatch } from '@shared/utils/formatAddress';

// normalizeAddressForMatch is the correctness core of the code-violation matcher: both sides of a
// comparison run through it and are compared with `===`, so every branch here protects a real match.
describe('normalizeAddressForMatch', () => {
    it('returns "" for null/undefined/empty/non-string input', () => {
        expect(normalizeAddressForMatch(null)).toBe('');
        expect(normalizeAddressForMatch(undefined)).toBe('');
        expect(normalizeAddressForMatch('')).toBe('');
        expect(normalizeAddressForMatch('   ')).toBe('');
        // @ts-expect-error — guarding the runtime non-string branch
        expect(normalizeAddressForMatch(42)).toBe('');
    });

    it('uppercases, strips periods, and collapses whitespace', () => {
        expect(normalizeAddressForMatch('  3421 adams  ave.  ')).toBe('3421 ADAMS AVE');
    });

    it('treats commas as separators', () => {
        expect(normalizeAddressForMatch('3421 Adams Ave, San Diego')).toBe('3421 ADAMS AVE SAN DIEGO');
    });

    it('drops a trailing "UNITED STATES" / "USA"', () => {
        expect(normalizeAddressForMatch('3421 Adams Ave United States')).toBe('3421 ADAMS AVE');
        expect(normalizeAddressForMatch('3421 Adams Ave, USA')).toBe('3421 ADAMS AVE');
    });

    it('collapses suffix variants to one canonical token', () => {
        const expected = '100 OAK AVE';
        expect(normalizeAddressForMatch('100 Oak Avenue')).toBe(expected);
        expect(normalizeAddressForMatch('100 Oak Ave')).toBe(expected);
        expect(normalizeAddressForMatch('100 Oak Av')).toBe(expected);
        expect(normalizeAddressForMatch('100 Oak Av.')).toBe(expected);
    });

    it('keeps Plaza distinct from Place (the plz regression)', () => {
        expect(normalizeAddressForMatch('5 Market Plz')).toBe('5 MARKET PLAZA');
        expect(normalizeAddressForMatch('5 Market Plaza')).toBe('5 MARKET PLAZA');
        expect(normalizeAddressForMatch('5 Market Pl')).toBe('5 MARKET PL');
        expect(normalizeAddressForMatch('5 Market Plz')).not.toBe(normalizeAddressForMatch('5 Market Pl'));
    });

    it('collapses directionals regardless of position or spelling', () => {
        expect(normalizeAddressForMatch('100 North Main St')).toBe('100 N MAIN ST');
        expect(normalizeAddressForMatch('100 N Main St')).toBe('100 N MAIN ST');
        expect(normalizeAddressForMatch('100 Main St North')).toBe('100 MAIN ST N');
        expect(normalizeAddressForMatch('100 Southwest Main St')).toBe('100 SW MAIN ST');
    });

    it('rewrites spelled-out ordinals to the numeric form', () => {
        expect(normalizeAddressForMatch('100 First St')).toBe('100 1ST ST');
        expect(normalizeAddressForMatch('100 1st St')).toBe('100 1ST ST');
        expect(normalizeAddressForMatch('100 First St')).toBe(normalizeAddressForMatch('100 1st St'));
        expect(normalizeAddressForMatch('100 Twelfth Ave')).toBe('100 12TH AVE');
    });

    it('drops a unit designator together with its following value', () => {
        expect(normalizeAddressForMatch('123 Main St Apt 4')).toBe('123 MAIN ST');
        expect(normalizeAddressForMatch('123 Main St Ste 200')).toBe('123 MAIN ST');
        // So a unit on one side but not the other can't block a street match.
        expect(normalizeAddressForMatch('123 Main St Unit B')).toBe(
            normalizeAddressForMatch('123 Main St'),
        );
    });

    it('drops a "#"-prefixed unit token', () => {
        expect(normalizeAddressForMatch('123 Main St #5')).toBe('123 MAIN ST');
    });

    it('produces an identical key for the same street written two ways', () => {
        expect(normalizeAddressForMatch('3421 N. First Avenue, Apt 2, USA')).toBe(
            normalizeAddressForMatch('3421 north 1st ave #2'),
        );
    });

    it('keeps a lettered street distinct from its compass-word homonym', () => {
        // 'E St' is the lettered street E (the name IS the letter), not 'East St'. Treating the
        // single letter as a directional here would alert the wrong owner.
        expect(normalizeAddressForMatch('100 E St')).toBe('100 E ST');
        expect(normalizeAddressForMatch('100 East St')).toBe('100 EAST ST');
        expect(normalizeAddressForMatch('100 E St')).not.toBe(normalizeAddressForMatch('100 East St'));
        expect(normalizeAddressForMatch('100 N St')).not.toBe(normalizeAddressForMatch('100 North St'));
    });

    it('still collapses a directional that is a true pre-directional (a name token follows)', () => {
        expect(normalizeAddressForMatch('100 E Main St')).toBe('100 E MAIN ST');
        expect(normalizeAddressForMatch('100 E Main St')).toBe(
            normalizeAddressForMatch('100 East Main St'),
        );
    });

    it('preserves directional POSITION — a pre-directional is not merged with a post-directional', () => {
        expect(normalizeAddressForMatch('100 N Main St')).toBe('100 N MAIN ST');
        expect(normalizeAddressForMatch('100 Main St N')).toBe('100 MAIN ST N');
        expect(normalizeAddressForMatch('100 N Main St')).not.toBe(
            normalizeAddressForMatch('100 Main St N'),
        );
    });

    it('only abbreviates a suffix word in the trailing slot, not mid-name', () => {
        // 'Point' is the suffix when trailing, but stays a name token mid-street (Point Loma).
        expect(normalizeAddressForMatch('100 Sunset Point')).toBe('100 SUNSET PT');
        expect(normalizeAddressForMatch('100 N Point Loma Blvd')).toBe('100 N POINT LOMA BLVD');
    });

    it('keeps a designator word that is part of the street name (value-gated unit strip)', () => {
        // SPACE is followed by a name token (PARK), not a unit value, so it is not stripped.
        expect(normalizeAddressForMatch('100 Space Park Way')).toBe('100 SPACE PARK WAY');
        // But a real unit (designator + value) is still dropped on both sides.
        expect(normalizeAddressForMatch('100 Main St Lot 5')).toBe('100 MAIN ST');
        expect(normalizeAddressForMatch('100 Main St Lot 5')).toBe(
            normalizeAddressForMatch('100 Main St'),
        );
    });
});

// formatAddress shares STREET_TYPE_ABBREVIATIONS with the matcher, so expanding that map for matching
// also changes display output. These lock the trailing-suffix abbreviations the expansion introduced.
describe('formatAddress', () => {
    it('abbreviates the newly-covered trailing suffixes', () => {
        expect(formatAddress('742 Pebble Point')).toBe('742 Pebble Pt');
        expect(formatAddress('15 Hidden Terrace')).toBe('15 Hidden Ter');
        expect(formatAddress('100 Town Square')).toBe('100 Town Sq');
        expect(formatAddress('5 Mountain Trail')).toBe('5 Mountain Trl');
        expect(formatAddress('9 Eagle Crossing')).toBe('9 Eagle Xing');
    });

    it('maps Plz to Plaza, not Place (the plz regression)', () => {
        expect(formatAddress('8 Market Plz')).toBe('8 Market Plaza');
        expect(formatAddress('8 Market Pl')).toBe('8 Market Pl');
    });

    it('leaves existing suffix and street-number behavior unchanged', () => {
        expect(formatAddress('3421 Adams Avenue')).toBe('3421 Adams Ave');
        expect(formatAddress('100 Oak St')).toBe('100 Oak St');
        expect(formatAddress(null)).toBeNull();
    });
});
