import L from 'leaflet';
import { PIN_COLORS } from '@/constants/mapPins.constants';
import type { MapPin } from '@/types/property';

// ── Marker / cluster sizing tuning (px diameters & radii, plus the breakpoints that pick them) ──

/** Status-dot diameter (px); the selected pin is enlarged to stand out. */
const DOT_DIAMETER = { default: 14, selected: 18 } as const;
/** Status-dot white-ring width (px). */
const DOT_BORDER = { default: 2, selected: 3 } as const;

/** Cluster grouping radius (px) at each zoom tier — wider when zoomed out so nearby pins merge. */
const CLUSTER_RADIUS = { far: 80, mid: 55, near: 35 } as const;
/** Upper zoom bound for each cluster-radius tier (above `mid`, the `near` radius applies). */
const CLUSTER_ZOOM = { far: 10, mid: 12 } as const;

/**
 * Cluster donut diameter (px) by pin-count tier. Kept small with a gentle 4px step so a denser
 * cluster reads as only slightly larger — enough to hint at density without the chunky jumps the
 * old 36→44→52 scale produced.
 */
const CLUSTER_SIZE = { small: 28, medium: 32, large: 36 } as const;
/** Pin-count thresholds that pick the donut size (below medium → small; below large → medium). */
const CLUSTER_SIZE_COUNT = { medium: 25, large: 200 } as const;
/** Thickness (px) of the colored status-mix ring around the count. */
const CLUSTER_RING = 5;

/** Radius (px) of the location dot the overview label card points back to. */
const REGION_DOT_RADIUS = 6;

type DotIconConfig = { color: string; diameter: number; border: number };

// Compact status dots centered on the exact location — far less cluttered than teardrop pins at
// high density, and they don't sit above (and hide) the point they mark.
const createDotIcon = ({ color, diameter, border }: DotIconConfig): L.DivIcon =>
    // White ring + dark outer halo + soft drop shadow so dots read clearly over Voyager's color in
    // both themes (white reads better than a theme-dark ring against the light Voyager basemap).
    L.divIcon({
        className: '',
        html: `<span style="display:block;width:${diameter}px;height:${diameter}px;border-radius:9999px;background:${color};border:${border}px solid #ffffff;box-shadow:0 0 0 1.5px rgba(0,0,0,0.45), 0 1px 2px rgba(0,0,0,0.4);"></span>`,
        iconSize: [diameter, diameter],
        iconAnchor: [diameter / 2, diameter / 2],
        tooltipAnchor: [0, -(diameter / 2)],
    });

const inRenovationIcon = createDotIcon({
    color: PIN_COLORS.inRenovation,
    diameter: DOT_DIAMETER.default,
    border: DOT_BORDER.default,
});
const onMarketIcon = createDotIcon({
    color: PIN_COLORS.onMarket,
    diameter: DOT_DIAMETER.default,
    border: DOT_BORDER.default,
});
const soldIcon = createDotIcon({
    color: PIN_COLORS.sold,
    diameter: DOT_DIAMETER.default,
    border: DOT_BORDER.default,
});
const wholesaleIcon = createDotIcon({
    color: PIN_COLORS.wholesale,
    diameter: DOT_DIAMETER.default,
    border: DOT_BORDER.default,
});
const selectedIcon = createDotIcon({
    color: PIN_COLORS.selected,
    diameter: DOT_DIAMETER.selected,
    border: DOT_BORDER.selected,
});

const STATUS_LABELS: Record<string, string> = {
    'in-renovation': 'In Renovation',
    'on-market': 'On Market',
    sold: 'Sold',
    wholesale: 'Wholesale',
};

/** Friendly label for a pin status (falls back to the raw value). */
export function statusLabel(status: string | null): string {
    const key = (status ?? '').toLowerCase().trim();
    return STATUS_LABELS[key] ?? (status || 'Unknown');
}

type IconForPinParams = {
    pin: MapPin;
    isSelected: boolean;
    selectedCompanyId: string | null | undefined;
    statusFilters: string[];
};

