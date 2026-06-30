import { COUNTY_TO_MSA } from '@shared/constants/countyToMsa';

/** A supported metro shown as a single bubble on the national overview layer. */
export type MsaRegion = {
    /** MSA string as stored in COUNTY_TO_MSA — the key counts are summed under. */
    msa: string;
    /** Primary county set as the filter when the bubble is clicked (also drives the card label). */
    county: string;
    state: string;
    /** Metro center for placing the bubble (city center, not the rural county centroid). */
    center: [number, number];
    /**
     * Pixel offset [x, y] of the card CENTER from the location dot (x→right, y→down). A leader line
     * runs from the dot center to the card center; the opaque card paints over the line, so the
     * visible segment ends where it crosses the card's edge — an edge midpoint for an axis-aligned
     * offset, a CORNER for a diagonal one. Offsets may be diagonal: point each metro's card toward
     * open space so neighbors (LA up-left / San Diego down-right / Riverside right, the FL trio
     * fanned out) diverge and coastal metros point toward water. Omit/[0,0] to render the card on the
     * dot with no leader.
     */
    offset?: [number, number];
};

/** One entry per supported MSA. Centers use the metro city for natural placement. */
export const MSA_REGIONS: MsaRegion[] = [
    {
        msa: 'San Diego-Chula Vista-Carlsbad, CA',
        county: 'San Diego',
        state: 'CA',
        center: [32.7157, -117.1611],
        offset: [62, 52],
    },
    {
        msa: 'Los Angeles-Long Beach-Anaheim, CA',
        county: 'Los Angeles',
        state: 'CA',
        center: [34.0522, -118.2437],
        offset: [-82, -50],
    },
    {
        msa: 'Riverside-San Bernardino-Ontario, CA',
        county: 'Riverside',
        state: 'CA',
        center: [33.9806, -117.3755],
        offset: [92, 0],
    },
    {
        msa: 'San Francisco-Oakland-Fremont, CA',
        county: 'San Francisco',
        state: 'CA',
        center: [37.7749, -122.4194],
        offset: [-90, 0],
    },
    {
        msa: 'Denver-Aurora-Centennial, CO',
        county: 'Denver',
        state: 'CO',
        center: [39.7392, -104.9903],
        offset: [0, 56],
    },
    {
        msa: 'Seattle-Tacoma-Bellevue, WA',
        county: 'King',
        state: 'WA',
        center: [47.6062, -122.3321],
        offset: [-90, 0],
    },
    {
        msa: 'Miami-Fort Lauderdale-West Palm Beach, FL',
        county: 'Miami-Dade',
        state: 'FL',
        center: [25.7617, -80.1918],
        offset: [96, 0],
    },
    {
        msa: 'Tampa-St. Petersburg-Clearwater, FL',
        county: 'Hillsborough',
        state: 'FL',
        center: [27.9506, -82.4572],
        offset: [-90, 0],
    },
    {
        msa: 'Port St. Lucie, FL',
        county: 'St. Lucie',
        state: 'FL',
        center: [27.273, -80.3582],
        offset: [0, -56],
    },
];

/** county (lower-cased + trimmed) → MSA string, for summing per-county counts into MSA buckets. */
export const NORMALIZED_COUNTY_TO_MSA: Record<string, string> = Object.fromEntries(
    Object.entries(COUNTY_TO_MSA).map(([county, msa]) => [county.toLowerCase().trim(), msa]),
);
