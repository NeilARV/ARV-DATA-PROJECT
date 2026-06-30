/**
 * Metros whose city name spans many variants in the data (e.g. "San Diego", "San Diego Country
 * Estates"; "Los Angeles", "Los Angeles County") and so must be matched by **prefix** rather than
 * exact equality. Single source of truth shared by the client (cityMatchesFilter) and the server
 * (map pin / extent / region filters) so the two never disagree. Values are lower-cased.
 */
export const PREFIX_MATCH_CITIES: readonly string[] = ['san diego', 'los angeles'];

/**
 * Whether a city filter value should match by prefix (case-insensitive).
 * @param city a city name in any casing (e.g. "San Diego" or "san diego")
 * @returns true when the city is one of PREFIX_MATCH_CITIES
 */
export function isPrefixMatchCity(city: string): boolean {
    return PREFIX_MATCH_CITIES.includes(city.trim().toLowerCase());
}
