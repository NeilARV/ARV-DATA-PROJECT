import { Star } from 'lucide-react';

import { Pill, Reveal } from '@/components/Home/primitives';

/** Single customer testimonial. */
export function Testimonials() {
    return (
        <section className="mx-auto max-w-3xl px-6 py-20 text-center">
            <Reveal>
                <div className="flex justify-center">
                    <Pill>
                        <Star className="h-3.5 w-3.5 text-primary" />
                        Loved by investors
                    </Pill>
                </div>

                <div className="mt-6 rounded-2xl border border-card-border bg-card p-8">
                    <div className="flex justify-center gap-0.5 text-primary">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <Star key={i} className="h-4 w-4 fill-current" />
                        ))}
                    </div>

                    <p className="mt-5 text-lg font-medium leading-relaxed text-foreground lg:text-xl">
                        “I use the ARV Platform to stay on the cutting edge of the San Diego market.
                        I'm on it every day.”
                    </p>
                    <div className="mt-6 flex items-center justify-center gap-3">
                        <img
                            src="/testimonials/range-home-buyers.jpg"
                            alt="Cade Silva"
                            className="h-10 w-10 rounded-full object-cover"
                        />
                        <div className="text-left">
                            <p className="text-sm font-semibold text-foreground">Cade Silva</p>
                            <p className="text-xs text-muted-foreground">Range Home Buyers</p>
                        </div>
                    </div>
                </div>
            </Reveal>
        </section>
    );
}
