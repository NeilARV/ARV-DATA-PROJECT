import { useEffect, useRef, useState } from 'react';
import {
    ArrowRight,
    BarChart3,
    Bath,
    Bed,
    Bold,
    Building2,
    Calculator,
    Check,
    ChevronLeft,
    ChevronRight,
    CircleUser,
    Handshake,
    Hash,
    Home,
    Italic,
    LayoutGrid,
    Link2,
    Map,
    MapPin,
    Maximize2,
    MessageSquare,
    Moon,
    Phone,
    Send,
    Sparkles,
    Star,
    Sun,
    Table2,
    Tag,
    TrendingUp,
    Underline,
    Users,
    Wrench,
} from 'lucide-react';

/**
 * Example — a standalone, dependency-free home-page design prototype.
 *
 * Intentionally self-contained: it imports nothing from the app (no API calls,
 * hooks, or shared components) so the layout can be iterated on quickly and run
 * in isolation. Dark mode is the default; a local toggle flips the `dark` class
 * on <html> so both themes can be previewed. All colors use semantic design
 * tokens (bg-card, text-muted-foreground, bg-primary, …) — never hardcoded.
 */

type Theme = 'dark' | 'light';

// ---- Shared class strings (kept here so markup stays readable) -------------

const btnPrimary =
    'inline-flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:brightness-90 active:brightness-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const btnOutline =
    'inline-flex items-center justify-center gap-2 rounded-md border border-border bg-transparent px-5 py-2.5 text-sm font-medium text-foreground transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const btnGhost =
    'inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

