import { COUNTIES } from "@/constants/filters.constants";

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
  return county?.state ?? "CA";
}

/**
 * Converts county name to object key format (e.g. "San Diego" -> "san_diego").
 */
export function countyNameToKey(countyName: string): string {
  return countyName.toLowerCase().replace(/\s+/g, "_");
}

/**
 * Returns the default map center (San Diego), or fallback coordinates if not found.
 */
export function getDefaultMapCenter(): [number, number] {
  return getCountyCenter("San Diego") ?? DEFAULT_MAP_CENTER;
}
