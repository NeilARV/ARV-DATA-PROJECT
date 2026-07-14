import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { ArrowRight, MapPin } from 'lucide-react';

import { PIN_COLORS } from '@/constants/mapPins.constants';
import { type MarketPin, MiniMap } from '@/components/Home/ui/MiniMap';
import { LiveDot } from '@/components/Home/ui/LiveDot';
import { btnOutline, btnPrimary } from '@/components/Home/ui/buttons';
import { prefersReducedMotion } from '@/utils/motion';
import { scrollToSection } from '@/utils/scroll';

// The hero is the display peak — a larger, one-off scale that sits above the shared sectionHeading.
// Fixed clamp steps are sanctioned on the marketing layer only, per DESIGN.md.
const heroHeading =
    'text-[2.25rem] font-bold leading-[1.05] tracking-[-0.03em] text-foreground [text-wrap:balance] sm:text-5xl lg:text-[3.25rem]';

/**
 * The markets the hero monitor surveys — illustrative, not live data. The terminal dwells on one
 * MSA at a time and advances to the next, refreshing the map pins, transaction total, median ARV,
 * spread, and bar profile so each reads native to that area (never an incrementing ticker).
 */
type Area = {
    city: string;
    txns: number; // total transactions surfaced for the area
    arvK: number; // median ARV, in thousands of dollars
    spread: number; // average spread, in percent
    bars: number[]; // nine 0–100 bar heights — the area's activity profile
    pins: MarketPin[];
};

const AREAS: Area[] = [
    {
        city: 'San Diego, CA',
        txns: 212,
        arvK: 985,
        spread: 17.1,
        bars: [52, 64, 58, 74, 66, 80, 88, 60, 70],
        pins: [
            { left: '26%', top: '40%', color: PIN_COLORS.onMarket },
            { left: '48%', top: '28%', color: PIN_COLORS.inRenovation },
            { left: '62%', top: '54%', color: PIN_COLORS.wholesale },
            { left: '78%', top: '40%', color: PIN_COLORS.sold },
            { left: '38%', top: '66%', color: PIN_COLORS.selected },
        ],
    },
    {
        city: 'Los Angeles, CA',
        txns: 284,
        arvK: 1150,
        spread: 16.2,
        bars: [60, 72, 68, 84, 76, 90, 96, 72, 82],
        pins: [
            { left: '20%', top: '34%', color: PIN_COLORS.onMarket },
            { left: '36%', top: '26%', color: PIN_COLORS.inRenovation },
            { left: '52%', top: '44%', color: PIN_COLORS.sold },
            { left: '66%', top: '30%', color: PIN_COLORS.wholesale },
            { left: '74%', top: '58%', color: PIN_COLORS.onMarket },
            { left: '44%', top: '68%', color: PIN_COLORS.selected },
        ],
    },
    {
        city: 'Denver, CO',
        txns: 154,
        arvK: 612,
        spread: 18.4,
        bars: [40, 58, 50, 72, 54, 66, 84, 46, 62],
        pins: [
            { left: '30%', top: '38%', color: PIN_COLORS.inRenovation },
            { left: '54%', top: '30%', color: PIN_COLORS.onMarket },
            { left: '68%', top: '56%', color: PIN_COLORS.selected },
            { left: '42%', top: '64%', color: PIN_COLORS.wholesale },
        ],
    },
    {
        city: 'San Francisco, CA',
        txns: 176,
        arvK: 1320,
        spread: 15.4,
        bars: [48, 60, 72, 64, 80, 58, 70, 54, 68],
        pins: [
            { left: '24%', top: '44%', color: PIN_COLORS.wholesale },
            { left: '44%', top: '32%', color: PIN_COLORS.onMarket },
            { left: '58%', top: '50%', color: PIN_COLORS.inRenovation },
            { left: '72%', top: '38%', color: PIN_COLORS.sold },
            { left: '40%', top: '68%', color: PIN_COLORS.onMarket },
        ],
    },
    {
        city: 'Miami, FL',
        txns: 243,
        arvK: 588,
        spread: 20.1,
        bars: [56, 50, 66, 58, 74, 62, 80, 68, 54],
        pins: [
            { left: '28%', top: '36%', color: PIN_COLORS.selected },
            { left: '46%', top: '52%', color: PIN_COLORS.onMarket },
            { left: '62%', top: '30%', color: PIN_COLORS.inRenovation },
            { left: '76%', top: '50%', color: PIN_COLORS.wholesale },
            { left: '36%', top: '68%', color: PIN_COLORS.sold },
        ],
    },
    {
        city: 'Tampa, FL',
        txns: 231,
        arvK: 412,
        spread: 21.2,
        bars: [44, 62, 54, 70, 60, 76, 66, 50, 72],
        pins: [
            { left: '22%', top: '42%', color: PIN_COLORS.onMarket },
            { left: '40%', top: '30%', color: PIN_COLORS.selected },
            { left: '56%', top: '48%', color: PIN_COLORS.onMarket },
            { left: '70%', top: '34%', color: PIN_COLORS.inRenovation },
            { left: '50%', top: '66%', color: PIN_COLORS.wholesale },
        ],
    },
    {
        city: 'Seattle, WA',
        txns: 167,
        arvK: 842,
        spread: 17.8,
        bars: [50, 66, 58, 78, 64, 72, 86, 56, 68],
        pins: [
            { left: '32%', top: '34%', color: PIN_COLORS.inRenovation },
            { left: '52%', top: '46%', color: PIN_COLORS.wholesale },
            { left: '66%', top: '30%', color: PIN_COLORS.onMarket },
            { left: '44%', top: '64%', color: PIN_COLORS.selected },
        ],
    },
    {
        city: 'Port St. Lucie, FL',
        txns: 96,
        arvK: 387,
        spread: 22.4,
        bars: [34, 48, 42, 58, 46, 54, 64, 40, 50],
        pins: [
            { left: '34%', top: '40%', color: PIN_COLORS.onMarket },
            { left: '56%', top: '52%', color: PIN_COLORS.selected },
            { left: '46%', top: '30%', color: PIN_COLORS.inRenovation },
        ],
    },
    {
        city: 'Riverside, CA',
        txns: 198,
        arvK: 625,
        spread: 19.3,
        bars: [46, 60, 56, 72, 64, 70, 82, 58, 66],
        pins: [
            { left: '26%', top: '38%', color: PIN_COLORS.sold },
            { left: '44%', top: '28%', color: PIN_COLORS.onMarket },
            { left: '60%', top: '50%', color: PIN_COLORS.inRenovation },
            { left: '74%', top: '42%', color: PIN_COLORS.wholesale },
            { left: '40%', top: '66%', color: PIN_COLORS.onMarket },
        ],
    },
];