// Page-local CSS injected via a <style> tag because this prototype is self-contained
// and may not touch tailwind.config / index.css. Holds the marquee loop, a reveal
// fade, and the custom range-slider styling (teal thumb) used by the calculator.
const pageStyles = `
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

const markets = [
    'Denver',
    'Miami',
    'San Diego',
    'Los Angeles',
    'San Francisco',
    'Port St. Lucie',
];

const dataViews = [
    { icon: Map, label: 'Map View', desc: 'Transactions plotted on an interactive map' },
    { icon: LayoutGrid, label: 'Grid View', desc: 'Scan properties as visual cards' },
    { icon: Table2, label: 'Table View', desc: 'Dense, sortable data table' },
    { icon: Users, label: 'Buyers Feed', desc: "See who's actively acquiring" },
    { icon: TrendingUp, label: 'Wholesale Feed', desc: 'Fresh off-market opportunities' },
] as const;

// ---- Small presentational helpers ------------------------------------------

/** A teal-tinted pill used for tags and the hero eyebrow. */
function Pill({ children }: { children: React.ReactNode }) {
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            {children}
        </span>
    );
}

/** Rounded icon tile that carries each app's accent color. */
function IconTile({ icon: Icon, tint }: { icon: typeof Map; tint: string }) {
    return (
        <div
            className={`flex h-11 w-11 items-center justify-center rounded-xl ${tint}`}
            aria-hidden
        >
            <Icon className="h-5 w-5" />
        </div>
    );
}

function FeatureBullet({ children }: { children: React.ReactNode }) {
    return (
        <li className="flex items-start gap-2 text-sm text-muted-foreground">
            <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
            <span>{children}</span>
        </li>
    );
}

/** Smooth-scrolls to a section by id; scroll-mt on the target offsets the sticky nav. */
function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** "Learn more →" control that jumps to the matching detail section. */
function LearnMoreLink({ targetId }: { targetId: string }) {
    return (
        <button
            type="button"
            onClick={() => scrollToSection(targetId)}
            className="mt-5 inline-flex items-center gap-1.5 self-start text-sm font-medium text-primary transition hover:gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
            Learn more
            <ArrowRight className="h-4 w-4" />
        </button>
    );
}

/** True when the user prefers reduced motion — animations should be skipped. */
function prefersReducedMotion() {
    return (
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    );
}

/** A pulsing green "live" indicator dot. */
function LiveDot() {
    return (
        <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-online opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-status-online" />
        </span>
    );
}

/** Counts a number up from 0 to `target` on mount (eased); jumps if reduced-motion. */
function useCountUp(target: number, duration = 1200) {
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
function StatItem({ value, label }: { value: number; label: string }) {
    const n = useCountUp(value);
    return (
        <div>
            <p className="text-2xl font-bold text-foreground">{n}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
        </div>
    );
}

/** Reveals (fade + slide up) its children the first time they scroll into view. */
function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
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
 * The Data app's signature visual: a schematic street map (roads + parks/water)
 * with status-colored teardrop pins. Shared by the hero and the Data section so
 * the two stay visually consistent. `showLegend`/`showControl` add the chrome
 * that only fits on the larger instance.
 */
function MiniMap({
    className,
    showLegend = false,
}: {
    className?: string;
    showLegend?: boolean;
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

// ---- Section: top navigation -----------------------------------------------

function NavBar({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
    const links = ['Data', 'Deals', 'Vendors', 'Mastermind'];
    return (
        <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur">
            <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-4 sm:px-6">
                <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                        <Building2 className="h-5 w-5" />
                    </div>
                    <span className="text-base font-semibold text-foreground">ARV Finance</span>
                </div>

                <nav className="hidden items-center gap-1 lg:flex">
                    {links.map((link) => (
                        <a key={link} href="#features" className={btnGhost}>
                            {link}
                        </a>
                    ))}
                </nav>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={onToggle}
                        aria-label="Toggle theme"
                        className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        {theme === 'dark' ? (
                            <Sun className="h-4 w-4" />
                        ) : (
                            <Moon className="h-4 w-4" />
                        )}
                    </button>
                    <a href="#" className={`${btnGhost} hidden sm:inline-flex`}>
                        Sign in
                    </a>
                    <a href="#" className={btnPrimary}>
                        Get started
                    </a>
                </div>
            </div>
        </header>
    );
}

// ---- Section: hero ---------------------------------------------------------

/** A purely decorative, data-free dashboard mock that sells the Data app. */
function HeroMock() {
    return (
        <div className="relative rounded-2xl border border-card-border bg-card p-4">
            {/* window chrome */}
            <div className="mb-4 flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-muted" />
                <span className="h-2.5 w-2.5 rounded-full bg-muted" />
                <span className="h-2.5 w-2.5 rounded-full bg-muted" />
                <span className="ml-3 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    Denver, CO · 142 transactions
                </span>
            </div>

            <div className="grid grid-cols-3 gap-3">
                {/* property map preview */}
                <MiniMap className="col-span-2 h-44" />

                {/* stat tiles */}
                <div className="col-span-1 flex flex-col gap-3">
                    <div className="rounded-xl border border-border bg-background p-3">
                        <p className="text-xs text-muted-foreground">Median ARV</p>
                        <p className="text-lg font-bold text-foreground">$486K</p>
                    </div>
                    <div className="rounded-xl border border-border bg-background p-3">
                        <p className="text-xs text-muted-foreground">Avg. Spread</p>
                        <p className="text-lg font-bold text-spread-positive">+18.4%</p>
                    </div>
                </div>
            </div>

            {/* mini bar chart */}
            <div className="mt-3 flex h-20 items-end gap-2 rounded-xl border border-border bg-background p-3">
                {[40, 65, 50, 80, 58, 72, 90, 48, 68].map((h, i) => (
                    <div
                        key={i}
                        className="flex-1 rounded-sm bg-primary/70"
                        style={{ height: `${h}%` }}
                    />
                ))}
            </div>
        </div>
    );
}

function Hero() {
    return (
        <section className="relative overflow-hidden">
            {/* decorative brand glow */}
            <div className="pointer-events-none absolute -top-32 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />

            <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 py-16 lg:grid-cols-2 lg:py-24">
                <div>
                    <Pill>
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                        Now live across 6 markets
                    </Pill>

                    <h1 className="mt-5 text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl lg:text-5xl">
                        The complete platform for{' '}
                        <span className="text-primary">real estate investors</span>
                    </h1>

                    <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground lg:text-lg">
                        Browse live transaction data, post and discover exclusive deals, build your
                        vendor network, and connect with the community — four tools, one
                        membership.
                    </p>

                    <div className="mt-8 flex flex-wrap items-center gap-3">
                        <a href="#features" className={btnPrimary}>
                            Explore the platform
                            <ArrowRight className="h-4 w-4" />
                        </a>
                        <a href="#" className={btnOutline}>
                            View live deals
                        </a>
                    </div>

                    <div className="mt-10 flex flex-wrap gap-x-8 gap-y-4">
                        <StatItem value={6} label="Active markets" />
                        <StatItem value={4} label="Integrated tools" />
                        <div>
                            <p className="flex items-center gap-2 text-2xl font-bold text-foreground">
                                <LiveDot />
                                Live
                            </p>
                            <p className="text-sm text-muted-foreground">Transaction data</p>
                        </div>
                    </div>
                </div>

                <div className="relative">
                    <HeroMock />
                </div>
            </div>
        </section>
    );
}

// ---- Section: markets strip ------------------------------------------------

function MarketsMarquee() {
    return (
        <section className="border-y border-border bg-card/40">
            <div className="mx-auto max-w-7xl px-6 py-8">
                {/* label on top */}
                <div className="mb-5 flex items-center justify-center gap-2">
                    <LiveDot />
                    <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        Live data in
                    </span>
                </div>

                {/* revolving marquee — duplicated track loops seamlessly, pauses on hover */}
                <div
                    className="group relative overflow-hidden"
                    style={{
                        maskImage:
                            'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
                        WebkitMaskImage:
                            'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
                    }}
                >
                    <div className="arv-marquee-track flex w-max gap-3 group-hover:[animation-play-state:paused]">
                        {[...markets, ...markets].map((market, i) => (
                            <span
                                key={`${market}-${i}`}
                                aria-hidden={i >= markets.length}
                                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-foreground"
                            >
                                <MapPin className="h-3.5 w-3.5 text-primary" />
                                {market}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}

// ---- Section: the four apps (bento grid) -----------------------------------

/** Large tile: the Data app, showcasing its five views. */
function DataTile() {
    return (
        <div className="flex flex-col rounded-2xl border border-card-border bg-card p-6 transition-transform duration-200 hover:-translate-y-1 lg:col-span-2">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                    <IconTile icon={BarChart3} tint="bg-primary/10 text-primary" />
                    <div>
                        <h3 className="text-lg font-semibold text-foreground">Data</h3>
                        <p className="text-sm text-muted-foreground">
                            Property intelligence platform
                        </p>
                    </div>
                </div>
                <Pill>Core</Pill>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                Explore SFR transaction data by market and slice it however you think. Filter by
                company, status, price, and location, then switch between five purpose-built views.
            </p>

            <div className="mt-5 grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {dataViews.map((view) => (
                    <div
                        key={view.label}
                        className="rounded-xl border border-border bg-background p-3 transition hover:border-primary/40"
                    >
                        <view.icon className="h-5 w-5 text-primary" />
                        <p className="mt-2 text-sm font-medium text-foreground">{view.label}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{view.desc}</p>
                    </div>
                ))}
            </div>

            <LearnMoreLink targetId="data" />
        </div>
    );
}

/** Compact tile used for Deals and Vendors. */
function AppTile({
    icon,
    tint,
    title,
    subtitle,
    description,
    bullets,
    learnMoreId,
}: {
    icon: typeof Map;
    tint: string;
    title: string;
    subtitle: string;
    description: string;
    bullets: string[];
    learnMoreId: string;
}) {
    return (
        <div className="flex flex-col rounded-2xl border border-card-border bg-card p-6 transition-transform duration-200 hover:-translate-y-1">
            <IconTile icon={icon} tint={tint} />
            <h3 className="mt-4 text-lg font-semibold text-foreground">{title}</h3>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p>
            <ul className="mt-4 space-y-2">
                {bullets.map((b) => (
                    <FeatureBullet key={b}>{b}</FeatureBullet>
                ))}
            </ul>
            <div className="mt-auto">
                <LearnMoreLink targetId={learnMoreId} />
            </div>
        </div>
    );
}

/** Large tile: the Mastermind app, with a faux community preview. */
function MastermindTile() {
    const channels = ['general', 'deals', 'denver-market', 'flips'];
    const messages = [
        {
            initials: 'JD',
            tint: 'bg-chart-3/15 text-chart-3',
            name: 'Jordan D.',
            text: 'Just closed the Denver duplex — thanks for the comps! 🔑',
            reaction: '🔥 4',
        },
        {
            initials: 'MR',
            tint: 'bg-chart-4/15 text-chart-4',
            name: 'Maria R.',
            text: 'Anyone have a trusted GC in Port St. Lucie?',
            reaction: '👍 2',
        },
    ];

    return (
        <div className="flex flex-col rounded-2xl border border-card-border bg-card p-6 transition-transform duration-200 hover:-translate-y-1 lg:col-span-2">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                    <IconTile icon={MessageSquare} tint="bg-chart-3/15 text-chart-3" />
                    <div>
                        <h3 className="text-lg font-semibold text-foreground">Mastermind</h3>
                        <p className="text-sm text-muted-foreground">Real-time investor community</p>
                    </div>
                </div>
                <Pill>Community</Pill>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                A Slack-style community built into the platform: topic channels, live messaging,
                @mentions, reactions, and pinned threads to keep deals and lessons in one place.
            </p>

            <div className="mt-5 grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
                {/* channel list */}
                <div className="rounded-xl border border-border bg-background p-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Channels
                    </p>
                    <ul className="space-y-1">
                        {channels.map((c, i) => (
                            <li
                                key={c}
                                className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-sm ${
                                    i === 0
                                        ? 'bg-accent font-medium text-foreground'
                                        : 'text-muted-foreground'
                                }`}
                            >
                                <Hash className="h-3.5 w-3.5" />
                                {c}
                            </li>
                        ))}
                    </ul>
                </div>

                {/* message preview */}
                <div className="space-y-3 rounded-xl border border-border bg-background p-3 sm:col-span-2">
                    {messages.map((m) => (
                        <div key={m.name} className="flex gap-3">
                            <div
                                className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ${m.tint}`}
                            >
                                {m.initials}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-foreground">{m.name}</p>
                                <p className="break-words text-sm text-muted-foreground">{m.text}</p>
                                <span className="mt-1 inline-flex items-center rounded-full border border-border bg-card px-2 py-0.5 text-xs text-muted-foreground">
                                    {m.reaction}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <LearnMoreLink targetId="mastermind" />
        </div>
    );
}

function Features() {
    return (
        <section id="features" className="mx-auto max-w-7xl px-6 py-20">
            <div className="mx-auto max-w-2xl text-center">
                <Pill>
                    <LayoutGrid className="h-3.5 w-3.5 text-primary" />
                    Everything in one place
                </Pill>
                <h2 className="mt-5 text-3xl font-bold tracking-tight text-foreground lg:text-4xl">
                    Four tools. One membership.
                </h2>
                <p className="mt-4 text-base text-muted-foreground">
                    Each ARV Finance membership unlocks four connected products built for the way
                    investors actually work.
                </p>
            </div>

            <Reveal className="mt-12 grid grid-cols-1 gap-5 lg:grid-cols-3">
                <DataTile />
                <AppTile
                    icon={Handshake}
                    tint="bg-chart-4/15 text-chart-4"
                    title="Deals"
                    subtitle="Exclusive deal marketplace"
                    description="ARV clients post wholesale, agent, sold, and REO deals for the community to discover."
                    bullets={[
                        'Post exclusive off-market deals',
                        'Request contact info instantly',
                        'Submit offers directly',
                    ]}
                    learnMoreId="deals"
                />
                <AppTile
                    icon={Wrench}
                    tint="bg-chart-2/15 text-chart-2"
                    title="Vendors"
                    subtitle="Trusted vendor network"
                    description="Find and promote contractors, lenders, and service providers organized by trade."
                    bullets={[
                        'Browse vendors by category',
                        'Promote your own services',
                        'Community-vetted reviews',
                    ]}
                    learnMoreId="vendors"
                />
                <MastermindTile />
            </Reveal>
        </section>
    );
}

// ---- Detail sections: one standard explainer per app -----------------------

/**
 * Standard alternating explainer block (eyebrow → title → copy → bullets → CTA,
 * paired with a visual). Each app's "Learn more" in the bento grid scrolls here.
 */
function FeatureSection({
    id,
    icon,
    eyebrow,
    accentText,
    accentTile,
    title,
    description,
    bullets,
    cta,
    reverse = false,
    visual,
}: {
    id: string;
    icon: typeof Map;
    eyebrow: string;
    accentText: string;
    accentTile: string;
    title: string;
    description: string;
    bullets: string[];
    cta: string;
    reverse?: boolean;
    visual: React.ReactNode;
}) {
    return (
        <section id={id} className="scroll-mt-20 border-t border-border">
            <div className="mx-auto max-w-7xl px-6 py-20">
                <Reveal className="grid items-center gap-12 lg:grid-cols-2">
                    <div className={reverse ? 'lg:order-2' : ''}>
                        <div className="inline-flex items-center gap-3">
                            <IconTile icon={icon} tint={accentTile} />
                            <span
                                className={`text-sm font-semibold uppercase tracking-wide ${accentText}`}
                            >
                                {eyebrow}
                            </span>
                        </div>
                        <h2 className="mt-5 text-3xl font-bold tracking-tight text-foreground lg:text-4xl">
                            {title}
                        </h2>
                        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                            {description}
                        </p>
                        <ul className="mt-6 space-y-3">
                            {bullets.map((b) => (
                                <FeatureBullet key={b}>{b}</FeatureBullet>
                            ))}
                        </ul>
                        <button type="button" className={`${btnPrimary} mt-8`}>
                            {cta}
                            <ArrowRight className="h-4 w-4" />
                        </button>
                    </div>
                    <div className={reverse ? 'lg:order-1' : ''}>{visual}</div>
                </Reveal>
            </div>
        </section>
    );
}

const STATUS_BADGE_BG: Record<string, string> = {
    Renovating: 'bg-[#69C9E1]',
    Wholesale: 'bg-[#9333EA]',
    Sold: 'bg-[#FF0000]',
    'On Market': 'bg-[#22C55E]',
};

/** Property status pill — mirrors the colored Badge variants on PropertyContent. */
function StatusBadge({ label }: { label: string }) {
    return (
        <span
            className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold text-primary-foreground ${STATUS_BADGE_BG[label] ?? 'bg-muted'}`}
        >
            {label}
        </span>
    );
}