/** Resolves the status/company-aware dot icon for a pin (selected pins always use the highlight). */
export function getIconForPin({
    pin,
    isSelected,
    selectedCompanyId,
    statusFilters,
}: IconForPinParams): L.DivIcon {
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
}

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
export function createClusterIcon(cluster: ClusterLike): L.DivIcon {
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

    const size =
        count < CLUSTER_SIZE_COUNT.medium
            ? CLUSTER_SIZE.small
            : count < CLUSTER_SIZE_COUNT.large
              ? CLUSTER_SIZE.medium
              : CLUSTER_SIZE.large;
    const inner = size - CLUSTER_RING * 2;
    // White center + black count, with the colored status-mix ring as the outermost edge (no extra
    // white ring around it — the ring's color/thickness IS the wholesale/in-area key). A soft drop
    // shadow lifts it off the map and matches the property dots so clusters and pins feel related.
    const wrapperStyle = `display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:9999px;background:${background};box-shadow:0 1px 3px rgba(0,0,0,0.35);`;
    const innerStyle = `display:flex;align-items:center;justify-content:center;width:${inner}px;height:${inner}px;border-radius:9999px;background:#ffffff;color:#000000;font-family:var(--font-sans);font-size:11px;font-weight:600;line-height:1;`;

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
export function clusterRadiusForZoom(zoom: number): number {
    if (zoom <= CLUSTER_ZOOM.far) return CLUSTER_RADIUS.far;
    if (zoom <= CLUSTER_ZOOM.mid) return CLUSTER_RADIUS.mid;
    return CLUSTER_RADIUS.near;
}

type RegionIconParams = {
    /** Display label, e.g. "Los Angeles County". */
    label: string;
    /** Property count shown under the label. */
    count: number;
    /** Pixel offset [x, y] of the card CENTER from the location dot (x→right, y→down). */
    offset?: [number, number];
};

/**
 * National-overview marker for one MSA: a dot at the true county center, a thin leader line, and a
 * single rectangular card holding the county name + property count, offset toward open space.
 *
 * The whole marker is ONE element (dot + line + card share the divIcon's coordinate space, with the
 * dot's center at the origin = the county point), so the line is always anchored to the dot's exact
 * center. The leader runs origin → card center; the opaque card is painted LAST, over the line, so
 * the visible segment ends precisely where the line crosses the card's perimeter. That join point
 * therefore follows the offset direction on its own — an edge midpoint for an axis-aligned offset, a
 * corner for a diagonal one — with no need to measure the auto-sized card.
 */
export function createRegionIcon({ label, count, offset = [0, 0] }: RegionIconParams): L.DivIcon {
    const [dx, dy] = offset;
    const rd = REGION_DOT_RADIUS;
    const hasOffset = dx !== 0 || dy !== 0;

    // Line from the dot center (0,0) to the card center (dx,dy). Its bounding box spans those two
    // points; `overflow:visible` keeps the stroke from being clipped at the edges.
    const minX = Math.min(0, dx);
    const minY = Math.min(0, dy);
    const leaderW = Math.max(Math.abs(dx), 1);
    const leaderH = Math.max(Math.abs(dy), 1);
    const leader = hasOffset
        ? `<svg width="${leaderW}" height="${leaderH}" viewBox="${minX} ${minY} ${leaderW} ${leaderH}" style="position:absolute;left:${minX}px;top:${minY}px;overflow:visible;pointer-events:none;z-index:0"><line x1="0" y1="0" x2="${dx}" y2="${dy}" style="stroke:hsl(var(--primary));stroke-width:1.5" /></svg>`
        : '';

    // White ring + soft drop shadow (no dark halo ring). The border grows the box, so offset by it.
    // Painted after the line so the dot covers the line's first few px and it reads as joined to the
    // dot's center.
    const dotBorder = 2;
    const dot = `<div style="position:absolute;left:${-(rd + dotBorder)}px;top:${-(rd + dotBorder)}px;width:${rd * 2}px;height:${rd * 2}px;border-radius:9999px;background:hsl(var(--primary));border:${dotBorder}px solid #ffffff;box-shadow:0 1px 2px rgb(0 0 0 / 0.3);z-index:1"></div>`;

    // Card centered on the offset point (translate -50%,-50%) so the leader can meet it from any
    // direction; its opaque background hides the inner half of the line up to the perimeter.
    const card = `<div style="position:absolute;left:${dx}px;top:${dy}px;transform:translate(-50%, -50%);z-index:2;display:flex;flex-direction:column;align-items:flex-start;gap:1px;padding:3px 8px;border-radius:6px;background:hsl(var(--background));border:1px solid hsl(var(--primary));box-shadow:0 1px 3px rgb(0 0 0 / 0.3);font-family:var(--font-sans);white-space:nowrap;cursor:pointer">
            <span style="font-size:12px;font-weight:600;line-height:1.2;color:hsl(var(--foreground))">${label}</span>
            <span style="font-size:10px;line-height:1.2;color:hsl(var(--muted-foreground))">${count.toLocaleString()} properties</span>
        </div>`;

    return L.divIcon({
        html: `<div style="position:relative;width:0;height:0">${leader}${dot}${card}</div>`,
        className: '',
        iconSize: [0, 0],
        iconAnchor: [0, 0],
    });
}
