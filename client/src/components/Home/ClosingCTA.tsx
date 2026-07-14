import { useLocation } from 'wouter';
import { ArrowRight } from 'lucide-react';

import { Reveal } from '@/components/Home/ui/Reveal';
import { sectionHeading } from '@/components/Home/ui/typography';
import { btnPrimary, btnOutline } from '@/components/Home/ui/buttons';

export function ClosingCTA() {
    const [, setLocation] = useLocation();

    // The closing panel stays in the page's own tonal register (light in light mode, dark in dark
    // mode) and earns its "moment" from the brand instead: a soft Insider Cyan wash and hairline
    // frame carry it, so it reads as the one committed cyan surface — no jarring inversion.
    return (
        <Reveal className="mx-auto max-w-7xl px-6 pb-20">
            <div className="overflow-hidden rounded-2xl border border-primary/25 bg-primary/[0.06] px-6 py-16 text-center sm:py-20 dark:bg-primary/[0.1]">
                <h2 className={sectionHeading}>Ready to find your next deal?</h2>
                <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground">
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
                        className={btnOutline}
                    >
                        Talk to our team
                    </button>
                </div>
            </div>
        </Reveal>
    );
}
