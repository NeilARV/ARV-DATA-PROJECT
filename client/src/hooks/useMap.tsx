import { createContext, useState, useMemo, useEffect, ReactNode, useContext } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import type { MapPin, MapExtent, MapBoundsParams } from '@/types/property';
import {
    MAP_ZOOM_COUNTY,
    MAP_ZOOM_SINGLE_PROPERTY,
    MAP_ZOOM_MIN,
    MAP_ZOOM_MAX,
} from '@/constants/map.constants';
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
};

const MapContext = createContext<MapContextValue | null>(null);

type MapProviderProps = {
    children: ReactNode;
};

export function MapProvider({ children }: MapProviderProps) {
    const [mapCenter, setMapCenter] = useState<[number, number] | undefined>(undefined);
    const [mapZoom, setMapZoom] = useState<number | undefined>(12);
    const [mapBounds, setMapBounds] = useState<MapBoundsParams | undefined>(undefined);

    const value = useMemo<MapContextValue>(
        () => ({
            mapCenter,
            setMapCenter,
            mapZoom,
            setMapZoom,
            mapBounds,
            setMapBounds,
        }),
        [mapCenter, mapZoom, mapBounds],
    );

    return <MapContext.Provider value={value}>{children}</MapContext.Provider>;
}

export type UseGeoMapOptions = {
    /** When true, fetches viewport pins + extent (when view === "map"), computes filteredMapPins,
     * drives the camera from the extent, and returns mapPins, filteredMapPins, extent, loading. */
    fetchMapPins?: boolean;
};

export type UseGeoMapResult = MapContextValue & {
    mapPins?: MapPin[];
    filteredMapPins?: MapPin[];
    isLoadingMapPins?: boolean;
    /** Bounding box + count of the full filtered set (independent of the viewport). */
    extent?: MapExtent | null;
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
 * - Fetches map pins for the current viewport box (when view === "map")
 * - Fetches the filtered set's extent and re-centers the map when filters/company change
 * - Computes filteredMapPins for the dimensions the pin endpoint doesn't filter (price/beds/type/location)
 * @returns the map context, plus pins/extent/loading when fetchMapPins is set
 */
export function useGeoMap(options?: UseGeoMapOptions): UseGeoMapResult {
    const ctx = useContext(MapContext);
    if (!ctx) {
        throw new Error('useGeoMap must be used within a MapProvider');
    }

    const { setMapCenter, setMapZoom, mapBounds } = ctx;
    const { company, companySelectionInProgressRef } = useCompanies();
    const { filters, sortBy } = useFilters();
    const { view } = useView();

    const fetchMapPins = options?.fetchMapPins === true;
    const isMapView = view === 'map';

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

    const { data: mapPins = [], isLoading: isLoadingMapPins } = useQuery<MapPin[]>({
        queryKey: [mapPinsQueryUrl],
        queryFn: async () => {
            const res = await fetch(mapPinsQueryUrl, { credentials: 'include' });
            if (!res.ok) throw new Error(`Failed to fetch map pins: ${res.status}`);
            return res.json();
        },
        enabled: fetchMapPins && !!mapPinsQueryUrl && isMapView,
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

    // Zip code list for the client-side location filter.
    const zipCodeList = useMemo(() => {
        if (!fetchMapPins) return [];
        return getZipCodesForCounty(filters.county ?? 'San Diego');
    }, [fetchMapPins, filters.county]);

    // The pin endpoint filters by county/status/company/date; price/beds/baths/type/location are
    // applied here over the viewport pins.
    const filteredMapPins = useMemo(() => {
        if (!fetchMapPins) return [];
        return mapPins.filter((pin) => matchesFiltersForPin(pin, zipCodeList, filters, company));
    }, [fetchMapPins, mapPins, filters, company, zipCodeList]);

    // Camera: frame the map to the filtered set's extent whenever it changes (filters/company).
    // Replaces the old zippopotam geocoding + client-side average-pin centering.
    useEffect(() => {
        if (!fetchMapPins || !isMapView) return;

        // Centering for this filter/company change has resolved; let directory loads resume.
        companySelectionInProgressRef.current = false;

        if (!extent) return;

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
        };
    }
    return ctx;
}
