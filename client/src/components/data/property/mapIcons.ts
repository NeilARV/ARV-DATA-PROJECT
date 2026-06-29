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

/** Overview count-bubble radius (px) by tier, and the property-count thresholds that pick it. */
const REGION_BUBBLE = { small: 20, medium: 25, large: 30 } as const;
const REGION_COUNT = { small: 50, large: 500 } as const;
/** Overview count-bubble font size (px) below / at-or-above REGION_COUNT.large. */
const REGION_FONT = { small: 12, large: 13 } as const;
/** Radius (px) of the center dot a leader line points back to. */
const REGION_DOT_RADIUS = 3;

type DotIconConfig = { color: string; diameter: number; border: number };

// Compact status dots centered on the exact location — far less cluttered than teardrop pins at
// high density, and they don't sit above (and hide) the point they mark.
const createDotIcon = ({ color, diameter, border }: DotIconConfig): L.DivIcon =>
    // White ring + dark outer halo + soft drop shadow so dots read clearly over Voyager's color.
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
export function clusterRadiusForZoom(zoom: number): number {
    if (zoom <= CLUSTER_ZOOM.far) return CLUSTER_RADIUS.far;
    if (zoom <= CLUSTER_ZOOM.mid) return CLUSTER_RADIUS.mid;
    return CLUSTER_RADIUS.near;
}

/**
 * Builds a national-overview callout for one MSA: a small dot at the true region center, a
 * diagonal-then-horizontal leader line, and a hollow count bubble offset toward open space/water.
 * With no offset it renders just the hollow bubble on the center (no leader).
 */
export function createRegionIcon(count: number, offset: [number, number] = [0, 0]): L.DivIcon {
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
