/** Map zoom level constants for consistent behavior across the app. */

export const MAP_ZOOM_MIN = 8;
export const MAP_ZOOM_MAX = 18;

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
