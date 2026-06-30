/** Map zoom level constants for consistent behavior across the app. */

/** Clamp floor for the extent-fit zoom calculation (how far in `zoomForExtent` may go). */
export const MAP_ZOOM_MIN = 8;
export const MAP_ZOOM_MAX = 18;

/**
 * Below this zoom the map shows the national overview layer (one bubble per MSA) instead of fetching
 * viewport pins — so we never request a country-sized box. At/above it, viewport pins + clusters show.
 */
export const OVERVIEW_MAX_ZOOM = 8;

/**
 * Hard floor on how far the user can zoom *out* (Leaflet `minZoom`) — keeps the widest view to
 * roughly the US + Mexico rather than whole continents. Distinct from `MAP_ZOOM_MIN`, which only
 * clamps the computed extent-fit zoom.
 */
export const MAP_ZOOM_FLOOR = 4;

/** Zoom at/above which marker clustering is disabled and every pin renders individually. */
export const MAP_DECLUSTER_ZOOM = 13;

/** Default zoom when no specific location is selected (e.g. geolocation, fallback). */
export const MAP_ZOOM_DEFAULT = 12;

/** Zoom for county-level view (wider). */
export const MAP_ZOOM_COUNTY = 10;

/** Zoom for city-level view. */
export const MAP_ZOOM_CITY = 12;

/** Zoom for zip-code-level view (closer). */
export const MAP_ZOOM_ZIP = 13;

/** Zoom when resetting via logo click. */
export const MAP_ZOOM_LOGO = 14;

/** Zoom when centering on a single property. */
export const MAP_ZOOM_PROPERTY = 16;

/** Zoom for a single property in company selection. */
export const MAP_ZOOM_SINGLE_PROPERTY = 15;
