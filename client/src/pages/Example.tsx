import { useEffect, useState } from 'react';
import {
    ArrowRight,
    BarChart3,
    Bath,
    Bed,
    Bold,
    Building2,
    Check,
    ChevronDown,
    CircleUser,
    Globe,
    Handshake,
    Hash,
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
    Sun,
    Table2,
    Tag,
    TrendingUp,
    Underline,
    Users,
    Wrench,
    X,
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

// ---- Section: top navigation -----------------------------------------------

function NavBar({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
    const links = ['Data', 'Deals', 'Vendors', 'Mastermind'];
    return (
        <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur">
            <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
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
                {/* faux map */}
                <div className="relative col-span-2 h-44 overflow-hidden rounded-xl border border-border bg-muted">
                    <div className="absolute inset-0 bg-[linear-gradient(hsl(var(--border))_1px,transparent_1px),linear-gradient(90deg,hsl(var(--border))_1px,transparent_1px)] bg-[size:22px_22px] opacity-60" />
                    <span className="absolute left-[22%] top-[34%] h-3 w-3 rounded-full bg-primary ring-4 ring-primary/20" />
                    <span className="absolute left-[58%] top-[58%] h-3 w-3 rounded-full bg-chart-4 ring-4 ring-chart-4/20" />
                    <span className="absolute left-[72%] top-[26%] h-3 w-3 rounded-full bg-chart-2 ring-4 ring-chart-2/20" />
                </div>

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

                    <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight text-foreground lg:text-5xl">
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
                        {[
                            { value: '6', label: 'Active markets' },
                            { value: '4', label: 'Integrated tools' },
                            { value: 'Live', label: 'Transaction data' },
                        ].map((stat) => (
                            <div key={stat.label}>
                                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                                <p className="text-sm text-muted-foreground">{stat.label}</p>
                            </div>
                        ))}
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

function MarketsStrip() {
    return (
        <section className="border-y border-border bg-card/40">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-6 py-6">
                <span className="text-sm font-medium text-muted-foreground">Live data in</span>
                {markets.map((market) => (
                    <span key={market} className="text-sm font-semibold text-foreground">
                        {market}
                    </span>
                ))}
            </div>
        </section>
    );
}

// ---- Section: the four apps (bento grid) -----------------------------------

/** Large tile: the Data app, showcasing its five views. */
function DataTile() {
    return (
        <div className="flex flex-col rounded-2xl border border-card-border bg-card p-6 lg:col-span-2">
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
        <div className="flex flex-col rounded-2xl border border-card-border bg-card p-6">
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
        <div className="flex flex-col rounded-2xl border border-card-border bg-card p-6 lg:col-span-2">
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
                            <div>
                                <p className="text-sm font-medium text-foreground">{m.name}</p>
                                <p className="text-sm text-muted-foreground">{m.text}</p>
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

            <div className="mt-12 grid grid-cols-1 gap-5 lg:grid-cols-3">
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
            </div>
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
                <div className="grid items-center gap-12 lg:grid-cols-2">
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
                </div>
            </div>
        </section>
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

/** Data app visual: the property map view with status-colored pins. */
function DataVisual() {
    const tabs = ['Map', 'Grid', 'Table', 'Buyers', 'Wholesale'];
    return (
        <div className="rounded-2xl border border-card-border bg-card p-4">
            {/* view switcher — the five Data views, Map active */}
            <div className="mb-3 flex flex-wrap gap-1.5">
                {tabs.map((t, i) => (
                    <span
                        key={t}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                            i === 0
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted text-muted-foreground'
                        }`}
                    >
                        {t}
                    </span>
                ))}
            </div>

            {/* schematic map: roads + parks/water blocks with real status pins on top */}
            <div className="relative h-72 overflow-hidden rounded-xl border border-border bg-muted">
                <div className="absolute left-0 top-0 h-24 w-28 bg-chart-2/15" />
                <div className="absolute bottom-0 right-0 h-28 w-40 bg-primary/15" />
                <div className="absolute inset-x-0 top-1/3 h-2 bg-background/70" />
                <div className="absolute inset-x-0 top-2/3 h-1.5 bg-background/60" />
                <div className="absolute inset-y-0 left-1/4 w-2 bg-background/70" />
                <div className="absolute inset-y-0 left-[68%] w-1.5 bg-background/60" />
                <div className="absolute -left-12 top-12 h-1.5 w-[150%] rotate-[14deg] bg-background/50" />

                {/* map control — mirrors the real "Clear Filters" button */}
                <div className="absolute left-3 top-3">
                    <span className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground">
                        <X className="h-3 w-3" />
                        Clear Filters
                    </span>
                </div>

                {/* status pins — colors match getIconForPin in PropertyMap */}
                <MapMarker color="#22C55E" className="left-[24%] top-[42%]" />
                <MapMarker color="#69C9E1" className="left-[46%] top-[30%]" />
                <MapMarker color="#9333EA" className="left-[60%] top-[60%]" />
                <MapMarker color="#FF0000" className="left-[80%] top-[44%]" />
                <MapMarker color="#FFA500" className="left-[37%] top-[70%]" />

                {/* legend */}
                <div className="absolute bottom-3 left-3 rounded-md border border-border bg-background/90 px-2.5 py-2 backdrop-blur">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <LegendDot color="#22C55E" label="On-market" />
                        <LegendDot color="#69C9E1" label="In-reno" />
                        <LegendDot color="#9333EA" label="Wholesale" />
                        <LegendDot color="#FF0000" label="Sold" />
                    </div>
                </div>
            </div>
        </div>
    );
}

/** Deals app visual: a faithful reproduction of a collapsed DealCard2. */
function DealVisual() {
    return (
        <div className="flex flex-col overflow-hidden rounded-xl border-2 border-border bg-card">
            <div className="flex flex-col md:flex-row">
                {/* street-view image area — Handshake placeholder when no photo */}
                <div className="relative h-56 w-full shrink-0 bg-muted md:h-auto md:w-56 md:self-stretch">
                    <Handshake className="absolute inset-0 m-auto h-8 w-8 text-muted-foreground/30" />
                    <div className="absolute left-2 top-2 flex items-center gap-1.5">
                        <span className="inline-flex items-center rounded-md bg-white px-2.5 py-0.5 text-xs font-semibold text-zinc-900">
                            ★ ARV Exclusive
                        </span>
                        {/* deal-type badge uses the documented "Wholesale" brand color (#9333EA) */}
                        <span
                            className="inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold text-white"
                            style={{ backgroundColor: '#9333EA' }}
                        >
                            Wholesale
                        </span>
                    </div>
                </div>

                {/* right content */}
                <div className="flex min-w-0 flex-1 flex-col gap-3 px-4 pb-2 pt-4 md:px-5">
                    {/* address + date + request button */}
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                            <p className="truncate text-base font-semibold leading-tight text-foreground">
                                2210 Mariposa St
                            </p>
                            <p className="deal-card-address mt-0.5">Denver, CO 80211</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                            <span className="whitespace-nowrap text-xs text-muted-foreground">
                                Jun 18
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
                                <Phone className="h-3.5 w-3.5" />
                                Request More Info
                            </span>
                        </div>
                    </div>

                    {/* specs row */}
                    <div className="flex items-center gap-4 text-base text-foreground">
                        <span className="flex items-center gap-1.5">
                            <Bed className="deal-card-icon" />3 bd
                        </span>
                        <span className="flex items-center gap-1.5">
                            <Bath className="deal-card-icon" />2 ba
                        </span>
                        <span className="flex items-center gap-1.5">
                            <Maximize2 className="deal-card-icon" />
                            1,450 sqft
                        </span>
                    </div>

                    {/* financials */}
                    <div className="grid w-full grid-cols-2 gap-x-6 gap-y-3 md:w-3/4">
                        <div className="flex flex-col">
                            <span className="deal-card-label">Purchase Price</span>
                            <span className="deal-card-value">$345,000</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="deal-card-label">Potential ARV</span>
                            <span className="deal-card-value text-spread-positive">$489,000</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="deal-card-label">Est. Budget</span>
                            <span className="deal-card-value">$62,000</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="deal-card-label">Showing</span>
                            <span className="deal-card-value">6/22 at 3:00 PM</span>
                        </div>
                    </div>

                    {/* view more affordance */}
                    <div className="flex select-none items-center justify-center gap-1 pt-1 text-sm text-muted-foreground">
                        <ChevronDown className="h-4 w-4" />
                        View More
                    </div>
                </div>
            </div>
        </div>
    );
}

/** Vendors app visual: real VendorCard reproductions stacked as a result list. */
function VendorVisual() {
    const vendors = [
        {
            name: 'BuildCo Renovations',
            description: 'Full-service GC for flips & rehabs',
            address: '1450 Wynkoop St',
            cityLine: 'Denver, CO 80202',
            phone: '(303) 555-0142',
            website: 'buildcoreno.com',
            categories: ['General Contractor', 'Roofing'],
        },
        {
            name: 'LendFast Capital',
            description: 'Hard money & bridge loans, 48-hour close',
            address: null,
            cityLine: 'Miami, FL 33101',
            phone: '(305) 555-0199',
            website: 'lendfast.io',
            categories: ['Hard Money Lender'],
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
                        </div>
                    </div>

                    <div className="mt-3 space-y-1">
                        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                            <MapPin className="mt-0.5 h-3 w-3 flex-shrink-0" />
                            <span className="leading-relaxed">
                                {v.address && <span className="block">{v.address}</span>}
                                <span className="block">{v.cityLine}</span>
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Phone className="h-3 w-3 flex-shrink-0" />
                            <span>{v.phone}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Globe className="h-3 w-3 flex-shrink-0" />
                            <span>{v.website}</span>
                        </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1">
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
                <span className="text-base font-semibold text-foreground">deals</span>
                <span className="mx-1 h-4 w-px flex-shrink-0 bg-border" />
                <span className="truncate text-sm text-muted-foreground">
                    Share and discuss live deals
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
                        <div>
                            <p className="text-sm">
                                <span className="font-medium text-foreground">{m.name}</span>{' '}
                                <span className="text-xs text-muted-foreground">{m.time}</span>
                            </p>
                            <p className="text-sm text-muted-foreground">{m.text}</p>
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
                    <p className="px-3 pb-1 pt-2.5 text-sm text-muted-foreground">Message #deals</p>
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

// ---- Section: closing CTA --------------------------------------------------

function ClosingCTA() {
    return (
        <section className="mx-auto max-w-7xl px-6 pb-20">
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
        </section>
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
            <div className="mx-auto grid max-w-7xl gap-10 px-6 py-12 lg:grid-cols-4">
                <div>
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
            <NavBar theme={theme} onToggle={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))} />
            <main>
                <Hero />
                <MarketsStrip />
                <Features />
                <AppSections />
                <ClosingCTA />
            </main>
            <Footer />
        </div>
    );
}
