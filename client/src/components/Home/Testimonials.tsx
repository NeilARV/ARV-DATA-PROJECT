import { Star } from 'lucide-react';

import { Reveal } from '@/components/Home/primitives';

/** Single customer testimonial, set as a full-width editorial pull-quote. */
export function Testimonials() {
    return (
        <section className="mx-auto max-w-4xl px-6 py-24 text-center">
            <Reveal>
                <div className="flex justify-center gap-1 text-primary">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className="h-5 w-5 fill-current" />
                    ))}
                </div>

                <blockquote className="mx-auto mt-8 max-w-3xl text-2xl font-semibold leading-[1.3] tracking-[-0.02em] text-foreground [text-wrap:balance] sm:text-3xl lg:text-4xl">
                    “I use the ARV Platform to stay on the cutting edge of the San Diego market. I'm
                    on it every day.”
                </blockquote>

                <div className="mt-8 flex items-center justify-center gap-3">
                    <img
                        src="/testimonials/range-home-buyers.jpg"
                        alt="Cade Silva"
                        className="h-11 w-11 rounded-full object-cover"
                    />
                    <div className="text-left">
                        <p className="text-sm font-semibold text-foreground">Cade Silva</p>
                        <p className="text-xs text-muted-foreground">Range Home Buyers</p>
                    </div>
                </div>
            </Reveal>
        </section>
    );
}
