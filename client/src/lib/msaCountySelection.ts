import {
    filterCountiesToMsa,
    getCountiesForMsa,
    getMsaForCounty,
} from '@shared/constants/countyToMsa';
import type { MsaCountySelection } from '@/types/filters';

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

/** Writes the selection onto URL params, replacing any legacy `county` param. */
export function writeMsaCountyParams(params: URLSearchParams, selection: MsaCountySelection): void {
    params.set('msa', selection.msa);
    params.set('counties', selection.counties.join(','));
    params.delete('county');
}

/** Whether two selections cover the same MSA and county set (order-insensitive). */
export function isSameSelection(a: MsaCountySelection, b: MsaCountySelection): boolean {
    if (a.msa !== b.msa || a.counties.length !== b.counties.length) return false;
    const bSet = new Set(b.counties);
    return a.counties.every((county) => bSet.has(county));
}