const AREA_MS = 4200;

/** Formats a median ARV given in thousands: `$985K`, or `$1.15M` once it crosses a million. */
function formatArv(thousands: number): string {
    return thousands >= 1000 ? `$${(thousands / 1000).toFixed(2)}M` : `$${thousands}K`;
}

/** Fades its content up on mount; the parent keys it per area, so the value refreshes on each change. */
function AreaValue({ className, children }: { className?: string; children: React.ReactNode }) {
    return <span className={`arv-fade-in inline-block ${className ?? ''}`}>{children}</span>;
}

/**
 * A data-free market monitor that sells the Data app by surveying ARV's markets. It dwells on one
 * MSA, then advances — the map re-pins, the bar profile morphs, and the city, transaction total,
 * median ARV, and spread refresh to that area. The loop only runs while on-screen and the tab is
 * visible; under reduced motion it never starts, holding a static snapshot of the first market.
 */
function HeroMock() {
    const [area, setArea] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (prefersReducedMotion()) return; // hold the first market, no cycling
        const el = containerRef.current;
        if (!el) return;

        let intervalId: number | null = null;
        const advance = () => {
            if (document.hidden) return; // don't advance while backgrounded
            setArea((a) => (a + 1) % AREAS.length);
        };
        const start = () => {
            if (intervalId == null) intervalId = window.setInterval(advance, AREA_MS);
        };
        const stop = () => {
            if (intervalId != null) {
                window.clearInterval(intervalId);
                intervalId = null;
            }
        };

        // Pause cycling whenever the monitor scrolls out of view; resume when it returns.
        const observer =
            typeof IntersectionObserver !== 'undefined'
                ? new IntersectionObserver(([entry]) => (entry.isIntersecting ? start() : stop()), {
                      threshold: 0.2,
                  })
                : null;
        if (observer) observer.observe(el);
        else start();

        return () => {
            observer?.disconnect();
            stop();
        };
    }, []);

    const a = AREAS[area];

    return (
        // aria-hidden: the figures here are illustrative, not real market data — never read aloud.
        <div
            ref={containerRef}
            aria-hidden
            className="relative rounded-2xl border border-card-border bg-card p-4"
        >
            {/* product top-bar: reads as the real Data app header, not generic window chrome */}
            <div className="mb-4 flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-semibold text-foreground">
                    <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
                    <AreaValue key={`city-${area}`}>{a.city}</AreaValue>
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <LiveDot />
                    <AreaValue key={`txns-${area}`} className="tabular-nums">
                        {a.txns}
                    </AreaValue>
                    transactions
                </span>
            </div>

            <div className="grid grid-cols-3 gap-3">
                {/* property map preview — pins re-drop for each market surveyed */}
                <MiniMap className="col-span-2 h-44" pins={a.pins} areaKey={area} />

                {/* stat tiles */}
                <div className="col-span-1 flex flex-col gap-3">
                    <div className="rounded-xl border border-border bg-background p-3">
                        <p className="text-xs text-muted-foreground">Median ARV</p>
                        <p className="text-lg font-bold text-foreground">
                            <AreaValue key={`arv-${area}`} className="tabular-nums">
                                {formatArv(a.arvK)}
                            </AreaValue>
                        </p>
                    </div>
                    <div className="rounded-xl border border-border bg-background p-3">
                        <p className="text-xs text-muted-foreground">Avg. Spread</p>
                        <p className="text-lg font-bold text-spread-positive">
                            <AreaValue key={`spread-${area}`} className="tabular-nums">
                                +{a.spread.toFixed(1)}%
                            </AreaValue>
                        </p>
                    </div>
                </div>
            </div>

            {/* mini bar chart — the profile morphs to each market, sweeping via a small per-bar delay.
                scaleY (not height) keeps the transition on the compositor, off the layout thread. */}
            <div className="mt-3 flex h-20 items-end gap-2 rounded-xl border border-border bg-background p-3">
                {a.bars.map((h, i) => (
                    <div
                        key={i}
                        className="h-full flex-1 origin-bottom rounded-sm bg-primary/70 transition-transform duration-700 ease-out"
                        style={{ transform: `scaleY(${h / 100})`, transitionDelay: `${i * 30}ms` }}
                    />
                ))}
            </div>
        </div>
    );
}

