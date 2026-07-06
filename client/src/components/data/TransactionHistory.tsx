import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { formatCompanyName } from '@shared/utils/formatCompanyName';
import type { PropertyDetailTransaction, SupplementalTaxBillRow } from '@shared/types/properties';
import { formatDate } from '@/utils/date';
import { isNegative } from '@/utils/isNegative';
import { transactionTypeBadgeClass } from '@/utils/transactionTypeBadge';

type TransactionHistoryProps = {
    /** The property's transactions, newest first, as returned by the detail endpoint. */
    transactions: PropertyDetailTransaction[];
};

const PRIOR_VALUE_SOURCE_LABELS: Record<string, string> = {
    assessment: 'assessed roll',
    prior_transaction: 'prior sale',
};

/** "$1,234" / "$1,234.56" from a magnitude — the sign is discarded; callers render +/− themselves. */
function formatUnsignedMoney(value: number, withCents = false): string {
    return `$${Math.abs(value).toLocaleString(undefined, {
        minimumFractionDigits: withCents ? 2 : 0,
        maximumFractionDigits: withCents ? 2 : 0,
    })}`;
}

/** "FY 2026–27" from the fiscal year's starting calendar year. */
function fiscalYearLabel(fiscalYear: number): string {
    return `FY ${fiscalYear}–${String((fiscalYear + 1) % 100).padStart(2, '0')}`;
}

/** One statutory bill row of the expanded audit breakdown. */
function BillBreakdownRow({ bill }: { bill: SupplementalTaxBillRow }) {
    const sourceLabel = PRIOR_VALUE_SOURCE_LABELS[bill.priorValueSource] ?? bill.priorValueSource;
    return (
        <div className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground">
                    {fiscalYearLabel(bill.fiscalYear)} ·{' '}
                    {bill.billType === 'refund' ? 'Refund' : 'Bill'}
                </span>
                <span
                    className={`font-semibold ${
                        bill.billType === 'refund' ? 'text-spread-positive' : 'text-spread-negative'
                    }`}
                >
                    {bill.billType === 'refund' ? '+' : '-'}
                    {formatUnsignedMoney(bill.amount, true)}
                </span>
            </div>
            <span className="text-muted-foreground">
                prior{' '}
                {bill.priorAssessedValue != null
                    ? formatUnsignedMoney(bill.priorAssessedValue)
                    : '—'}{' '}
                ({sourceLabel}) · net {formatUnsignedMoney(bill.netSupplementalValue)} ·{' '}
                {(bill.taxRate * 100).toFixed(2)}% × {bill.prorationFactor}
            </span>
        </div>
    );
}

/**
 * Read-only transaction history for the property detail view. Purely presentational —
 * receives the detail endpoint's transactions as props (no fetching, no auth hooks).
 * Rows with a supplementalTax object show the row's buyer's accrued ownership-window
 * amount and can expand to the stored statutory breakdown; the caller/data layer owns
 * the admin gate (the API omits those fields for everyone else).
 */
export function TransactionHistory({ transactions }: TransactionHistoryProps) {
    const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

    function handleToggleBreakdown(txId: number) {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(txId)) next.delete(txId);
            else next.add(txId);
            return next;
        });
    }

    return (
        <div className="space-y-3" data-testid="transaction-history">
            <h3 className="text-sm font-semibold text-foreground">Transaction History</h3>

            {transactions.length === 0 && (
                <p className="text-xs text-muted-foreground py-2">No transactions recorded.</p>
            )}

            <div className="space-y-2">
                {transactions.map((tx) => {
                    const supplemental = tx.supplementalTax;
                    const hasBreakdown = tx.supplementalTaxBills.length > 0;
                    const isExpanded = expandedIds.has(tx.id);

                    return (
                        <div
                            key={tx.id}
                            className="p-3 rounded-lg border border-border bg-card space-y-1.5"
                            data-testid={`transaction-history-row-${tx.id}`}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <span
                                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border ${transactionTypeBadgeClass(tx.transactionType)}`}
                                >
                                    {tx.transactionType ?? 'Unknown'}
                                </span>
                                <span className="text-xs text-muted-foreground shrink-0">
                                    {formatDate(tx.saleDate ?? tx.recordingDate) ?? '—'}
                                </span>
                            </div>

                            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                                <div className="min-w-0">
                                    <p className="text-xs text-muted-foreground">Buyer</p>
                                    <p className="text-xs font-medium text-foreground truncate">
                                        {formatCompanyName(tx.buyerName ?? '—')}
                                    </p>
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs text-muted-foreground">Seller</p>
                                    <p className="text-xs font-medium text-foreground truncate">
                                        {formatCompanyName(tx.sellerName ?? '—')}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs text-muted-foreground">
                                    {tx.salePrice != null ? formatUnsignedMoney(tx.salePrice) : '—'}
                                </span>
                                {tx.isAssignment && tx.assignorName && (
                                    <span className="text-xs text-muted-foreground truncate">
                                        Assigned by {formatCompanyName(tx.assignorName)}
                                    </span>
                                )}
                            </div>

                            {supplemental && (
                                <div className="pt-1.5 border-t border-border">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-xs font-medium text-muted-foreground">
                                            Supplemental Tax (
                                            {supplemental.status === 'final'
                                                ? `held ${supplemental.monthsOwned} mo`
                                                : `${supplemental.monthsOwned} mo to date`}
                                            ):
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <span
                                                className={`text-xs font-semibold ${
                                                    isNegative(supplemental.amount)
                                                        ? 'text-spread-negative'
                                                        : 'text-spread-positive'
                                                }`}
                                                data-testid={`text-supplemental-tax-${tx.id}`}
                                            >
                                                {isNegative(supplemental.amount) ? '-' : '+'}
                                                {formatUnsignedMoney(supplemental.amount, true)}
                                            </span>
                                            {hasBreakdown && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleBreakdown(tx.id)}
                                                    className="text-muted-foreground hover:text-foreground"
                                                    aria-label={
                                                        isExpanded
                                                            ? 'Hide statutory breakdown'
                                                            : 'Show statutory breakdown'
                                                    }
                                                    data-testid={`button-sbt-breakdown-${tx.id}`}
                                                >
                                                    {isExpanded ? (
                                                        <ChevronUp className="w-3.5 h-3.5" />
                                                    ) : (
                                                        <ChevronDown className="w-3.5 h-3.5" />
                                                    )}
                                                </button>
                                            )}
                                        </span>
                                    </div>
                                    {isExpanded && hasBreakdown && (
                                        <div
                                            className="mt-1.5 space-y-1.5 text-xs"
                                            data-testid={`sbt-breakdown-${tx.id}`}
                                        >
                                            {tx.supplementalTaxBills.map((bill) => (
                                                <BillBreakdownRow
                                                    key={bill.fiscalYear}
                                                    bill={bill}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
