import { useAuth } from '@/hooks/use-auth';
import { TransactionHistory } from '@/components/data/TransactionHistory';
import type { PropertyDetailTransaction } from '@shared/types/properties';

type AdminTransactionHistorySectionProps = {
    /** The detail payload's transactions; absent on list rows (the section renders nothing). */
    transactions?: PropertyDetailTransaction[];
};

/**
 * Admin/owner-gated transaction-history section mounted below PropertyContent on the
 * detail panel and modal. Internal verification surface for now — the API omits the
 * supplemental-tax fields for non-admins regardless of this gate.
 */
export function AdminTransactionHistorySection({
    transactions,
}: AdminTransactionHistorySectionProps) {
    const { isAdmin, isOwner } = useAuth();
    if (!(isAdmin || isOwner) || !transactions) return null;
    return (
        <div className="mt-4 pt-4 border-t border-border">
            <TransactionHistory transactions={transactions} />
        </div>
    );
}