/** A single credibility stat — static by design; a count-up on one-digit numbers reads toy. */
function Stat({ value, label }: { value: string; label: string }) {
    return (
        <div className="px-5 first:pl-0">
            <p className="text-3xl font-bold leading-none tracking-tight text-foreground">{value}</p>
            <p className="mt-2 text-sm leading-tight text-muted-foreground">{label}</p>
        </div>
    );
}

export function Hero() {
    const [, setLocation] = useLocation();

    return (
        <section className="relative overflow-hidden">
            <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 py-16 lg:grid-cols-2 lg:py-24">
                <div>
                    <h1 className={heroHeading}>
                        The <span className="arv-underline">exclusive</span> platform for real
                        estate investors
                    </h1>

                    <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground lg:text-lg">
                        Daily flip transactions and double closes, a vetted vendor directory, a
                        members-only deal marketplace, and a private mastermind — one platform,
                        built for ARV clients and partners.
                    </p>

                    <div className="mt-8 flex flex-wrap items-center gap-3">
                        <button
                            type="button"
                            onClick={() => scrollToSection('platform')}
                            className={btnPrimary}
                        >
                            Explore the platform
                            <ArrowRight className="h-4 w-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setLocation('/deals')}
                            className={btnOutline}
                        >
                            Browse live deals
                        </button>
                    </div>

                    <div className="mt-10 grid max-w-md grid-cols-3 divide-x divide-border">
                        <Stat value="9" label="Active markets" />
                        <Stat value="4" label="States" />
                        <Stat value="4" label="Integrated tools" />
                    </div>
                </div>

                <div className="relative">
                    <HeroMock />
                </div>
            </div>
        </section>
    );
}
