import { useEffect, useRef } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { OVERVIEW_MAX_ZOOM, MAP_ZOOM_MAX } from '@/constants/map.constants';
import type { MapBoundsParams } from '@/types/property';

/**
 * Reads the viewport as bounds params, padded by 30% (so a margin around the view is fetched) and
 * rounded (so small pans/zooms produce the same box → no needless refetch).
 */
function toBoundsParams(map: L.Map): MapBoundsParams {
    const b = map.getBounds().pad(0.3);
    const round = (n: number) => Math.round(n * 1000) / 1000;
    return {
        south: round(b.getSouth()),
        west: round(b.getWest()),
        north: round(b.getNorth()),
        east: round(b.getEast()),
    };
}

type ViewportWatcherProps = { onBoundsChange: (bounds: MapBoundsParams) => void };

/**
 * Reports the viewport box (debounced) on mount and on pan/zoom, so only the pins in view are
 * fetched.
 */
export function ViewportWatcher({ onBoundsChange }: ViewportWatcherProps) {
    const map = useMap();
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        onBoundsChange(toBoundsParams(map));
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [map, onBoundsChange]);

    useMapEvents({
        moveend: () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => onBoundsChange(toBoundsParams(map)), 300);
        },
    });

    return null;
}

type ZoomLockControllerProps = { locked: boolean; onUnlock: () => void };

/**
 * Enforces the overview gate: while no region is selected, caps zoom-in at the overview breakpoint
 * so the user must pick a region to go deeper. When a region is locked, zoom is unlocked. Zooming
 * back out past the breakpoint releases the lock (back to the overview).
 */
export function ZoomLockController({ locked, onUnlock }: ZoomLockControllerProps) {
    const map = useMap();

    useEffect(() => {
        map.setMaxZoom(locked ? MAP_ZOOM_MAX : OVERVIEW_MAX_ZOOM - 1);
    }, [locked, map]);

    useMapEvents({
        zoomend: () => {
            if (locked && map.getZoom() < OVERVIEW_MAX_ZOOM) onUnlock();
        },
    });

    return null;
}

type CameraControllerProps = { center?: [number, number]; zoom?: number };

/** Applies imperative center/zoom changes (from filters/company or external callers) via setView. */
export function CameraController({ center, zoom }: CameraControllerProps) {
    const map = useMap();
    const previousRef = useRef<{ center?: [number, number]; zoom?: number }>({});

    useEffect(() => {
        if (!center || zoom == null) return;
        const previous = previousRef.current;
        const changed =
            !previous.center ||
            previous.center[0] !== center[0] ||
            previous.center[1] !== center[1] ||
            previous.zoom !== zoom;
        if (!changed) return;

        previousRef.current = { center, zoom };
        // A region click flips the zoom lock and moves the camera in the same commit. Raise maxZoom
        // to at least the target here so the move can't be clamped by a stale (lower) max — this
        // removes the dependency on ZoomLockController's effect happening to run first.
        if (zoom > map.getMaxZoom()) map.setMaxZoom(zoom);
        map.setView(center, zoom);
    }, [center, zoom, map]);

    return null;
}

/** Keeps Leaflet's internal size in sync with the container (flex/resize/tab changes). */
export function MapResizeHandler() {
    const map = useMap();

    useEffect(() => {
        setTimeout(() => map.invalidateSize(), 0);

        const handleResize = () => map.invalidateSize();
        window.addEventListener('resize', handleResize);

        const container = map.getContainer();
        const resizeObserver = new ResizeObserver(() => map.invalidateSize());
        if (container) resizeObserver.observe(container);

        return () => {
            window.removeEventListener('resize', handleResize);
            resizeObserver.disconnect();
        };
    }, [map]);

    return null;
}
