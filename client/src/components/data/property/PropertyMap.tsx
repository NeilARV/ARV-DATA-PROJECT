import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import MarkerClusterGroup from 'react-leaflet-cluster';
import { X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MapLegend } from '@/components/data/property/MapLegend';
import { useFilters } from '@/hooks/useFilters';
import { useCompanies } from '@/hooks/useCompanies';
import { useGeoMap } from '@/hooks/useMap';
import { useProperty } from '@/hooks/useProperty';
import { getCountyCenter, getDefaultMapCenter } from '@/lib/county';
import { MAP_ZOOM_COUNTY } from '@/constants/map.constants';
import { PIN_COLORS } from '@/constants/mapPins.constants';
import { formatCompanyName } from '@shared/utils/formatCompanyName';
import type { MapPin, MapBoundsParams } from '@/types/property';

const createColoredIcon = (color: string) => {
    const svgIcon = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="25" height="41">
      <path fill="${color}" stroke="#333" stroke-width="1" d="M12 0C5.4 0 0 5.4 0 12c0 7.2 12 24 12 24s12-16.8 12-24c0-6.6-5.4-12-12-12z"/>
      <circle fill="#fff" cx="12" cy="12" r="5"/>
    </svg>
  `;
    return new L.Icon({
        iconUrl: `data:image/svg+xml;base64,${btoa(svgIcon)}`,
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        tooltipAnchor: [0, -41],
    });
};

const inRenovationIcon = createColoredIcon(PIN_COLORS.inRenovation);
const onMarketIcon = createColoredIcon(PIN_COLORS.onMarket);
const soldIcon = createColoredIcon(PIN_COLORS.sold);
const wholesaleIcon = createColoredIcon(PIN_COLORS.wholesale);
const selectedIcon = createColoredIcon(PIN_COLORS.selected);

const STATUS_LABELS: Record<string, string> = {
    'in-renovation': 'In Renovation',
    'on-market': 'On Market',
    sold: 'Sold',
    wholesale: 'Wholesale',
};

/** Friendly label for a pin status (falls back to the raw value). */
function statusLabel(status: string | null): string {
    const key = (status ?? '').toLowerCase().trim();
    return STATUS_LABELS[key] ?? (status || 'Unknown');
}

const getIconForPin = (
    pin: MapPin,
    isSelected: boolean,
    selectedCompanyId: string | null | undefined,
    statusFilters: string[],
) => {
    if (isSelected) return selectedIcon;

    const status = (pin.status || '').toLowerCase().trim();
    const bid = pin.buyerId ?? null;
    const sid = pin.sellerId ?? null;
    const wholesaleFilterActive = statusFilters
        .map((f) => f.toLowerCase().trim())
        .includes('wholesale');

    // When a company is selected, icon reflects the company's role (buyer vs seller)
    if (selectedCompanyId) {
        if (status === 'wholesale') {
            // Company is buyer of wholesale → always blue (they own it, it's their renovation)
            if (bid === selectedCompanyId) return inRenovationIcon;
            // Company is seller of wholesale → always purple (sold to another company)
            if (sid === selectedCompanyId) return wholesaleIcon;
        }
        // Non-wholesale statuses keep their standard colors
        if (bid === selectedCompanyId || sid === selectedCompanyId) {
            if (status === 'sold') return soldIcon;
            if (status === 'on-market') return onMarketIcon;
            return inRenovationIcon; // in-renovation or default
        }
    }

    // No company selected - status-based colors
    switch (status) {
        case 'on-market':
            return onMarketIcon;
        case 'sold':
            return soldIcon;
        case 'wholesale':
            // If wholesale filter is explicitly active → purple (distinguished)
            // If showing via in-renovation → blue (blends in)
            return wholesaleFilterActive ? wholesaleIcon : inRenovationIcon;
        case 'in-renovation':
        default:
            return inRenovationIcon;
    }
};

type ClusterLike = {
    getChildCount: () => number;
    getAllChildMarkers: () => { options: L.MarkerOptions }[];
};

// Resolved-icon → color, so cluster donuts use the exact color each pin renders (this respects the
// wholesale-blend and company-role rules in getIconForPin — e.g. a wholesale pin counts as blue
// when the wholesale filter isn't active).
const ICON_COLORS = new Map<L.Icon | L.DivIcon, string>([
    [inRenovationIcon, PIN_COLORS.inRenovation],
    [onMarketIcon, PIN_COLORS.onMarket],
    [soldIcon, PIN_COLORS.sold],
    [wholesaleIcon, PIN_COLORS.wholesale],
    [selectedIcon, PIN_COLORS.selected],
]);

/** Color for a marker's resolved icon (defaults to in-renovation). */
function iconColor(icon: L.Icon | L.DivIcon | undefined): string {
    return (icon && ICON_COLORS.get(icon)) || PIN_COLORS.inRenovation;
}

/**
 * Builds a cluster marker that conveys the status mix of the pins inside it: a conic-gradient donut
 * colored by the legend colors, with the pin count in the center. Theme-aware via CSS variables.
 */
function createClusterIcon(cluster: ClusterLike): L.DivIcon {
    const count = cluster.getChildCount();

    const tally = new Map<string, number>();
    for (const marker of cluster.getAllChildMarkers()) {
        const color = iconColor(marker.options.icon);
        tally.set(color, (tally.get(color) ?? 0) + 1);
    }

    let accumulated = 0;
    const segments: string[] = [];
    tally.forEach((n, color) => {
        const start = (accumulated / count) * 100;
        accumulated += n;
        const end = (accumulated / count) * 100;
        segments.push(`${color} ${start}% ${end}%`);
    });
    const background =
        segments.length > 0 ? `conic-gradient(${segments.join(', ')})` : PIN_COLORS.inRenovation;

    const size = count < 10 ? 36 : count < 100 ? 44 : 52;
    const inner = size - 12;
    const wrapperStyle = `display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:9999px;background:${background};box-shadow:0 0 0 2px hsl(var(--background));`;
    const innerStyle = `display:flex;align-items:center;justify-content:center;width:${inner}px;height:${inner}px;border-radius:9999px;background:hsl(var(--background));color:hsl(var(--foreground));font-family:var(--font-sans);font-size:12px;font-weight:600;`;

    return L.divIcon({
        html: `<div style="${wrapperStyle}"><div style="${innerStyle}">${count}</div></div>`,
        className: '',
        iconSize: [size, size],
    });
}

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

/**
 * Reports the viewport box to the parent on mount and on (debounced) pan/zoom, so only the pins in
 * view are fetched.
 */
function ViewportWatcher({ onBoundsChange }: { onBoundsChange: (bounds: MapBoundsParams) => void }) {
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

/** Applies imperative center/zoom changes (from filters/company or external callers) via setView. */
function CameraController({ center, zoom }: { center?: [number, number]; zoom?: number }) {
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
        if (changed) {
            previousRef.current = { center, zoom };
            map.setView(center, zoom);
        }
    }, [center, zoom, map]);

    return null;
}

/** Keeps Leaflet's internal size in sync with the container (flex/resize/tab changes). */
function MapResizeHandler() {
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

type RenderPin = { pin: MapPin; position: [number, number] };

/**
 * Interactive property map: clustered, viewport-fetched pins over theme-aware CARTO basemaps, with a
 * color legend, hover tooltips, and loading/empty states.
 */
export default function PropertyMap() {
    const { filters, clearFilters, hasActiveFilters } = useFilters();
    const { fetchProperty, property } = useProperty();
    const { company, setCompany } = useCompanies();
    const {
        filteredMapPins = [],
        isLoadingMapPins = false,
        extent,
        mapCenter,
        mapZoom,
        setMapBounds,
    } = useGeoMap({ fetchMapPins: true });

    // Theme-aware basemap: track the `dark` class on <html> so tiles match the app theme.
    const [isDark, setIsDark] = useState(() =>
        document.documentElement.classList.contains('dark'),
    );
    useEffect(() => {
        const el = document.documentElement;
        const observer = new MutationObserver(() => setIsDark(el.classList.contains('dark')));
        observer.observe(el, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    const renderPins = useMemo<RenderPin[]>(() => {
        return filteredMapPins
            .map((pin): RenderPin | null => {
                const { latitude, longitude } = pin;
                if (latitude == null || longitude == null || isNaN(latitude) || isNaN(longitude)) {
                    return null;
                }
                return { pin, position: [latitude, longitude] };
            })
            .filter((entry): entry is RenderPin => entry !== null);
    }, [filteredMapPins]);

    // MapContainer reads center/zoom once at mount; CameraController drives changes after that.
    const initialCenter =
        mapCenter ?? getCountyCenter(filters.county ?? 'San Diego') ?? getDefaultMapCenter();
    const initialZoom = mapZoom ?? MAP_ZOOM_COUNTY;

    const tileUrl = isDark
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

    const hasAnyMatches = (extent?.count ?? 0) > 0;
    const showEmptyState = !isLoadingMapPins && renderPins.length === 0;
    const emptyMessage = hasAnyMatches
        ? 'No properties in this area — zoom out or pan the map.'
        : 'No properties match your filters.';

    return (
        <div className="w-full h-full relative" data-testid="map-container">
            {(hasActiveFilters || company) && (
                <div className="absolute top-2 left-12 z-[501] flex flex-col gap-1">
                    {company && (
                        <Button
                            variant="default"
                            size="sm"
                            onClick={() => setCompany(null)}
                            className="shadow-lg h-8 px-2 text-xs"
                            data-testid="button-deselect-company-map"
                        >
                            <X className="w-3 h-2.5 mr-1.5" />
                            Deselect Company
                        </Button>
                    )}
                    {hasActiveFilters && (
                        <Button
                            variant="default"
                            size="sm"
                            onClick={() => clearFilters()}
                            className="shadow-lg h-8 px-2 text-xs"
                            data-testid="button-clear-filters-map"
                        >
                            <X className="w-3 h-2.5 mr-1.5" />
                            Clear Filters
                        </Button>
                    )}
                </div>
            )}

            {isLoadingMapPins && (
                <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[500] flex items-center gap-2 rounded-md border border-border bg-background/90 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm pointer-events-none">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading map pins…
                </div>
            )}

            {showEmptyState && (
                <div className="absolute inset-0 z-[500] flex items-center justify-center pointer-events-none">
                    <div className="rounded-md border border-border bg-background/90 px-4 py-3 text-sm text-muted-foreground backdrop-blur-sm">
                        {emptyMessage}
                    </div>
                </div>
            )}

            <MapContainer
                center={initialCenter}
                zoom={initialZoom}
                style={{ height: '100%', width: '100%' }}
                scrollWheelZoom={true}
            >
                <TileLayer
                    key={isDark ? 'dark' : 'light'}
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                    url={tileUrl}
                    subdomains="abcd"
                    detectRetina
                />
                <MapResizeHandler />
                <ViewportWatcher onBoundsChange={setMapBounds} />
                <CameraController center={mapCenter} zoom={mapZoom} />
                <MarkerClusterGroup
                    chunkedLoading
                    maxClusterRadius={50}
                    showCoverageOnHover={false}
                    iconCreateFunction={createClusterIcon}
                >
                    {renderPins.map(({ pin, position }) => {
                        const isSelected = property?.id === pin.id;
                        return (
                            <Marker
                                key={pin.id}
                                position={position}
                                icon={getIconForPin(
                                    pin,
                                    isSelected,
                                    company?.id ?? null,
                                    filters.statusFilters,
                                )}
                                eventHandlers={{ click: () => fetchProperty?.(pin.id) }}
                            >
                                <Tooltip direction="top">
                                    <div className="text-xs">
                                        <div className="font-semibold">
                                            {pin.address || 'Address unavailable'}
                                        </div>
                                        {(pin.city || pin.zipcode) && (
                                            <div className="text-muted-foreground">
                                                {[pin.city, pin.zipcode].filter(Boolean).join(', ')}
                                            </div>
                                        )}
                                        <div>
                                            {statusLabel(pin.status)}
                                            {pin.price > 0 && ` · $${pin.price.toLocaleString()}`}
                                        </div>
                                        {pin.propertyOwner && (
                                            <div className="text-muted-foreground">
                                                {formatCompanyName(pin.propertyOwner)}
                                            </div>
                                        )}
                                    </div>
                                </Tooltip>
                            </Marker>
                        );
                    })}
                </MarkerClusterGroup>
            </MapContainer>

            <MapLegend />
        </div>
    );
}
