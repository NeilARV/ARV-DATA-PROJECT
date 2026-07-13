import { useState } from 'react';
import { useLocation } from 'wouter';
import {
    ArrowRight,
    BarChart3,
    Bath,
    Bed,
    Bold,
    Building2,
    CircleUser,
    Handshake,
    Hash,
    Home,
    Italic,
    Link2,
    type LucideIcon,
    Maximize2,
    MessageSquare,
    Phone,
    Send,
    Underline,
    Wrench,
} from 'lucide-react';

import {
    FeatureBullet,
    IconTile,
    MiniMap,
    Reveal,
    btnPrimary,
    sectionHeading,
} from '@/components/Home/primitives';

/**
 * Standard alternating explainer block (eyebrow → title → copy → bullets → CTA, paired with a
 * visual). Each app's "Learn more" in the bento grid scrolls here; the CTA opens the matching app.
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
    ctaTarget,
    reverse = false,
    visual,
}: {
    id: string;
    icon: LucideIcon;
    eyebrow: string;
    accentText: string;
    accentTile: string;
    title: string;
    description: string;
    bullets: string[];
    cta: string;
    ctaTarget: string;
    reverse?: boolean;
    visual: React.ReactNode;
}) {
    const [, setLocation] = useLocation();
    return (
        <section id={id} className="scroll-mt-20 border-t border-border">
            <div className="mx-auto max-w-7xl px-6 py-20">
                <Reveal className="grid items-center gap-12 lg:grid-cols-2">
                    <div className={reverse ? 'lg:order-2' : ''}>
                        <div className="inline-flex items-center gap-3">
                            <IconTile icon={icon} tint={accentTile} />
                            <span className={`text-sm font-semibold ${accentText}`}>{eyebrow}</span>
                        </div>
                        <h2 className={`mt-5 ${sectionHeading}`}>{title}</h2>
                        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                            {description}
                        </p>
                        <ul className="mt-6 space-y-3">
                            {bullets.map((b) => (
                                <FeatureBullet key={b}>{b}</FeatureBullet>
                            ))}
                        </ul>
                        <button
                            type="button"
                            onClick={() => setLocation(ctaTarget)}
                            className={`${btnPrimary} mt-8`}
                        >
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
 * Deals app visual: a clean, custom deal card (a mockup of a possible redesign — intentionally NOT
 * a clone of the current DealCard2). Image banner with deal-type badges, a financial highlight
 * strip, and a single clear call to action.
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
function ToolbarButton({ icon: Icon }: { icon: LucideIcon }) {
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

export function AppSections() {
    return (
        <>
            <FeatureSection
                id="data"
                icon={BarChart3}
                eyebrow="Data"
                accentText="text-primary"
                accentTile="bg-primary/10 text-primary"
                title="Every transaction, the way you want to see it"
                description="Browse single-family transaction data across nine major markets in four states. Filter by company, status, price, and location — then switch views without losing your place."
                bullets={[
                    'Map View — plot transactions on an interactive map',
                    'Grid & Table views — scan cards or sort dense data',
                    'Buyers Feed — track who is actively acquiring',
                    'Wholesale Feed — surface off-market opportunities first',
                ]}
                cta="Open the Data app"
                ctaTarget="/data"
                visual={<DataVisual />}
            />
            <FeatureSection
                id="deals"
                icon={Handshake}
                eyebrow="Deals"
                accentText="text-primary"
                accentTile="bg-primary/10 text-primary"
                title="Exclusive deals, straight from the source"
                description="ARV clients post wholesale, agent, sold, and REO deals for the community. Find your next acquisition and act on it in just a few clicks."
                bullets={[
                    'Post wholesale, agent, sold, and REO deals',
                    'Filter by location, price, and deal type',
                    'Request seller contact info instantly',
                    'Submit offers directly through the platform',
                ]}
                cta="Browse live deals"
                ctaTarget="/deals"
                reverse
                visual={<DealVisual />}
            />
            <FeatureSection
                id="vendors"
                icon={Wrench}
                eyebrow="Vendors"
                accentText="text-primary"
                accentTile="bg-primary/10 text-primary"
                title="Build your team with vendors you can trust"
                description="A community-driven directory of contractors, lenders, and service providers — organized by trade so you can staff your next project fast."
                bullets={[
                    'Browse vendors by trade category',
                    'Promote your own services to the community',
                    'Follow community posts and recommendations',
                    'Connect with vendors in your market',
                ]}
                cta="Explore the directory"
                ctaTarget="/vendors"
                visual={<VendorVisual />}
            />
            <FeatureSection
                id="mastermind"
                icon={MessageSquare}
                eyebrow="Mastermind"
                accentText="text-primary"
                accentTile="bg-primary/10 text-primary"
                title="A community that moves as fast as you do"
                description="A real-time, Slack-style space built into the platform. Share wins, ask questions, and stay close to the deals — all in topic-based channels."
                bullets={[
                    'Topic channels for markets and strategies',
                    'Live messaging with @mentions and reactions',
                    'Pin important threads and resources',
                    'In-app notifications keep you in the loop',
                ]}
                cta="Enter the Mastermind"
                ctaTarget="/mastermind"
                reverse
                visual={<MastermindVisual />}
            />
        </>
    );
}
