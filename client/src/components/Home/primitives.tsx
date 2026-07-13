import { useEffect, useRef, useState } from 'react';
import { Check, type LucideIcon } from 'lucide-react';

import { useTheme } from '@/hooks/use-theme';
import darkLogoUrl from '@assets/arv-data-logo-dark.png';
import lightLogoUrl from '@assets/arv-data-logo-light.png';

/**
 * Shared presentational primitives for the marketing home page. The page is split into
 * section-per-file components (Hero, Features, …); anything reused across more than one section
 * lives here. All colors use semantic design tokens (bg-card, text-muted-foreground, …).
 */

// ---- Shared button class strings (kept here so section markup stays readable) ----------------

export const btnPrimary =
    'inline-flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:brightness-90 active:brightness-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export const btnOutline =
    'inline-flex items-center justify-center gap-2 rounded-md border border-border bg-transparent px-5 py-2.5 text-sm font-medium text-foreground transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export const btnGhost =
    'inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

// ---- Shared heading scales (the page's typographic climax lives on the marketing layer only) ----
// The hero is the display peak; every section header shares one confident scale so hierarchy reads
// as deliberate, not drifting. Fixed clamp steps are sanctioned here (not in app UI) per DESIGN.md.

export const heroHeading =
    'text-[2.5rem] font-bold leading-[1.03] tracking-[-0.03em] text-foreground [text-wrap:balance] sm:text-6xl lg:text-[4.25rem]';

export const sectionHeading =
    'text-[2rem] font-bold leading-[1.08] tracking-[-0.025em] text-foreground [text-wrap:balance] sm:text-4xl lg:text-[2.75rem]';

// Page-local CSS injected via a <style> tag on the home page. Holds the marquee loop, a reveal
// fade, and the custom range-slider styling (teal thumb) used by the deal calculator.
export const pageStyles = `
@keyframes arv-marquee {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}
.arv-marquee-track {
  animation: arv-marquee 28s linear infinite;
}
@keyframes arv-fade-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
.arv-fade-in {
  animation: arv-fade-in 500ms ease-out;
}
.arv-range {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 6px;
  border-radius: 9999px;
  background: hsl(var(--muted));
  outline: none;
}
.arv-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  height: 16px;
  width: 16px;
  border-radius: 9999px;
  background: hsl(var(--primary));
  border: 2px solid hsl(var(--background));
  cursor: pointer;
}
.arv-range::-moz-range-thumb {
  height: 16px;
  width: 16px;
  border-radius: 9999px;
  background: hsl(var(--primary));
  border: 2px solid hsl(var(--background));
  cursor: pointer;
}
@media (prefers-reduced-motion: reduce) {
  .arv-marquee-track { animation: none; }
  .arv-fade-in { animation: none; }
}
`;

// ---- Small presentational helpers ------------------------------------------

/** The ARV Data wordmark logo, auto-swapping between the light/dark variant for the active theme. */
export function Logo({ className = 'h-12 w-auto' }: { className?: string }) {
    const { isDark } = useTheme();
    return <img src={isDark ? lightLogoUrl : darkLogoUrl} alt="ARV Data" className={className} />;
}

/** A teal-tinted pill used for tags and the hero eyebrow. */
export function Pill({ children }: { children: React.ReactNode }) {
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            {children}
        </span>
    );
}

/** Rounded icon tile that carries each app's accent color. */
export function IconTile({ icon: Icon, tint }: { icon: LucideIcon; tint: string }) {
    return (
        <div
            className={`flex h-11 w-11 items-center justify-center rounded-xl ${tint}`}
            aria-hidden
        >
            <Icon className="h-5 w-5" />
        </div>
    );
}

export function FeatureBullet({ children }: { children: React.ReactNode }) {
    return (
        <li className="flex items-start gap-2 text-sm text-muted-foreground">
            <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
            <span>{children}</span>
        </li>
    );
}

/** Smooth-scrolls to a section by id; scroll-mt on the target offsets the sticky nav. */
export function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** True when the user prefers reduced motion — animations should be skipped. */
export function prefersReducedMotion() {
    return (
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    );
}

/** A pulsing green "live" indicator dot. */
export function LiveDot() {
    return (
        <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-online opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-status-online" />
        </span>
    );
}

/** Counts a number up from 0 to `target` on mount (eased); jumps if reduced-motion. */
export function useCountUp(target: number, duration = 1200) {
    const [value, setValue] = useState(0);
    useEffect(() => {
        if (prefersReducedMotion()) {
            setValue(target);
            return;
        }
        let raf = 0;
        const start = performance.now();
        const tick = (now: number) => {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
            setValue(Math.round(target * eased));
            if (progress < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [target, duration]);
    return value;
}

/** A hero stat whose number animates up on load. */
export function StatItem({ value, label }: { value: number; label: string }) {
    const n = useCountUp(value);
    return (
        <div>
            <p className="text-3xl font-bold tracking-tight text-foreground">{n}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
        </div>
    );
}

/** Reveals (fade + slide up) its children the first time they scroll into view. */
export function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
    const ref = useRef<HTMLDivElement>(null);
    const [shown, setShown] = useState(false);
    useEffect(() => {
        if (prefersReducedMotion()) {
            setShown(true);
            return;
        }
        const el = ref.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    setShown(true);
                    observer.disconnect();
                }
            },
            { threshold: 0.15 },
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, []);
    return (
        <div
            ref={ref}
            className={`transition-all duration-700 ease-out ${
                shown ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
            } ${className ?? ''}`}
        >
            {children}
        </div>
    );
}

/** A Leaflet-style teardrop pin, matching the exact SVG + colors used in PropertyMap. */
export function MapMarker({ color, className }: { color: string; className?: string }) {
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

export function LegendDot({ color, label }: { color: string; label: string }) {
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
 * consistent. `showLegend` adds the chrome that only fits on the larger instance.
 */
export function MiniMap({ className, showLegend = false }: { className?: string; showLegend?: boolean }) {
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

            {/* live activity pulses — radar ping at the tip of two pins (real-time feel) */}
            <span
                className="absolute left-[24%] top-[42%] h-3 w-3 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full opacity-75"
                style={{ backgroundColor: '#22C55E' }}
            />
            <span
                className="absolute left-[60%] top-[60%] h-3 w-3 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full opacity-75"
                style={{ backgroundColor: '#9333EA' }}
            />

            {/* status pins — colors match getIconForPin in PropertyMap */}
            <MapMarker color="#22C55E" className="left-[24%] top-[42%]" />
            <MapMarker color="#69C9E1" className="left-[46%] top-[30%]" />
            <MapMarker color="#9333EA" className="left-[60%] top-[60%]" />
            <MapMarker color="#FF0000" className="left-[80%] top-[44%]" />
            <MapMarker color="#FFA500" className="left-[37%] top-[70%]" />

            {showLegend && (
                <div className="absolute bottom-3 left-3 rounded-md border border-border bg-background/90 px-2.5 py-2 backdrop-blur">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <LegendDot color="#22C55E" label="On-market" />
                        <LegendDot color="#69C9E1" label="In-reno" />
                        <LegendDot color="#9333EA" label="Wholesale" />
                        <LegendDot color="#FF0000" label="Sold" />
                    </div>
                </div>
            )}
        </div>
    );
}
