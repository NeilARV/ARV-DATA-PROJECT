import { MarketingHeader } from '@/components/MarketingHeader';
import { Hero } from '@/components/Home/Hero';
import { MarketsMarquee } from '@/components/Home/MarketsMarquee';
import { ArvRevealSlider } from '@/components/Home/ArvRevealSlider';
import { AppSections } from '@/components/Home/AppSections';
// Temporarily hidden — see the commented <DealCalculator /> below.
// import { DealCalculator } from '@/components/Home/DealCalculator';
import { Testimonials } from '@/components/Home/Testimonials';
import { ClosingCTA } from '@/components/Home/ClosingCTA';
import { Footer } from '@/components/Home/Footer';

/**
 * The public marketing landing page at `/`. Composes the section components in components/Home and
 * sits in front of the login-gated apps (Data, Deals, Vendors, Mastermind). Theme is owned globally
 * (App.tsx + the MarketingHeader toggle), so this page does not manage the `dark` class itself.
 */
export default function Home() {
    return (
        <div className="min-h-screen bg-background font-sans text-foreground antialiased">
            <MarketingHeader />
            <main className="overflow-x-clip">
                <Hero />
                <MarketsMarquee />
                <ArvRevealSlider />
                <AppSections />
                {/* Temporarily hidden — "Underwrite a deal in seconds" deal calculator */}
                {/* <DealCalculator /> */}
                <Testimonials />
                <ClosingCTA />
            </main>
            <Footer />
        </div>
    );
}
