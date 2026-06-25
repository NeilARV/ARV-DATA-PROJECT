import {
    BarChart3,
    Handshake,
    Hash,
    LayoutGrid,
    type LucideIcon,
    Map,
    MessageSquare,
    Table2,
    TrendingUp,
    Users,
    Wrench,
} from 'lucide-react';

import { FeatureBullet, IconTile, LearnMoreLink, Pill, Reveal } from '@/components/Home/primitives';

const dataViews = [
    { icon: Map, label: 'Map View', desc: 'Transactions plotted on an interactive map' },
    { icon: LayoutGrid, label: 'Grid View', desc: 'Scan properties as visual cards' },
    { icon: Table2, label: 'Table View', desc: 'Dense, sortable data table' },
    { icon: Users, label: 'Buyers Feed', desc: "See who's actively acquiring" },
    { icon: TrendingUp, label: 'Wholesale Feed', desc: 'Fresh off-market opportunities' },
] as const;

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
    icon: LucideIcon;
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

export function Features() {
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
