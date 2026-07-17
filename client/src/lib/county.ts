import {
    COUNTIES,
    SAN_DIEGO_MSA_ZIP_CODES,
    LOS_ANGELES_MSA_ZIP_CODES,
    RIVERSIDE_MSA_ZIP_CODES,
    DENVER_MSA_ZIP_CODES,
    SAN_FRANCISCO_MSA_ZIP_CODES,
    MIAMI_MSA_ZIP_CODES,
    PORT_ST_LUCIE_MSA_ZIP_CODES,
    SEATTLE_MSA_ZIP_CODES,
    TAMPA_MSA_ZIP_CODES,
} from '@/constants/filters.constants';
import { MSA_REGIONS } from '@/constants/mapRegions.constants';
import type { MsaCountySelection } from '@/types/filters';
export { getMsaNameFromCounty } from '@shared/constants/countyToMsa';

/**
 * Returns the primary city name from a full MSA string
 * (e.g. "San Diego-Chula Vista-Carlsbad, CA" → "San Diego").
 */
export function msaShortName(msa: string): string {
    return msa.split('-')[0].split(',')[0].trim();
}

/** Default map center when county is not found (San Diego coordinates). */
const DEFAULT_MAP_CENTER: [number, number] = [32.7157, -117.1611];

/**
 * Returns the center coordinates for a county from the COUNTIES array.
 */
export function getCountyCenter(countyName: string): [number, number] | undefined {
    const county = COUNTIES.find((c) => c.county === countyName);
    return county?.center as [number, number] | undefined;
}

/**
 * Returns the state code for a county from the COUNTIES array.
 */
export function getStateFromCounty(countyName: string): string {
    const county = COUNTIES.find((c) => c.county === countyName);
    return county?.state ?? 'CA';
}

/**
 * Converts county name to object key format (e.g. "San Diego" -> "san_diego",
 * "Miami-Dade" -> "miami_dade", "St. Lucie" -> "st_lucie").
 */
export function countyNameToKey(countyName: string): string {
    return countyName.toLowerCase().replace(/\./g, '').replace(/\s+/g, '_').replace(/-/g, '_');
}

/**
 * Returns the default map center (San Diego), or fallback coordinates if not found.
 */
export function getDefaultMapCenter(): [number, number] {
    return getCountyCenter('San Diego') ?? DEFAULT_MAP_CENTER;
}

/** Map center for a selection: first selected county's center, else the MSA's metro center, else the default. */
export function getSelectionMapCenter(selection: MsaCountySelection): [number, number] {
    const firstCounty = selection.counties[0];
    const countyCenter = firstCounty ? getCountyCenter(firstCounty) : undefined;
    if (countyCenter) return countyCenter;
    return MSA_REGIONS.find((r) => r.msa === selection.msa)?.center ?? getDefaultMapCenter();
}

/** Zip codes across several counties, deduped by zip (order follows the county list). */
export function getZipCodesForCounties(counties: string[]): { zip: string; city: string }[] {
    const seen = new Set<string>();
    const result: { zip: string; city: string }[] = [];
    for (const county of counties) {
        for (const entry of getZipCodesForCounty(county)) {
            if (seen.has(entry.zip)) continue;
            seen.add(entry.zip);
            result.push(entry);
        }
    }
    return result;
}

/**
 * Returns the zip code list for a given county, keyed by the MSA zip code maps.
 * Used by FilterHeader and useMap to derive available zip codes for filtering.
 */
export function getZipCodesForCounty(countyName: string): { zip: string; city: string }[] {
    const state = getStateFromCounty(countyName);
    const countyKey = countyNameToKey(countyName);

    let msaZipCodes: Record<string, Array<{ zip: string; city: string }>>;
    if (state === 'CA') {
        msaZipCodes =
            countyName === 'Los Angeles' || countyName === 'Orange'
                ? LOS_ANGELES_MSA_ZIP_CODES
                : countyName === 'Riverside' || countyName === 'San Bernardino'
                  ? RIVERSIDE_MSA_ZIP_CODES
                  : countyName === 'San Francisco' ||
                      countyName === 'Alameda' ||
                      countyName === 'Contra Costa' ||
                      countyName === 'Marin' ||
                      countyName === 'San Mateo'
                    ? SAN_FRANCISCO_MSA_ZIP_CODES
                    : SAN_DIEGO_MSA_ZIP_CODES;
    } else if (state === 'CO') {
        msaZipCodes = DENVER_MSA_ZIP_CODES;
    } else if (state === 'FL') {
        msaZipCodes =
            countyName === 'St. Lucie' || countyName === 'Martin'
                ? PORT_ST_LUCIE_MSA_ZIP_CODES
                : countyName === 'Hillsborough' ||
                    countyName === 'Pinellas' ||
                    countyName === 'Pasco' ||
                    countyName === 'Hernando'
                  ? TAMPA_MSA_ZIP_CODES
                  : MIAMI_MSA_ZIP_CODES;
    } else if (state === 'WA') {
        msaZipCodes = SEATTLE_MSA_ZIP_CODES;
    } else {
        msaZipCodes = SAN_DIEGO_MSA_ZIP_CODES;
    }

    const list = msaZipCodes[countyKey] ?? [];
    return Array.isArray(list) ? list : [];
}
