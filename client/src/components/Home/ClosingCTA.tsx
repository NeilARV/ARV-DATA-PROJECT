import { useLocation } from 'wouter';
import { ArrowRight } from 'lucide-react';

import { Reveal, btnPrimary, sectionHeading } from '@/components/Home/primitives';

export function ClosingCTA() {
    const [, setLocation] = useLocation();

    // The closing panel inverts against the page in both themes (bg-foreground / text-background),
    // giving the page a single committed tonal moment instead of a decorative glow blob.
    return (
        <Reveal className="mx-auto max-w-7xl px-6 pb-20">
            <div className="overflow-hidden rounded-2xl bg-foreground px-6 py-16 text-center sm:py-20">
                <h2 className={`${sectionHeading} !text-background`}>
                    Ready to find your next deal?
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-base text-background/70">
                    Join the investors who source, analyze, and close more deals with ARV Finance.
                </p>
                <div className="mt-8 flex flex-wrap justify-center gap-3">
                    <button
                        type="button"
                        onClick={() => setLocation('/signup')}
                        className={btnPrimary}
                    >
                        Get started
                        <ArrowRight className="h-4 w-4" />
                    </button>
                    <button
                        type="button"
                        onClick={() => setLocation('/contact')}
                        className="inline-flex items-center justify-center gap-2 rounded-md border border-background/25 bg-transparent px-5 py-2.5 text-sm font-medium text-background transition hover:bg-background/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background/40"
                    >
                        Talk to our team
                    </button>
                </div>
            </div>
        </Reveal>
    );
}