/** Compact property card for the grid preview (a trimmed-down PropertyCard). */
function PropertyMiniCard({
    price,
    address,
    city,
    beds,
    baths,
    sqft,
    status,
}: {
    price: string;
    address: string;
    city: string;
    beds: number;
    baths: number;
    sqft: string;
    status: string;
}) {
    return (
        <div className="overflow-hidden rounded-lg border border-card-border bg-card">
            <div className="relative aspect-[4/3] bg-muted">
                <Home className="absolute inset-0 m-auto h-7 w-7 text-muted-foreground/30" />
                <div className="absolute right-2 top-2">
                    <StatusBadge label={status} />
                </div>
            </div>
            <div className="p-2.5">
                <p className="text-base font-bold leading-none text-foreground">{price}</p>
                <p className="mt-1.5 truncate text-sm font-medium text-foreground">{address}</p>
                <p className="truncate text-xs text-muted-foreground">{city}</p>
                <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                        <Bed className="h-3.5 w-3.5" />
                        {beds}
                    </span>
                    <span className="flex items-center gap-1">
                        <Bath className="h-3.5 w-3.5" />
                        {baths}
                    </span>
                    <span className="flex items-center gap-1">
                        <Maximize2 className="h-3.5 w-3.5" />
                        {sqft}
                    </span>
                </div>
            </div>
        </div>
    );
}

