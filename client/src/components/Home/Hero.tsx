import { useLocation } from 'wouter';
import { ArrowRight } from 'lucide-react';

import {
    MiniMap,
    StatItem,
    btnOutline,
    btnPrimary,
    scrollToSection,
} from '@/components/Home/primitives';

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

export function Hero() {
    const [, setLocation] = useLocation();

    return (
        <section className="relative overflow-hidden">
            {/* decorative brand glow */}
            <div className="pointer-events-none absolute -top-32 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />

            <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 py-16 lg:grid-cols-2 lg:py-24">
                <div>
                    <h1 className="text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl lg:text-5xl">
                        The exclusive market platform for{' '}
                        <span className="text-primary">real estate investors and wholesalers</span>
                    </h1>

                    <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground lg:text-lg">
                        View daily flip transactions, double closes, vendor directory, deal
                        marketplace and private mastermind community. Exclusive for ARV clients and
                        partners.
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
                            View live deals
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
