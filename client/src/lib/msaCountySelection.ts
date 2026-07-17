import {
    filterCountiesToMsa,
    getCountiesForMsa,
    getMsaForCounty,
} from '@shared/constants/countyToMsa';
import type { MsaCountySelection } from '@/types/filters';
import type { CountySubscription } from '@shared/types/users';

/** Today's default view: San Diego county in its (1:1) MSA. */
export const DEFAULT_MSA_COUNTY_SELECTION: MsaCountySelection = {
    msa: 'San Diego-Chula Vista-Carlsbad, CA',
    counties: ['San Diego'],
};

/** Selection anchored on a user's home county (its MSA + that county), or the default when untracked. */
export function selectionFromCounty(county: string | null | undefined): MsaCountySelection {
    const msa = county ? getMsaForCounty(county) : null;
    if (!county || !msa) return { ...DEFAULT_MSA_COUNTY_SELECTION };
    return { msa, counties: [county] };
}

/**
 * First-load default for a user: the home county's MSA with their subscribed counties in that
 * MSA pre-selected, falling back to the home county alone when none are subscribed there.
 */
export function defaultSelectionForUser(
    county: string | null | undefined,
    countySubscriptions: readonly Pick<CountySubscription, 'county'>[] | undefined,
): MsaCountySelection {
    const home = selectionFromCounty(county);
    const subscribed = filterCountiesToMsa(
        home.msa,
        (countySubscriptions ?? []).map((sub) => sub.county),
    );
    return subscribed.length > 0 ? { msa: home.msa, counties: subscribed } : home;
}

/**
 * Reads the geo selection from URL params: `?msa=&counties=` (counties empty = none selected,
 * absent = the whole MSA), falling back to a legacy `?county=` param.
 * @returns null when no geo params are present or nothing tracked survives parsing
 */
export function parseMsaCountyParams(params: URLSearchParams): MsaCountySelection | null {
    const msa = params.get('msa');
    if (msa) {
        if (getCountiesForMsa(msa).length === 0) return null;
        const countiesParam = params.get('counties');
        if (countiesParam === null) return { msa, counties: getCountiesForMsa(msa) };
        return { msa, counties: filterCountiesToMsa(msa, countiesParam.split(',')) };
    }

    const legacyCounty = params.get('county');
    if (legacyCounty) {
        const legacyMsa = getMsaForCounty(legacyCounty);
        return legacyMsa ? { msa: legacyMsa, counties: [legacyCounty] } : null;
    }
    return null;
}

/**
 * Reads the geo selection from the legacy Deals filter params (`?filterType=&filterValue=`):
 * a county filter maps to that county within its MSA, an msa filter to the whole MSA.
 * @returns null for city/zip filters (no county equivalent) or anything untracked
 */
export function parseLegacyDealsFilterParams(params: URLSearchParams): MsaCountySelection | null {
    const type = params.get('filterType');
    const value = params.get('filterValue');
    if (!type || !value) return null;
    if (type === 'county') {
        const msa = getMsaForCounty(value);
        return msa ? { msa, counties: [value] } : null;
    }
    if (type === 'msa' && getCountiesForMsa(value).length > 0) {
        return { msa: value, counties: getCountiesForMsa(value) };
    }
    return null;
}

/** Writes the selection onto URL params, replacing any legacy geo params (Data and Deals). */
export function writeMsaCountyParams(params: URLSearchParams, selection: MsaCountySelection): void {
    params.set('msa', selection.msa);
    params.set('counties', selection.counties.join(','));
    params.delete('county');
    params.delete('filterType');
    params.delete('filterValue');
    params.delete('filterState');
}

/** Whether two selections cover the same MSA and county set (order-insensitive). */
export function isSameSelection(a: MsaCountySelection, b: MsaCountySelection): boolean {
    if (a.msa !== b.msa || a.counties.length !== b.counties.length) return false;
    const bSet = new Set(b.counties);
    return a.counties.every((county) => bSet.has(county));
}
