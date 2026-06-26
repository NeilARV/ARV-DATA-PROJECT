import { COUNTY_TO_MSA } from '@shared/constants/countyToMsa';

/** A supported metro shown as a single bubble on the national overview layer. */
export type MsaRegion = {
    /** MSA string as stored in COUNTY_TO_MSA — the key counts are summed under. */
    msa: string;
    /** Display name shown on hover. */
    label: string;
    /** Primary county set as the filter when the bubble is clicked. */
    county: string;
    state: string;
    /** Metro center for placing the bubble (city center, not the rural county centroid). */
    center: [number, number];
    /**
     * Pixel offset [x, y] of the count bubble from the center dot (x→right, y→down). A leader line
     * connects the dot to the offset bubble so crowded metros separate; coastal metros point toward
     * the water. Omit/[0,0] to render the bubble on the center with no leader.
     */
    offset?: [number, number];
};

/** One entry per supported MSA. Centers use the metro city for natural placement. */
export const MSA_REGIONS: MsaRegion[] = [
    { msa: 'San Diego-Chula Vista-Carlsbad, CA', label: 'San Diego', county: 'San Diego', state: 'CA', center: [32.7157, -117.1611], offset: [0, 52] },
    { msa: 'Los Angeles-Long Beach-Anaheim, CA', label: 'Los Angeles', county: 'Los Angeles', state: 'CA', center: [34.0522, -118.2437], offset: [-58, -8] },
    { msa: 'Riverside-San Bernardino-Ontario, CA', label: 'Riverside', county: 'Riverside', state: 'CA', center: [33.9806, -117.3755], offset: [58, 0] },
    { msa: 'San Francisco-Oakland-Fremont, CA', label: 'San Francisco', county: 'San Francisco', state: 'CA', center: [37.7749, -122.4194], offset: [-52, 0] },
    { msa: 'Denver-Aurora-Centennial, CO', label: 'Denver', county: 'Denver', state: 'CO', center: [39.7392, -104.9903] },
    { msa: 'Seattle-Tacoma-Bellevue, WA', label: 'Seattle', county: 'King', state: 'WA', center: [47.6062, -122.3321], offset: [-50, 0] },
    { msa: 'Miami-Fort Lauderdale-West Palm Beach, FL', label: 'Miami', county: 'Miami-Dade', state: 'FL', center: [25.7617, -80.1918], offset: [58, 14] },
    { msa: 'Tampa-St. Petersburg-Clearwater, FL', label: 'Tampa', county: 'Hillsborough', state: 'FL', center: [27.9506, -82.4572], offset: [-58, 0] },
    { msa: 'Port St. Lucie, FL', label: 'Port St. Lucie', county: 'St. Lucie', state: 'FL', center: [27.273, -80.3582], offset: [60, -16] },
];

/** county (lower-cased + trimmed) → MSA string, for summing per-county counts into MSA buckets. */
export const NORMALIZED_COUNTY_TO_MSA: Record<string, string> = Object.fromEntries(
    Object.entries(COUNTY_TO_MSA).map(([county, msa]) => [county.toLowerCase().trim(), msa]),
);
