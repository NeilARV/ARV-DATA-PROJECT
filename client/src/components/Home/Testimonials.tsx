import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';

import { Pill, Reveal, prefersReducedMotion } from '@/components/Home/primitives';

/** Auto-rotating testimonial carousel — each quote names one of the four tools. */
export function Testimonials() {
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
