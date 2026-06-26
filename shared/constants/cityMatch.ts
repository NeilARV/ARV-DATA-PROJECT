/**
 * Cities whose names span many variants in the data (district/neighborhood suffixes), so city
 * filters match by prefix rather than exact equality. Single source of truth shared by the client
 * pin filter (`cityMatchesFilter`) and the server map query (`buildMapIdConditions`) so the two
 * can't drift when a new multi-name metro is added. Compared case-insensitively.
 */
export const PREFIX_MATCH_CITIES = ['San Diego', 'Los Angeles'] as const;

/** True when a city filter value should match data by prefix instead of exact equality. */
export function isPrefixMatchCity(city: string): boolean {
    const normalized = city.trim().toLowerCase();
    return PREFIX_MATCH_CITIES.some((c) => c.toLowerCase() === normalized);
}
