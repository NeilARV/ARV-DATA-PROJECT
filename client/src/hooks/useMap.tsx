import {
    createContext,
    useState,
    useMemo,
    useEffect,
    useRef,
    ReactNode,
    useContext,
} from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import type { MapPin, MapExtent, MapBoundsParams, RegionCount } from '@/types/property';
import {
    MAP_ZOOM_COUNTY,
    MAP_ZOOM_SINGLE_PROPERTY,
    MAP_ZOOM_MIN,
    MAP_ZOOM_MAX,
} from '@/constants/map.constants';
import {
    MSA_REGIONS,
    NORMALIZED_COUNTY_TO_MSA,
    type MsaRegion,
} from '@/constants/mapRegions.constants';
import { getZipCodesForCounty } from '@/lib/county';
import { matchesFiltersForPin } from '@/lib/propertyFilters';
import { buildPropertyQueryParams } from '@/lib/propertyQueryParams';
import { useCompanies } from './useCompanies';
import { useFilters } from './useFilters';
import { useView } from './useView';

export type MapContextValue = {
    mapCenter: [number, number] | undefined;
    setMapCenter: React.Dispatch<React.SetStateAction<[number, number] | undefined>>;
    mapZoom: number | undefined;
    setMapZoom: React.Dispatch<React.SetStateAction<number | undefined>>;
    /** Current viewport box; drives which pins are fetched. Set by the map on pan/zoom. */
    mapBounds: MapBoundsParams | undefined;
    setMapBounds: React.Dispatch<React.SetStateAction<MapBoundsParams | undefined>>;
    /** True when a region is selected and detail zoom is unlocked; false shows the overview layer. */
    isRegionLocked: boolean;
    setRegionLocked: React.Dispatch<React.SetStateAction<boolean>>;
};

const MapContext = createContext<MapContextValue | null>(null);

type MapProviderProps = {
    children: ReactNode;
};

export function MapProvider({ children }: MapProviderProps) {
    const [mapCenter, setMapCenter] = useState<[number, number] | undefined>(undefined);
    const [mapZoom, setMapZoom] = useState<number | undefined>(12);
    const [mapBounds, setMapBounds] = useState<MapBoundsParams | undefined>(undefined);
    // Start locked on the default county (San Diego) so the initial view shows its properties.
    const [isRegionLocked, setRegionLocked] = useState(true);

    const value = useMemo<MapContextValue>(
        () => ({
            mapCenter,
            setMapCenter,
            mapZoom,
            setMapZoom,
            mapBounds,
            setMapBounds,
            isRegionLocked,
            setRegionLocked,
        }),
        [mapCenter, mapZoom, mapBounds, isRegionLocked],
    );

    return <MapContext.Provider value={value}>{children}</MapContext.Provider>;
}

/** A supported metro with its current property count, shown as a bubble on the overview layer. */
export type MsaRegionBubble = MsaRegion & { count: number };

export type UseGeoMapOptions = {
    /** When true, fetches viewport pins + extent + region counts (when view === "map"), computes
     * filteredMapPins, drives the camera, and returns the map data + overview state. */
    fetchMapPins?: boolean;
};

export type UseGeoMapResult = MapContextValue & {
    mapPins?: MapPin[];
    filteredMapPins?: MapPin[];
    isLoadingMapPins?: boolean;
    /** Bounding box + count of the full filtered set (independent of the viewport). */
    extent?: MapExtent | null;
    /** Per-MSA count bubbles for the national overview layer (only regions with data). */
    regionBubbles?: MsaRegionBubble[];
    /** True when zoomed out past OVERVIEW_MAX_ZOOM — show region bubbles, skip the pin fetch. */
    isOverview?: boolean;
};

/** Picks a zoom level that frames a set spanning `span` degrees (lat or lng, whichever is larger). */
function zoomForExtent(span: number, count: number): number {
    if (count <= 1) return MAP_ZOOM_SINGLE_PROPERTY;
    const paddedSpan = span * 1.5;
    let zoom: number;
    if (paddedSpan < 0.005) zoom = 17;
    else if (paddedSpan < 0.01) zoom = 16;
    else if (paddedSpan < 0.02) zoom = 15;
    else if (paddedSpan < 0.05) zoom = 14;
    else if (paddedSpan < 0.1) zoom = 13;
    else if (paddedSpan < 0.2) zoom = 12;
    else if (paddedSpan < 0.5) zoom = 11;
    else zoom = MAP_ZOOM_COUNTY;
    return Math.max(MAP_ZOOM_MIN, Math.min(MAP_ZOOM_MAX, zoom));
}

