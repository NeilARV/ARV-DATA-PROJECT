import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import MarkerClusterGroup from 'react-leaflet-cluster';
import { X, Loader2, MousePointerClick } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MapLegend } from '@/components/data/property/MapLegend';
import { useFilters } from '@/hooks/useFilters';
import { useCompanies } from '@/hooks/useCompanies';
import { useGeoMap, type MsaRegionBubble } from '@/hooks/useMap';
import { useProperty } from '@/hooks/useProperty';
import { getCountyCenter, getDefaultMapCenter } from '@/lib/county';
import {
    MAP_ZOOM_COUNTY,
    MAP_ZOOM_FLOOR,
    MAP_ZOOM_MAX,
    OVERVIEW_MAX_ZOOM,
    MAP_DECLUSTER_ZOOM,
} from '@/constants/map.constants';
import { PIN_COLORS } from '@/constants/mapPins.constants';
import { formatCompanyName } from '@shared/utils/formatCompanyName';
import type { MapPin, MapBoundsParams } from '@/types/property';

// ── Marker / cluster sizing tuning (px diameters & radii, plus the breakpoints that pick them) ──

/** Status-dot diameter (px); the selected pin is enlarged to stand out. */
const DOT_DIAMETER = { default: 14, selected: 18 } as const;
/** Status-dot white-ring width (px). */
const DOT_BORDER = { default: 2, selected: 3 } as const;

/** Cluster grouping radius (px) at each zoom tier — wider when zoomed out so nearby pins merge. */
const CLUSTER_RADIUS = { far: 80, mid: 55, near: 35 } as const;
/** Upper zoom bound for each cluster-radius tier (above `mid`, the `near` radius applies). */
const CLUSTER_ZOOM = { far: 10, mid: 12 } as const;

/** Overview count-bubble radius (px) by tier, and the property-count thresholds that pick it. */
const REGION_BUBBLE = { small: 20, medium: 25, large: 30 } as const;
const REGION_COUNT = { small: 50, large: 500 } as const;
/** Overview count-bubble font size (px) below / at-or-above REGION_COUNT.large. */
const REGION_FONT = { small: 12, large: 13 } as const;
/** Radius (px) of the center dot a leader line points back to. */
const REGION_DOT_RADIUS = 3;

// Compact status dots centered on the exact location — far less cluttered than teardrop pins at
// high density, and they don't sit above (and hide) the point they mark.
const createDotIcon = (color: string, isSelected = false) => {
    const size = isSelected ? DOT_DIAMETER.selected : DOT_DIAMETER.default;
    const border = isSelected ? DOT_BORDER.selected : DOT_BORDER.default;
    // White ring + dark outer halo + soft drop shadow so dots read clearly over Voyager's color.
    return L.divIcon({
        className: '',
        html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:${border}px solid #ffffff;box-shadow:0 0 0 1.5px rgba(0,0,0,0.45), 0 1px 2px rgba(0,0,0,0.4);"></span>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        tooltipAnchor: [0, -(size / 2)],
    });
};

const inRenovationIcon = createDotIcon(PIN_COLORS.inRenovation);
const onMarketIcon = createDotIcon(PIN_COLORS.onMarket);
const soldIcon = createDotIcon(PIN_COLORS.sold);
const wholesaleIcon = createDotIcon(PIN_COLORS.wholesale);
const selectedIcon = createDotIcon(PIN_COLORS.selected, true);

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
 * Cluster grouping radius (px) by zoom. Larger when zoomed out so nearby markers merge into a few
 * meaningful donuts instead of many tiny 2–3 clusters; smaller as you zoom in so they split. Past
 * disableClusteringAtZoom, clustering is off entirely (all individual dots).
 */
function clusterRadiusForZoom(zoom: number): number {
    if (zoom <= CLUSTER_ZOOM.far) return CLUSTER_RADIUS.far;
    if (zoom <= CLUSTER_ZOOM.mid) return CLUSTER_RADIUS.mid;
    return CLUSTER_RADIUS.near;
}

/**
 * Builds a national-overview callout for one MSA: a small dot at the true region center, a
 * diagonal-then-horizontal leader line, and a hollow count bubble offset toward open space/water.
 * With no offset it renders just the hollow bubble on the center (no leader).
 */
