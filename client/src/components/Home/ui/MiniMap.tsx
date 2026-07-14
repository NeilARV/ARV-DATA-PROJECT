import { PIN_COLORS } from '@/constants/mapPins.constants';

/** A status-colored map pin position; the hero passes a per-market set that swaps as areas cycle. */
export type MarketPin = { left: string; top: string; color: string };

/** A Leaflet-style teardrop pin, matching the status colors used on the Data app's property map. */
function MapMarker({ color, className }: { color: string; className?: string }) {
    return (
        <svg
            viewBox="0 0 24 36"
            className={`absolute h-9 w-auto -translate-x-1/2 -translate-y-full drop-shadow ${className ?? ''}`}
            aria-hidden
        >
            <path
                fill={color}
                stroke="#333"
                strokeWidth="1"
                d="M12 0C5.4 0 0 5.4 0 12c0 7.2 12 24 12 24s12-16.8 12-24c0-6.6-5.4-12-12-12z"
            />
            <circle fill="#fff" cx="12" cy="12" r="5" />
        </svg>
    );
}

function LegendDot({ color, label }: { color: string; label: string }) {
    return (
        <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
            {label}
        </span>
    );
}

/**
 * The Data app's signature visual: a schematic street map (roads + parks/water) with
 * status-colored teardrop pins. Shared by the hero and the Data section so the two stay visually
 * consistent. `showLegend` adds the chrome that only fits on the larger instance. `pins` replaces
 * the default static set with a caller-supplied one (the hero's per-MSA pins); bump `areaKey` to
 * replay their staggered drop-in when the set changes.
 */
export function MiniMap({
    className,
    showLegend = false,
    pins,
    areaKey,
}: {
    className?: string;
    showLegend?: boolean;
    pins?: MarketPin[];
    areaKey?: number;
}) {
    return (
        <div className={`relative overflow-hidden rounded-xl border border-border bg-muted ${className ?? ''}`}>
            {/* parks + water */}
            <div className="absolute left-0 top-0 h-1/3 w-2/5 bg-chart-2/15" />
            <div className="absolute bottom-0 right-0 h-2/5 w-2/5 bg-primary/15" />
            {/* roads */}
            <div className="absolute inset-x-0 top-1/3 h-2 bg-background/70" />
            <div className="absolute inset-x-0 top-2/3 h-1.5 bg-background/60" />
            <div className="absolute inset-y-0 left-1/4 w-2 bg-background/70" />
            <div className="absolute inset-y-0 left-[68%] w-1.5 bg-background/60" />
            <div className="absolute -left-12 top-1/4 h-1.5 w-[150%] rotate-[14deg] bg-background/50" />

            {/* Pins. The hero passes a per-market `pins` set (keyed by area so the drop-in replays);
                elsewhere (the Data section) the default static constellation renders, with two radar
                pings for a real-time feel. Colors come from the shared PIN_COLORS source of truth. */}
            {pins ? (
                <div key={areaKey} className="contents">
                    {pins.map((p, i) => (
                        <div
                            key={i}
                            className="arv-pin-drop pointer-events-none absolute"
                            style={{ left: p.left, top: p.top, animationDelay: `${i * 60}ms` }}
                        >
                            <MapMarker color={p.color} className="left-0 top-0" />
                        </div>
                    ))}
                </div>
            ) : (
                <>
                    <span
                        className="absolute left-[24%] top-[42%] h-3 w-3 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full opacity-75"
                        style={{ backgroundColor: PIN_COLORS.onMarket }}
                    />
                    <span
                        className="absolute left-[60%] top-[60%] h-3 w-3 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full opacity-75"
                        style={{ backgroundColor: PIN_COLORS.wholesale }}
                    />
                    <MapMarker color={PIN_COLORS.onMarket} className="left-[24%] top-[42%]" />
                    <MapMarker color={PIN_COLORS.inRenovation} className="left-[46%] top-[30%]" />
                    <MapMarker color={PIN_COLORS.wholesale} className="left-[60%] top-[60%]" />
                    <MapMarker color={PIN_COLORS.sold} className="left-[80%] top-[44%]" />
                    <MapMarker color={PIN_COLORS.selected} className="left-[37%] top-[70%]" />
                </>
            )}

            {showLegend && (
                <div className="absolute bottom-3 left-3 rounded-md border border-border bg-background/90 px-2.5 py-2 backdrop-blur">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <LegendDot color={PIN_COLORS.onMarket} label="On-market" />
                        <LegendDot color={PIN_COLORS.inRenovation} label="In-reno" />
                        <LegendDot color={PIN_COLORS.wholesale} label="Wholesale" />
                        <LegendDot color={PIN_COLORS.sold} label="Sold" />
                    </div>
                </div>
            )}
        </div>
    );
}