/**
 * Returns map center/zoom/bounds state. When called with `{ fetchMapPins: true }`, also:
 * - Below OVERVIEW_MAX_ZOOM: fetches only per-region counts and returns region bubbles (no pin fetch)
 * - At/above it: fetches viewport pins + the filtered set's extent and re-centers on filter changes
 * - Computes filteredMapPins for the dimensions the pin endpoint doesn't filter (price/beds/type)
 * @returns the map context, plus pins/extent/regions/overview when fetchMapPins is set
 */
export function useGeoMap(options?: UseGeoMapOptions): UseGeoMapResult {
    const ctx = useContext(MapContext);
    if (!ctx) {
        throw new Error('useGeoMap must be used within a MapProvider');
    }

    const { setMapCenter, setMapZoom, mapBounds, isRegionLocked } = ctx;
    const { company, companySelectionInProgressRef } = useCompanies();
    const { filters, sortBy } = useFilters();
    const { view } = useView();

    const fetchMapPins = options?.fetchMapPins === true;
    const isMapView = view === 'map';

    // Overview (national MSA bubbles) is shown until the user selects a region; selecting one locks
    // in detail and unlocks zoom. No pins are fetched in the overview.
    const isOverview = !isRegionLocked;

    // Pin URL — viewport-bounded; only fetches what's currently in view.
    const mapPinsQueryUrl = useMemo(() => {
        if (!fetchMapPins || !mapBounds) return '';
        const queryString = buildPropertyQueryParams(
            filters,
            { forMapPins: true, bounds: mapBounds, page: 1, limit: '10' },
            { company, sortBy },
        );
        return `/api/properties/map${queryString}`;
    }, [
        fetchMapPins,
        mapBounds,
        filters.county,
        filters.statusFilters,
        filters.dateRange,
        filters.zipCode,
        filters.city,
        company?.id,
        company?.companyName,
        filters.companyRole,
    ]);

    // Extent URL — same filters, no viewport; used to frame the map on filter/company change.
    const mapExtentQueryUrl = useMemo(() => {
        if (!fetchMapPins) return '';
        const queryString = buildPropertyQueryParams(
            filters,
            { forMapPins: true, page: 1, limit: '10' },
            { company, sortBy },
        );
        return `/api/properties/map/extent${queryString}`;
    }, [
        fetchMapPins,
        filters.county,
        filters.statusFilters,
        filters.dateRange,
        filters.zipCode,
        filters.city,
        company?.id,
        company?.companyName,
        filters.companyRole,
    ]);

    // Region-counts URL — status + date only (cross-region overview ignores county/company/location).
    const mapRegionsQueryUrl = useMemo(() => {
        if (!fetchMapPins) return '';
        const queryString = buildPropertyQueryParams(
            filters,
            { forRegions: true, page: 1, limit: '10' },
            { company, sortBy },
        );
        return `/api/properties/map/regions${queryString}`;
    }, [fetchMapPins, filters.statusFilters, filters.dateRange, company, sortBy]);

    const { data: mapPins = [], isLoading: isLoadingMapPins } = useQuery<MapPin[]>({
        queryKey: [mapPinsQueryUrl],
        queryFn: async () => {
            const res = await fetch(mapPinsQueryUrl, { credentials: 'include' });
            if (!res.ok) throw new Error(`Failed to fetch map pins: ${res.status}`);
            return res.json();
        },
        // Skip the pin fetch while in the overview — avoids requesting a country-sized box.
        enabled: fetchMapPins && !!mapPinsQueryUrl && isMapView && !isOverview,
        staleTime: 5 * 60 * 1000,
        // Keep the prior viewport's pins on screen while the new box loads — avoids the
        // markers blanking out and re-appearing on every pan/zoom.
        placeholderData: keepPreviousData,
    });

    const { data: extent = null } = useQuery<MapExtent | null>({
        queryKey: [mapExtentQueryUrl],
        queryFn: async () => {
            const res = await fetch(mapExtentQueryUrl, { credentials: 'include' });
            if (!res.ok) throw new Error(`Failed to fetch map extent: ${res.status}`);
            return res.json();
        },
        enabled: fetchMapPins && !!mapExtentQueryUrl && isMapView,
        staleTime: 5 * 60 * 1000,
    });

    const { data: regionCounts = [] } = useQuery<RegionCount[]>({
        queryKey: [mapRegionsQueryUrl],
        queryFn: async () => {
            const res = await fetch(mapRegionsQueryUrl, { credentials: 'include' });
            if (!res.ok) throw new Error(`Failed to fetch region counts: ${res.status}`);
            return res.json();
        },
        enabled: fetchMapPins && !!mapRegionsQueryUrl && isMapView,
        staleTime: 5 * 60 * 1000,
    });

    // Sum per-county counts into one bubble per MSA; only keep regions that currently have data.
    const regionBubbles = useMemo<MsaRegionBubble[]>(() => {
        if (!fetchMapPins) return [];
        const byMsa = new Map<string, number>();
        for (const row of regionCounts) {
            const msa = NORMALIZED_COUNTY_TO_MSA[row.county];
            if (!msa) continue;
            byMsa.set(msa, (byMsa.get(msa) ?? 0) + row.count);
        }
        return MSA_REGIONS.map((region) => ({ ...region, count: byMsa.get(region.msa) ?? 0 })).filter(
            (region) => region.count > 0,
        );
    }, [fetchMapPins, regionCounts]);

    // Zip code list for the client-side location filter.
    const zipCodeList = useMemo(() => {
        if (!fetchMapPins) return [];
        return getZipCodesForCounty(filters.county ?? 'San Diego');
    }, [fetchMapPins, filters.county]);

    // The pin endpoint filters by county/status/company/date/location; price/beds/baths/type are
    // applied here over the viewport pins.
    const filteredMapPins = useMemo(() => {
        if (!fetchMapPins) return [];
        return mapPins.filter((pin) => matchesFiltersForPin(pin, zipCodeList, filters, company));
    }, [fetchMapPins, mapPins, filters, company, zipCodeList]);

    // Read overview state via a ref so the camera effect re-runs only on filter/company change,
    // never on a plain zoom that crosses the threshold.
    const isOverviewRef = useRef(isOverview);
    isOverviewRef.current = isOverview;

    // Only a change in *where* you're looking should recenter — not status/date/price/etc. This key
    // captures the location dimensions (county/city/zip + selected company); read via a ref so the
    // effect still only fires on `extent` change but recenters solely when this key has changed.
    const locationKey = `${filters.county ?? ''}|${filters.city ?? ''}|${filters.zipCode ?? ''}|${
        company?.id ?? company?.companyName ?? ''
    }`;
    const locationKeyRef = useRef(locationKey);
    locationKeyRef.current = locationKey;
    const appliedLocationKeyRef = useRef<string | null>(null);

    // Camera: frame the map to the filtered set's extent, but ONLY when the location changed.
    // Skipped while in the overview so toggling filters there doesn't yank you into a county.
    useEffect(() => {
        if (!fetchMapPins || !isMapView) return;

        // Centering for this filter/company change has resolved; let directory loads resume.
        companySelectionInProgressRef.current = false;

        if (isOverviewRef.current || !extent) return;
        // Status/date/price changes refetch the extent too — don't recenter for those.
        if (locationKeyRef.current === appliedLocationKeyRef.current) return;
        appliedLocationKeyRef.current = locationKeyRef.current;

        const centerLat = (extent.minLat + extent.maxLat) / 2;
        const centerLng = (extent.minLng + extent.maxLng) / 2;
        const span = Math.max(extent.maxLat - extent.minLat, extent.maxLng - extent.minLng);

        setMapCenter([centerLat, centerLng]);
        setMapZoom(zoomForExtent(span, extent.count));
    }, [extent, fetchMapPins, isMapView, setMapCenter, setMapZoom, companySelectionInProgressRef]);

    if (fetchMapPins) {
        return {
            ...ctx,
            mapPins,
            filteredMapPins,
            isLoadingMapPins,
            extent,
            regionBubbles,
            isOverview,
        };
    }
    return ctx;
}