/** Grid view preview — visual cards color-coded by status. */
function GridPreview() {
    return (
        <div className="grid h-72 grid-cols-2 gap-3 overflow-hidden sm:grid-cols-3">
            <PropertyMiniCard
                price="$420,000"
                address="1420 Pearl St"
                city="Denver, CO"
                beds={3}
                baths={2}
                sqft="1,450"
                status="Renovating"
            />
            <PropertyMiniCard
                price="$512,000"
                address="88 Larimer Ave"
                city="Denver, CO"
                beds={4}
                baths={3}
                sqft="2,100"
                status="Wholesale"
            />
            <PropertyMiniCard
                price="$398,000"
                address="305 Federal Blvd"
                city="Denver, CO"
                beds={3}
                baths={2}
                sqft="1,320"
                status="Sold"
            />
        </div>
    );
}

/** Table view preview — dense, sortable-looking rows with status dots. */
function TablePreview() {
    const rows = [
        { dot: '#69C9E1', address: '1420 Pearl St', city: 'Denver', price: '$420,000' },
        { dot: '#FF0000', address: '88 Larimer Ave', city: 'Denver', price: '$512,000' },
        { dot: '#22C55E', address: '305 Federal Blvd', city: 'Denver', price: '$398,000' },
        { dot: '#9333EA', address: '77 Speer Blvd', city: 'Denver', price: '$540,000' },
        { dot: '#69C9E1', address: '210 Wynkoop St', city: 'Denver', price: '$465,000' },
    ];
    return (
        <div className="h-72 overflow-hidden rounded-xl border border-border bg-card">
            <div className="grid grid-cols-12 gap-2 border-b border-border bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                <span className="col-span-1" />
                <span className="col-span-5">Address</span>
                <span className="col-span-3">City</span>
                <span className="col-span-3 text-right">Purchase Price</span>
            </div>
            {rows.map((r) => (
                <div
                    key={r.address}
                    className="grid grid-cols-12 items-center gap-2 border-b border-border px-3 py-2.5 text-sm last:border-0"
                >
                    <span className="col-span-1">
                        <span
                            className="block h-2 w-2 rounded-full"
                            style={{ backgroundColor: r.dot }}
                        />
                    </span>
                    <span className="col-span-5 truncate font-medium text-foreground">
                        {r.address}
                    </span>
                    <span className="col-span-3 truncate text-muted-foreground">{r.city}</span>
                    <span className="col-span-3 text-right font-semibold text-foreground">
                        {r.price}
                    </span>
                </div>
            ))}
        </div>
    );
}

/** Buyers feed preview — recently acquired properties and the buying company. */
function BuyersPreview() {
    const rows = [
        { address: '1420 Pearl St', city: 'Denver, CO', company: 'Summit Holdings', price: '$420,000', date: 'Jun 12' },
        { address: '88 Larimer Ave', city: 'Denver, CO', company: 'Mile High REI', price: '$512,000', date: 'Jun 9' },
        { address: '305 Federal Blvd', city: 'Denver, CO', company: 'Front Range Capital', price: '$398,000', date: 'Jun 4' },
    ];
    return (
        <div className="flex h-72 flex-col gap-3 overflow-hidden">
            {rows.map((r) => (
                <div
                    key={r.address}
                    className="flex items-center gap-3 rounded-xl border border-card-border bg-card p-3"
                >
                    <div className="flex h-14 w-16 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Home className="h-6 w-6 text-muted-foreground/30" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">{r.address}</p>
                        <p className="truncate text-xs text-muted-foreground">{r.city}</p>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Building2 className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
                            <span className="truncate">
                                Acquired by{' '}
                                <span className="font-medium text-primary">{r.company}</span>
                            </span>
                        </p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                        <p className="text-base font-bold text-foreground">{r.price}</p>
                        <p className="text-xs text-muted-foreground">{r.date}</p>
                    </div>
                </div>
            ))}
        </div>
    );
}

/** Wholesale feed preview — assigned deals with their wholesale fee. */
function WholesalePreview() {
    const rows = [
        { address: '2210 Mariposa St', city: 'Denver, CO', fee: '+$24,000' },
        { address: '14 Galapago St', city: 'Denver, CO', fee: '+$18,500' },
        { address: '901 Bannock St', city: 'Denver, CO', fee: '+$31,200' },
    ];
    return (
        <div className="flex h-72 flex-col gap-3 overflow-hidden">
            {rows.map((r) => (
                <div
                    key={r.address}
                    className="flex items-center gap-3 rounded-xl border border-card-border bg-card p-3"
                >
                    <div className="flex h-14 w-16 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Home className="h-6 w-6 text-muted-foreground/30" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">{r.address}</p>
                        <p className="truncate text-xs text-muted-foreground">{r.city}</p>
                        <div className="mt-1">
                            <StatusBadge label="Wholesale" />
                        </div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                        <p className="text-xs text-muted-foreground">Wholesale Fee</p>
                        <p className="text-base font-bold text-spread-positive">{r.fee}</p>
                    </div>
                </div>
            ))}
        </div>
    );
}

type DataViewKey = 'map' | 'grid' | 'table' | 'buyers' | 'wholesale';