function createRegionIcon(count: number, offset: [number, number] = [0, 0]): L.DivIcon {
    const [dx, dy] = offset;
    const hasLeader = dx !== 0 || dy !== 0;
    const rb =
        count < REGION_COUNT.small
            ? REGION_BUBBLE.small
            : count < REGION_COUNT.large
              ? REGION_BUBBLE.medium
              : REGION_BUBBLE.large; // bubble radius
    const rd = REGION_DOT_RADIUS; // center-dot radius
    const fontSize = count < REGION_COUNT.large ? REGION_FONT.small : REGION_FONT.large;

    // Bounds covering the center dot (0,0) and the offset bubble (dx,dy) ± radius.
    const pad = 3;
    const minX = Math.min(0, dx - rb) - pad;
    const minY = Math.min(0, dy - rb) - pad;
    const maxX = Math.max(0, dx + rb) + pad;
    const maxY = Math.max(0, dy + rb) + pad;
    const width = maxX - minX;
    const height = maxY - minY;

    // Leader: dot → elbow (diagonal) → bubble (horizontal at the bubble's y).
    const leader = hasLeader
        ? `<polyline points="0,0 ${dx * 0.5},${dy} ${dx},${dy}" style="fill:none;stroke:hsl(var(--primary));stroke-width:1.5" />
           <circle cx="0" cy="0" r="${rd}" style="fill:hsl(var(--primary))" />`
        : '';

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="${width}" height="${height}" style="overflow:visible;cursor:pointer">
        ${leader}
        <circle cx="${dx}" cy="${dy}" r="${rb}" style="fill:hsl(var(--background));fill-opacity:0.9;stroke:hsl(var(--primary));stroke-width:2" />
        <text x="${dx}" y="${dy}" text-anchor="middle" dominant-baseline="central" style="fill:hsl(var(--primary));font-family:var(--font-sans);font-size:${fontSize}px;font-weight:600">${count.toLocaleString()}</text>
      </svg>`;

    return L.divIcon({
        html: svg,
        className: '',
        iconSize: [width, height],
        iconAnchor: [-minX, -minY],
        tooltipAnchor: [dx, dy - rb - 2],
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
 * Reports the viewport box (debounced) on mount and on pan/zoom, so only the pins in view are
 * fetched.
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

/**
 * Enforces the overview gate: while no region is selected, caps zoom-in at the overview breakpoint
 * so the user must pick a region to go deeper. When a region is locked, zoom is unlocked. Zooming
 * back out past the breakpoint releases the lock (back to the overview).
 */
function ZoomLockController({ locked, onUnlock }: { locked: boolean; onUnlock: () => void }) {
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
    const { filters, setFilters, clearFilters, hasActiveFilters } = useFilters();
    const { fetchProperty, property } = useProperty();
    const { company, setCompany } = useCompanies();
    const {
        filteredMapPins = [],
        isLoadingMapPins = false,
        extent,
        regionBubbles = [],
        isOverview = false,
        mapCenter,
        mapZoom,
        setMapBounds,
        setMapCenter,
        setMapZoom,
        isRegionLocked = true,
        setRegionLocked,
    } = useGeoMap({ fetchMapPins: true });

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

    const tileUrl = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
    const tileAttribution =
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

    const hasAnyMatches = (extent?.count ?? 0) > 0;
    const showEmptyState = !isOverview && !isLoadingMapPins && renderPins.length === 0;
    const emptyMessage = hasAnyMatches
        ? 'No properties in this area — zoom out or pan the map.'
        : 'No properties match your filters.';

    // Clicking a national-overview bubble locks into that metro: switches the county filter, unlocks
    // detail zoom, and drops the camera onto the region (the extent then frames its properties).
    function handleRegionClick(region: MsaRegionBubble) {
        setCompany(null);
        setFilters((prev) => ({
            ...prev,
            county: region.county,
            zipCode: '',
            city: undefined,
            companyRole: undefined,
        }));
        setRegionLocked(true);
        setMapCenter(region.center);
        setMapZoom(MAP_ZOOM_COUNTY);
    }

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

            {isOverview && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[500] flex items-center gap-2 rounded-md border border-border bg-background/95 px-4 py-2 text-sm font-semibold text-foreground shadow-lg backdrop-blur-sm pointer-events-none">
                    <MousePointerClick className="w-4 h-4 text-primary" />
                    Select a region to dive deeper
                </div>
            )}

            <MapContainer
                center={initialCenter}
                zoom={initialZoom}
                minZoom={MAP_ZOOM_FLOOR}
                style={{ height: '100%', width: '100%' }}
                scrollWheelZoom={true}
            >
                <TileLayer
                    attribution={tileAttribution}
                    url={tileUrl}
                    subdomains="abc"
                    detectRetina
                />
                <MapResizeHandler />
                <ViewportWatcher onBoundsChange={setMapBounds} />
                <ZoomLockController
                    locked={isRegionLocked}
                    onUnlock={() => setRegionLocked(false)}
                />
                <CameraController center={mapCenter} zoom={mapZoom} />

                {isOverview
                    ? regionBubbles.map((region) => (
                          <Marker
                              key={region.msa}
                              position={region.center}
                              icon={createRegionIcon(region.count, region.offset)}
                              eventHandlers={{ click: () => handleRegionClick(region) }}
                          >
                              <Tooltip direction="top">
                                  <div className="text-xs">
                                      <div className="font-semibold">{region.label}</div>
                                      <div className="text-muted-foreground">
                                          {region.count.toLocaleString()} properties — click to view
                                      </div>
                                  </div>
                              </Tooltip>
                          </Marker>
                      ))
                    : (
                          <MarkerClusterGroup
                              chunkedLoading
                              maxClusterRadius={clusterRadiusForZoom}
                              showCoverageOnHover={false}
                              disableClusteringAtZoom={MAP_DECLUSTER_ZOOM}
                              spiderfyOnMaxZoom
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
                                                          {[pin.city, pin.zipcode]
                                                              .filter(Boolean)
                                                              .join(', ')}
                                                      </div>
                                                  )}
                                                  <div>
                                                      {statusLabel(pin.status)}
                                                      {pin.price > 0 &&
                                                          ` · $${pin.price.toLocaleString()}`}
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
                      )}
            </MapContainer>

            {!isOverview && <MapLegend />}
        </div>
    );
}
