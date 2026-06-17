import Header from '@/components/Header';
import { DataProviders } from '@/components/DataProviders';

function AnalyticsContent() {
    return (
        <div className="h-screen flex flex-col">
            <Header />
            <div className="flex-1 flex items-center justify-center">
                <p className="text-2xl font-semibold text-muted-foreground">Coming Soon</p>
            </div>
        </div>
    );
}

export default function Analytics() {
    return (
        <DataProviders>
            <AnalyticsContent />
        </DataProviders>
    );
}