const dataViewTabs: { key: DataViewKey; label: string; desc: string }[] = [
    {
        key: 'map',
        label: 'Map',
        desc: 'Every transaction plotted across the market — spot where deals are clustering at a glance.',
    },
    {
        key: 'grid',
        label: 'Grid',
        desc: 'Browse properties as visual cards, color-coded by status: renovating, wholesale, on-market, and sold.',
    },
    {
        key: 'table',
        label: 'Table',
        desc: 'A dense, sortable table of every data point — price, location, specs, company, and dates.',
    },
    {
        key: 'buyers',
        label: 'Buyers',
        desc: 'See recently acquired properties and the companies actively buying in your market.',
    },
    {
        key: 'wholesale',
        label: 'Wholesale',
        desc: 'Surface fresh wholesale opportunities the moment they are assigned.',
    },
];

/** Data app visual: clickable view tabs that each swap in a matching preview + description. */
function DataVisual() {
    const [active, setActive] = useState<DataViewKey>('map');
    const activeTab = dataViewTabs.find((t) => t.key === active) ?? dataViewTabs[0];

    return (
        <div className="rounded-2xl border border-card-border bg-card p-4">
            {/* clickable view switcher */}
            <div className="flex flex-wrap gap-1.5">
                {dataViewTabs.map((t) => (
                    <button
                        key={t.key}
                        type="button"
                        onClick={() => setActive(t.key)}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            active === t.key
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* description of the selected view */}
            <p className="mt-3 text-sm text-muted-foreground">{activeTab.desc}</p>

            {/* preview — all views share the same height so switching never shifts the layout */}
            <div className="mt-3">
                {active === 'map' && <MiniMap className="h-72" showLegend />}
                {active === 'grid' && <GridPreview />}
                {active === 'table' && <TablePreview />}
                {active === 'buyers' && <BuyersPreview />}
                {active === 'wholesale' && <WholesalePreview />}
            </div>
        </div>
    );
}

/**
 * Deals app visual: a clean, custom deal card (a mockup of a possible redesign —
 * intentionally NOT a clone of the current DealCard2). Image banner with deal-type
 * badges, a financial highlight strip, and a single clear call to action.
 */
function DealVisual() {
    return (
        <div className="overflow-hidden rounded-xl border border-card-border bg-card">
            {/* image banner with deal-type badges */}
            <div className="relative h-48 bg-muted">
                <Home className="absolute inset-0 m-auto h-10 w-10 text-muted-foreground/30" />
                <div className="absolute left-3 top-3 flex items-center gap-1.5">
                    <span className="inline-flex items-center rounded-md bg-white px-2.5 py-0.5 text-xs font-semibold text-black">
                        ★ ARV Exclusive
                    </span>
                    {/* the documented "Wholesale" deal-type brand color (#9333EA) */}
                    <span className="inline-flex items-center rounded-md bg-[#9333EA] px-3 py-0.5 text-xs font-semibold text-primary-foreground">
                        Wholesale
                    </span>
                </div>
            </div>

            {/* body */}
            <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="truncate text-lg font-semibold text-foreground">
                            2210 Mariposa St
                        </p>
                        <p className="text-sm text-muted-foreground">Denver, CO 80211</p>
                    </div>
                    <span className="whitespace-nowrap text-xs text-muted-foreground">
                        Posted Jun 18
                    </span>
                </div>

                {/* specs */}
                <div className="mt-3 flex items-center gap-4 text-sm text-foreground">
                    <span className="flex items-center gap-1.5">
                        <Bed className="h-4 w-4 text-muted-foreground" />3 bd
                    </span>
                    <span className="flex items-center gap-1.5">
                        <Bath className="h-4 w-4 text-muted-foreground" />2 ba
                    </span>
                    <span className="flex items-center gap-1.5">
                        <Maximize2 className="h-4 w-4 text-muted-foreground" />
                        1,450 sqft
                    </span>
                </div>

                {/* financial highlight strip */}
                <div className="mt-4 grid grid-cols-3 divide-x divide-border rounded-lg border border-border bg-background">
                    <div className="px-3 py-2.5 text-center">
                        <p className="text-xs text-muted-foreground">Price</p>
                        <p className="text-lg font-bold text-foreground">$345K</p>
                    </div>
                    <div className="px-3 py-2.5 text-center">
                        <p className="text-xs text-muted-foreground">Potential ARV</p>
                        <p className="text-lg font-bold text-spread-positive">$489K</p>
                    </div>
                    <div className="px-3 py-2.5 text-center">
                        <p className="text-xs text-muted-foreground">Est. Budget</p>
                        <p className="text-lg font-bold text-foreground">$62K</p>
                    </div>
                </div>

                {/* single clear CTA */}
                <button type="button" className={`${btnPrimary} mt-4 w-full`}>
                    <Phone className="h-4 w-4" />
                    Request More Info
                </button>
            </div>
        </div>
    );
}

/** Vendors app visual: trimmed vendor cards — icon, name, description, and tags only. */
function VendorVisual() {
    const vendors = [
        {
            name: 'BuildCo Renovations',
            description: 'Full-service GC for flips & rehabs',
            categories: ['General Contractor', 'Roofing'],
        },
        {
            name: 'LendFast Capital',
            description: 'Hard money & bridge loans, 48-hour close',
            categories: ['Hard Money Lender'],
        },
        {
            name: 'Summit Inspections',
            description: 'Same-week inspections across the metro',
            categories: ['Inspector'],
        },
        {
            name: 'ClearTitle Co.',
            description: 'Investor-friendly title & escrow services',
            categories: ['Title & Escrow'],
        },
    ];
    return (
        <div className="space-y-3">
            {vendors.map((v) => (
                <div
                    key={v.name}
                    className="min-w-0 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent"
                >
                    <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
                            <CircleUser className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <h3 className="text-base font-semibold leading-tight text-foreground">
                                {v.name}
                            </h3>
                            <p className="line-clamp-1 text-sm leading-relaxed text-muted-foreground">
                                {v.description}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1">
                                {v.categories.map((c) => (
                                    <span
                                        key={c}
                                        className="inline-flex items-center rounded-md bg-secondary px-1.5 py-0 text-xs font-semibold text-secondary-foreground"
                                    >
                                        {c}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

/** A formatting button in the composer toolbar (mirrors ComposerToolbar's buttons). */
function ToolbarButton({ icon: Icon }: { icon: typeof Map }) {
    return (
        <span className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground">
            <Icon className="h-3.5 w-3.5" />
        </span>
    );
}

/** Mastermind app visual: real ChannelHeader + messages + a rich-text composer. */
function MastermindVisual() {
    const messages = [
        {
            initials: 'JD',
            tint: 'bg-chart-3/15 text-chart-3',
            name: 'Jordan D.',
            time: '9:41 AM',
            text: 'Closed the Denver duplex this morning 🔑',
            reaction: '🔥 6',
        },
        {
            initials: 'AK',
            tint: 'bg-primary/15 text-primary',
            name: 'Alex K.',
            time: '9:43 AM',
            text: 'Huge! What was the final spread?',
            reaction: '',
        },
        {
            initials: 'MR',
            tint: 'bg-chart-4/15 text-chart-4',
            name: 'Maria R.',
            time: '9:45 AM',
            text: 'Anyone have a trusted GC in Port St. Lucie?',
            reaction: '👍 3',
        },
    ];
    return (
        <div className="overflow-hidden rounded-2xl border border-card-border bg-card">
            {/* channel header — mirrors ChannelHeader (name + divider + description) */}
            <div className="flex min-h-[52px] items-center gap-2 border-b border-border px-4 py-3">
                <Hash className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                <span className="flex-shrink-0 text-base font-semibold text-foreground">general</span>
                <span className="hidden h-4 w-px flex-shrink-0 bg-border min-[420px]:block" />
                <span className="hidden min-w-0 flex-1 truncate text-sm text-muted-foreground min-[420px]:block">
                    Company-wide chat for the whole community
                </span>
            </div>

            <div className="space-y-4 px-4 py-4">
                {messages.map((m) => (
                    <div key={m.name} className="flex gap-3">
                        <div
                            className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ${m.tint}`}
                        >
                            {m.initials}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-sm">
                                <span className="font-medium text-foreground">{m.name}</span>{' '}
                                <span className="text-xs text-muted-foreground">{m.time}</span>
                            </p>
                            <p className="break-words text-sm text-muted-foreground">{m.text}</p>
                            {m.reaction && (
                                <span className="mt-1 inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground">
                                    {m.reaction}
                                </span>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* composer — message field + rich-text toolbar (Bold/Italic/Underline | Link) */}
            <div className="px-3 pb-3">
                <div className="rounded-md border border-input bg-background">
                    <p className="px-3 pb-1 pt-2.5 text-sm text-muted-foreground">Message #general</p>
                    <div className="flex items-center gap-0.5 border-t border-border/50 px-2 pb-1.5 pt-1">
                        <ToolbarButton icon={Bold} />
                        <ToolbarButton icon={Italic} />
                        <ToolbarButton icon={Underline} />
                        <span className="mx-0.5 h-3.5 w-px flex-shrink-0 bg-border" />
                        <ToolbarButton icon={Link2} />
                        <span className="ml-auto flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
                            <Send className="h-3.5 w-3.5" />
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

function AppSections() {
    return (
        <>
            <FeatureSection
                id="data"
                icon={BarChart3}
                eyebrow="Data"
                accentText="text-primary"
                accentTile="bg-primary/10 text-primary"
                title="Every transaction, the way you want to see it"
                description="Browse single-family transaction data across six major markets. Filter by company, status, price, and location — then switch views without losing your place."
                bullets={[
                    'Map View — plot transactions on an interactive map',
                    'Grid & Table views — scan cards or sort dense data',
                    'Buyers Feed — track who is actively acquiring',
                    'Wholesale Feed — surface off-market opportunities first',
                ]}
                cta="Open the data app"
                visual={<DataVisual />}
            />
            <FeatureSection
                id="deals"
                icon={Handshake}
                eyebrow="Deals"
                accentText="text-chart-4"
                accentTile="bg-chart-4/15 text-chart-4"
                title="Exclusive deals, straight from the source"
                description="ARV clients post wholesale, agent, sold, and REO deals for the community. Find your next acquisition and act on it in just a few clicks."
                bullets={[
                    'Post wholesale, agent, sold, and REO deals',
                    'Filter by location, price, and deal type',
                    'Request seller contact info instantly',
                    'Submit offers directly through the platform',
                ]}
                cta="Browse live deals"
                reverse
                visual={<DealVisual />}
            />
            <FeatureSection
                id="vendors"
                icon={Wrench}
                eyebrow="Vendors"
                accentText="text-chart-2"
                accentTile="bg-chart-2/15 text-chart-2"
                title="Build your team with vendors you can trust"
                description="A community-driven directory of contractors, lenders, and service providers — organized by trade so you can staff your next project fast."
                bullets={[
                    'Browse vendors by trade category',
                    'Promote your own services to the community',
                    'Follow community posts and recommendations',
                    'Connect with vendors in your market',
                ]}
                cta="Explore the directory"
                visual={<VendorVisual />}
            />
            <FeatureSection
                id="mastermind"
                icon={MessageSquare}
                eyebrow="Mastermind"
                accentText="text-chart-3"
                accentTile="bg-chart-3/15 text-chart-3"
                title="A community that moves as fast as you do"
                description="A real-time, Slack-style space built into the platform. Share wins, ask questions, and stay close to the deals — all in topic-based channels."
                bullets={[
                    'Topic channels for markets and strategies',
                    'Live messaging with @mentions and reactions',
                    'Pin important threads and resources',
                    'In-app notifications keep you in the loop',
                ]}
                cta="Enter the mastermind"
                reverse
                visual={<MastermindVisual />}
            />
        </>
    );
}

// ---- Interactive sections (pizzazz) ----------------------------------------

function formatUSD(n: number) {
    return `$${Math.round(n).toLocaleString()}`;
}

/** Drag-to-reveal "Before → After Repair Value" comparison — the heart of ARV. */
function ArvRevealSlider() {
    const trackRef = useRef<HTMLDivElement>(null);
    const draggingRef = useRef(false);
    const [pos, setPos] = useState(55);

    const updateFromX = (clientX: number) => {
        const el = trackRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const next = ((clientX - rect.left) / rect.width) * 100;
        setPos(Math.max(0, Math.min(100, next)));
    };

    return (
        <section className="mx-auto max-w-7xl px-6 py-20">
            <Reveal>
                <div className="mx-auto max-w-2xl text-center">
                    <Pill>
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                        What ARV means
                    </Pill>
                    <h2 className="mt-5 text-3xl font-bold tracking-tight text-foreground lg:text-4xl">
                        See the After Repair Value
                    </h2>
                    <p className="mt-4 text-base text-muted-foreground">
                        Drag the handle to watch a deal go from its as-is purchase price to its full
                        repaired value.
                    </p>
                </div>

                <div
                    ref={trackRef}
                    role="slider"
                    tabIndex={0}
                    aria-label="Reveal before and after repair value"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(pos)}
                    onPointerDown={(e) => {
                        draggingRef.current = true;
                        e.currentTarget.setPointerCapture(e.pointerId);
                        updateFromX(e.clientX);
                    }}
                    onPointerMove={(e) => {
                        if (draggingRef.current) updateFromX(e.clientX);
                    }}
                    onPointerUp={() => {
                        draggingRef.current = false;
                    }}
                    onPointerCancel={() => {
                        draggingRef.current = false;
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'ArrowLeft') setPos((p) => Math.max(0, p - 4));
                        if (e.key === 'ArrowRight') setPos((p) => Math.min(100, p + 4));
                    }}
                    className="relative mx-auto mt-10 h-72 max-w-3xl cursor-ew-resize select-none overflow-hidden rounded-2xl border border-card-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    {/* AFTER layer — full base */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-primary/10">
                        <Home className="h-12 w-12 text-primary" />
                        <span className="inline-flex items-center rounded-md bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">
                            After Repair
                        </span>
                        <p className="mt-1 text-sm text-muted-foreground">After Repair Value</p>
                        <p className="text-2xl font-bold text-foreground">$489,000</p>
                        <p className="text-sm font-semibold text-spread-positive">+$179K uplift</p>
                    </div>

                    {/* BEFORE layer — clipped to the left of the handle */}
                    <div
                        className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-muted"
                        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
                    >
                        <Home className="h-12 w-12 text-muted-foreground/40" />
                        <span className="inline-flex items-center rounded-md bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground">
                            Before
                        </span>
                        <p className="mt-1 text-sm text-muted-foreground">As-Is Purchase</p>
                        <p className="text-2xl font-bold text-foreground">$310,000</p>
                        <p className="text-sm text-muted-foreground">Needs full rehab</p>
                    </div>

                    {/* draggable handle */}
                    <div
                        className="pointer-events-none absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 bg-primary"
                        style={{ left: `${pos}%` }}
                    >
                        <div className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-primary bg-background text-primary">
                            <ChevronLeft className="-mr-1 h-4 w-4" />
                            <ChevronRight className="-ml-1 h-4 w-4" />
                        </div>
                    </div>
                </div>
            </Reveal>
        </section>
    );
}

/** Live deal-underwriting calculator — drag the sliders, watch profit update. */
function DealCalculator() {
    const [purchase, setPurchase] = useState(310000);
    const [rehab, setRehab] = useState(62000);
    const [arv, setArv] = useState(489000);

    const invested = purchase + rehab;
    const profit = arv - invested;
    const positive = profit >= 0;
    const roi = invested > 0 ? (profit / invested) * 100 : 0;
    const investedW = arv > 0 ? Math.min((invested / arv) * 100, 100) : 100;
    const profitW = positive ? Math.max(0, 100 - investedW) : 0;

    const sliders = [
        { label: 'Purchase Price', value: purchase, set: setPurchase, min: 100000, max: 800000, step: 5000 },
        { label: 'Rehab Budget', value: rehab, set: setRehab, min: 0, max: 250000, step: 1000 },
        { label: 'After Repair Value', value: arv, set: setArv, min: 100000, max: 1200000, step: 5000 },
    ];

    return (
        <section className="mx-auto max-w-7xl px-6 py-20">
            <Reveal>
                <div className="mx-auto max-w-2xl text-center">
                    <Pill>
                        <Calculator className="h-3.5 w-3.5 text-primary" />
                        Run the numbers
                    </Pill>
                    <h2 className="mt-5 text-3xl font-bold tracking-tight text-foreground lg:text-4xl">
                        Underwrite a deal in seconds
                    </h2>
                    <p className="mt-4 text-base text-muted-foreground">
                        Drag the sliders and watch your projected profit update live.
                    </p>
                </div>

                <div className="mx-auto mt-10 grid max-w-4xl gap-8 rounded-2xl border border-card-border bg-card p-6 lg:grid-cols-2 lg:p-8">
                    <div className="flex flex-col justify-center gap-6">
                        {sliders.map((s) => (
                            <div key={s.label}>
                                <div className="mb-2 flex items-center justify-between">
                                    <label className="text-sm font-medium text-foreground">
                                        {s.label}
                                    </label>
                                    <span className="text-sm font-bold text-foreground">
                                        {formatUSD(s.value)}
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    className="arv-range"
                                    min={s.min}
                                    max={s.max}
                                    step={s.step}
                                    value={s.value}
                                    onChange={(e) => s.set(Number(e.target.value))}
                                    aria-label={s.label}
                                />
                            </div>
                        ))}
                    </div>

                    <div className="flex flex-col justify-center rounded-xl border border-border bg-background p-6 text-center">
                        <p className="text-sm text-muted-foreground">Projected Profit</p>
                        <p
                            className={`mt-1 text-4xl font-bold ${
                                positive ? 'text-spread-positive' : 'text-spread-negative'
                            }`}
                        >
                            {positive ? '' : '−'}
                            {formatUSD(Math.abs(profit))}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {roi >= 0 ? '+' : '−'}
                            {Math.abs(roi).toFixed(1)}% ROI · {formatUSD(invested)} in
                        </p>
                        <div className="mt-5 flex h-3 w-full overflow-hidden rounded-full bg-muted">
                            <div className="bg-muted-foreground/40" style={{ width: `${investedW}%` }} />
                            <div className="bg-spread-positive" style={{ width: `${profitW}%` }} />
                        </div>
                        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                            <span>Invested</span>
                            <span>ARV {formatUSD(arv)}</span>
                        </div>
                    </div>
                </div>
            </Reveal>
        </section>
    );
}

/** Auto-rotating testimonial carousel — each quote names one of the four tools. */
function Testimonials() {
    const quotes = [
        {
            quote: 'The buyers feed showed me three active acquirers in my zip the week I joined — I closed my first wholesale deal 11 days later.',
            name: 'Jordan D.',
            role: 'Wholesaler · Denver',
            initials: 'JD',
            tint: 'bg-chart-3/15 text-chart-3',
        },
        {
            quote: 'Between the deal marketplace and the vendor directory, I underwrote and staffed an entire flip without leaving the platform.',
            name: 'Maria R.',
            role: 'Flipper · Miami',
            initials: 'MR',
            tint: 'bg-chart-4/15 text-chart-4',
        },
        {
            quote: 'The Mastermind community is the part I did not know I needed — real operators sharing real numbers every single day.',
            name: 'Alex K.',
            role: 'Buy-and-hold · San Diego',
            initials: 'AK',
            tint: 'bg-primary/15 text-primary',
        },
    ];
    const [index, setIndex] = useState(0);
    const [paused, setPaused] = useState(false);

    useEffect(() => {
        if (paused || prefersReducedMotion()) return;
        const id = setInterval(() => setIndex((p) => (p + 1) % quotes.length), 5000);
        return () => clearInterval(id);
    }, [paused, quotes.length]);

    const active = quotes[index];

    return (
        <section className="mx-auto max-w-3xl px-6 py-20 text-center">
            <Reveal>
                <div className="flex justify-center">
                    <Pill>
                        <Star className="h-3.5 w-3.5 text-primary" />
                        Loved by investors
                    </Pill>
                </div>

                <div
                    onMouseEnter={() => setPaused(true)}
                    onMouseLeave={() => setPaused(false)}
                    className="mt-6 rounded-2xl border border-card-border bg-card p-8"
                >
                    <div className="flex justify-center gap-0.5 text-primary">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <Star key={i} className="h-4 w-4 fill-current" />
                        ))}
                    </div>

                    <div key={index} className="arv-fade-in">
                        <p className="mt-5 text-lg font-medium leading-relaxed text-foreground lg:text-xl">
                            “{active.quote}”
                        </p>
                        <div className="mt-6 flex items-center justify-center gap-3">
                            <div
                                className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold ${active.tint}`}
                            >
                                {active.initials}
                            </div>
                            <div className="text-left">
                                <p className="text-sm font-semibold text-foreground">{active.name}</p>
                                <p className="text-xs text-muted-foreground">{active.role}</p>
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 flex items-center justify-center gap-2">
                        {quotes.map((_, i) => (
                            <button
                                key={i}
                                type="button"
                                onClick={() => setIndex(i)}
                                aria-label={`Show testimonial ${i + 1}`}
                                className={`h-2 rounded-full transition-all ${
                                    i === index ? 'w-6 bg-primary' : 'w-2 bg-border hover:bg-muted-foreground'
                                }`}
                            />
                        ))}
                    </div>
                </div>
            </Reveal>
        </section>
    );
}

// ---- Section: closing CTA --------------------------------------------------

function ClosingCTA() {
    return (
        <Reveal className="mx-auto max-w-7xl px-6 pb-20">
            <div className="relative overflow-hidden rounded-2xl border border-card-border bg-card px-6 py-14 text-center">
                <div className="pointer-events-none absolute -bottom-24 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
                <div className="relative">
                    <h2 className="text-3xl font-bold tracking-tight text-foreground lg:text-4xl">
                        Ready to find your next deal?
                    </h2>
                    <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground">
                        Join investors using ARV Finance to source, analyze, and close across six
                        major markets.
                    </p>
                    <div className="mt-8 flex flex-wrap justify-center gap-3">
                        <a href="#" className={btnPrimary}>
                            Get started free
                            <ArrowRight className="h-4 w-4" />
                        </a>
                        <a href="#" className={btnOutline}>
                            Talk to our team
                        </a>
                    </div>
                </div>
            </div>
        </Reveal>
    );
}

// ---- Section: footer -------------------------------------------------------

function Footer() {
    const groups = [
        { title: 'Product', items: ['Data', 'Deals', 'Vendors', 'Mastermind'] },
        { title: 'Company', items: ['About', 'Careers', 'Contact'] },
        { title: 'Legal', items: ['Privacy', 'Terms'] },
    ];
    return (
        <footer className="border-t border-border">
            <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-6 gap-y-10 px-6 py-12 lg:grid-cols-4">
                <div className="col-span-2 lg:col-span-1">
                    <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                            <Building2 className="h-5 w-5" />
                        </div>
                        <span className="text-base font-semibold text-foreground">ARV Finance</span>
                    </div>
                    <p className="mt-3 max-w-xs text-sm text-muted-foreground">
                        Real estate investing intelligence for serious operators.
                    </p>
                </div>
                {groups.map((group) => (
                    <div key={group.title}>
                        <p className="text-sm font-semibold text-foreground">{group.title}</p>
                        <ul className="mt-3 space-y-2">
                            {group.items.map((item) => (
                                <li key={item}>
                                    <a
                                        href="#"
                                        className="text-sm text-muted-foreground transition hover:text-foreground"
                                    >
                                        {item}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
            <div className="border-t border-border">
                <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-6 py-5 text-xs text-muted-foreground sm:flex-row">
                    <span>© {new Date().getFullYear()} ARV Finance. All rights reserved.</span>
                    <span className="flex items-center gap-1.5">
                        <Tag className="h-3.5 w-3.5" />
                        Design prototype
                    </span>
                </div>
            </div>
        </footer>
    );
}

// ---- Page ------------------------------------------------------------------

export default function Example() {
    const [theme, setTheme] = useState<Theme>('dark');

    // Drive the `dark` class on <html> so both themes can be previewed.
    // Defaults to dark; the previous value is restored when leaving the page.
    useEffect(() => {
        const root = document.documentElement;
        const hadDark = root.classList.contains('dark');
        root.classList.toggle('dark', theme === 'dark');
        return () => {
            root.classList.toggle('dark', hadDark);
        };
    }, [theme]);

    return (
        <div className="min-h-screen bg-background font-sans text-foreground antialiased">
            <style>{pageStyles}</style>
            <NavBar theme={theme} onToggle={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))} />
            <main className="overflow-x-clip">
                <Hero />
                <MarketsMarquee />
                <ArvRevealSlider />
                <Features />
                <AppSections />
                <DealCalculator />
                <Testimonials />
                <ClosingCTA />
            </main>
            <Footer />
        </div>
    );
}
