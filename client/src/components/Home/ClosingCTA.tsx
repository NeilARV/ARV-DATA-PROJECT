import { useLocation } from 'wouter';
import { ArrowRight } from 'lucide-react';

import { Reveal, btnOutline, btnPrimary } from '@/components/Home/primitives';

export function ClosingCTA() {
    const [, setLocation] = useLocation();

    return (
        <Reveal className="mx-auto max-w-7xl px-6 pb-20">
            <div className="relative overflow-hidden rounded-2xl border border-card-border bg-card px-6 py-14 text-center">
                <div className="pointer-events-none absolute -bottom-24 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
                <div className="relative">
                    <h2 className="text-3xl font-bold tracking-tight text-foreground lg:text-4xl">
                        Ready to find your next deal?
                    </h2>
                    <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground">
                        Join investors using ARV Finance to source, analyze, and close their next
                        deal.
                    </p>
                    <div className="mt-8 flex flex-wrap justify-center gap-3">
                        <button
                            type="button"
                            onClick={() => setLocation('/signup')}
                            className={btnPrimary}
                        >
                            Get started free
                            <ArrowRight className="h-4 w-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setLocation('/contact')}
                            className={btnOutline}
                        >
                            Talk to our team
                        </button>
                    </div>
                </div>
            </div>
        </Reveal>
    );
}
