import { ArrowRight, BarChart3, Handshake, type LucideIcon, MessageSquare, Wrench } from 'lucide-react';

import { IconTile, Reveal, scrollToSection, sectionHeading } from '@/components/Home/primitives';

const apps: {
    icon: LucideIcon;
    tint: string;
    name: string;
    tagline: string;
    targetId: string;
}[] = [
    {
        icon: BarChart3,
        tint: 'bg-primary/10 text-primary',
        name: 'Data',
        tagline: 'SFR transactions, companies, and code violations across every market.',
        targetId: 'data',
    },
    {
        icon: Handshake,
        tint: 'bg-chart-4/15 text-chart-4',
        name: 'Deals',
        tagline: 'Post and browse wholesale, agent, sold, and REO deals.',
        targetId: 'deals',
    },
    {
        icon: Wrench,
        tint: 'bg-chart-2/15 text-chart-2',
        name: 'Vendors',
        tagline: 'A community-vetted directory of contractors, lenders, and service providers.',
        targetId: 'vendors',
    },
    {
        icon: MessageSquare,
        tint: 'bg-chart-3/15 text-chart-3',
        name: 'Mastermind',
        tagline: 'A real-time, Slack-style community of fellow ARV clients.',
        targetId: 'mastermind',
    },
];

/**
 * The at-a-glance overview of the four apps. Each item is a teaser that scrolls to its detailed
 * section below (AppSections) — the deep dive, not a duplicate of it.
 */
export function Features() {
    return (
        <section id="features" className="mx-auto max-w-7xl px-6 py-20">
            <div className="mx-auto max-w-2xl text-center">
                <h2 className={sectionHeading}>Four tools. One membership.</h2>
                <p className="mt-4 text-base text-muted-foreground">
                    Each ARV Finance membership unlocks four connected tools, built for the way
                    investors actually work.
                </p>
            </div>

            <Reveal className="mt-12 grid grid-cols-1 gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
                {apps.map((app) => (
                    <button
                        key={app.name}
                        type="button"
                        onClick={() => scrollToSection(app.targetId)}
                        className="group flex flex-col items-start rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <IconTile icon={app.icon} tint={app.tint} />
                        <h3 className="mt-4 flex items-center gap-1.5 text-lg font-semibold text-foreground">
                            {app.name}
                            <ArrowRight className="h-4 w-4 -translate-x-1 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                        </h3>
                        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                            {app.tagline}
                        </p>
                    </button>
                ))}
            </Reveal>
        </section>
    );
}
