import { Handshake } from 'lucide-react';
import Header from '@/components/Header';
import { DataProviders } from '@/components/DataProviders';
import { AppAccessGate } from '@/components/auth/AppAccessGate';
import DealsPageContent from '@/components/deals/DealsPageContent';

function DealsInner() {
    return (
        <div className="h-dvh flex flex-col">
            <Header />
            <div className="flex-1 overflow-hidden min-h-0">
                <AppAccessGate redirectWhenUnauthenticated="/deals" icon={Handshake}>
                    <DealsPageContent />
                </AppAccessGate>
            </div>
        </div>
    );
}

export default function Deals() {
    return (
        <DataProviders>
            <DealsInner />
        </DataProviders>
    );
}
