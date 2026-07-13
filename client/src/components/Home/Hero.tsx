import { useLocation } from 'wouter';
import { ArrowRight } from 'lucide-react';

import { MapPin } from 'lucide-react';

import {
    LiveDot,
    MiniMap,
    StatItem,
    btnOutline,
    btnPrimary,
    heroHeading,
    scrollToSection,
} from '@/components/Home/primitives';

/** A purely decorative, data-free dashboard mock that sells the Data app. */
function HeroMock() {
    return (
        // aria-hidden: the figures here are illustrative, not real market data — never read aloud.
        <div aria-hidden className="relative rounded-2xl border border-card-border bg-card p-4">
            {/* product top-bar: reads as the real Data app header, not generic window chrome */}
            <div className="mb-4 flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-semibold text-foreground">
                    <MapPin className="h-3.5 w-3.5 text-primary" />
                    Denver, CO
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <LiveDot />
                    142 transactions
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

export function Hero() {
    const [, setLocation] = useLocation();

    return (
        <section className="relative overflow-hidden">
            <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 py-16 lg:grid-cols-2 lg:py-24">
                <div>
                    <h1 className={heroHeading}>
                        The{' '}
                        <span className="underline decoration-primary decoration-[3px] underline-offset-[8px] sm:decoration-4">
                            exclusive
                        </span>{' '}
                        market platform for real estate investors and wholesalers
                    </h1>

                    <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground lg:text-lg">
                        Daily flip transactions and double closes, a vetted vendor directory, a
                        members-only deal marketplace, and a private mastermind — one platform,
                        built for ARV clients and partners.
                    </p>

                    <div className="mt-8 flex flex-wrap items-center gap-3">
                        <button
                            type="button"
                            onClick={() => scrollToSection('features')}
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

                    <div className="mt-10 flex flex-wrap gap-x-8 gap-y-4">
                        <StatItem value={9} label="Active markets" />
                        <StatItem value={4} label="States" />
                        <StatItem value={4} label="Integrated tools" />
                    </div>
                </div>

                <div className="relative">
                    <HeroMock />
                </div>
            </div>
        </section>
    );
}
