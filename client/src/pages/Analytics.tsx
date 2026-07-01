import { MarketingHeader } from '@/components/MarketingHeader';

export default function Analytics() {
    return (
        <div className="h-screen flex flex-col">
            <MarketingHeader />
            <div className="flex-1 flex items-center justify-center">
                <p className="text-2xl font-semibold text-muted-foreground">Coming Soon</p>
            </div>
        </div>
    );
}
