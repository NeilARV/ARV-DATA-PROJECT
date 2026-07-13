import { MapPin } from 'lucide-react';

import { LiveDot } from '@/components/Home/primitives';

const markets = [
    'Denver',
    'Miami',
    'San Diego',
    'Los Angeles',
    'San Francisco',
    'Port St. Lucie',
    'Riverside',
    'Seattle',
    'Tampa',
];

export function MarketsMarquee() {
    return (
        <section className="border-y border-border bg-card/40">
            <div className="mx-auto max-w-7xl px-6 py-8">
                {/* label on top */}
                <div className="mb-5 flex items-center justify-center gap-2">
                    <LiveDot />
                    <span className="text-sm font-medium text-muted-foreground">Live market data</span>
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
