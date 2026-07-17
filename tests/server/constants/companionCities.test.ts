import { describe, it, expect } from 'vitest';
import {
    COMPANION_CITY_MSA,
    getCompanionMsaName,
} from 'server/constants/companionCities.constants';
import { COUNTY_TO_MSA } from '@shared/constants/countyToMsa';

const SD_MSA = 'San Diego-Chula Vista-Carlsbad, CA';

describe('getCompanionMsaName', () => {
    it.each(Object.keys(COMPANION_CITY_MSA))('maps the raw key %j to its MSA', (key) => {
        const [city, state] = key.split('|');
        expect(getCompanionMsaName(city, state)).toBe(COMPANION_CITY_MSA[key]);
    });

    it('normalizes casing and whitespace before matching', () => {
        expect(getCompanionMsaName('  Temecula ', 'CA')).toBe(SD_MSA);
        expect(getCompanionMsaName('MURRIETA', 'Ca')).toBe(SD_MSA);
    });

    it.each([
        ['San Diego', 'CA'],
        ['Temecula', 'FL'],
        ['', 'CA'],
    ])('returns null for the non-companion city %j, %j', (city, state) => {
        expect(getCompanionMsaName(city, state)).toBeNull();
    });

    it('returns null when city or state is missing', () => {
        expect(getCompanionMsaName(null, 'CA')).toBeNull();
        expect(getCompanionMsaName('Temecula', undefined)).toBeNull();
    });
});

describe('COMPANION_CITY_MSA', () => {
    it('every companion MSA is a tracked MSA (has counties in COUNTY_TO_MSA)', () => {
        const trackedMsas = new Set(Object.values(COUNTY_TO_MSA));
        for (const msaName of Object.values(COMPANION_CITY_MSA)) {
            expect(trackedMsas).toContain(msaName);
        }
    });
});
