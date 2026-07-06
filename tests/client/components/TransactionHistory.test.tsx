import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TransactionHistory } from '@/components/data/TransactionHistory';
import { formatCompanyName } from '@shared/utils/formatCompanyName';
import type { PropertyDetailTransaction } from '@shared/types/properties';

// The component is purely presentational (no fetching, no auth hooks) — it renders any
// transaction array it's handed, so plain fixtures cover every state. The admin gate is
// the caller's job (AdminTransactionHistorySection) and is not under test here.

function makeTx(overrides: Partial<PropertyDetailTransaction> = {}): PropertyDetailTransaction {
    return {
        id: 1,
        transactionType: 'Arms Length',
        saleDate: '2026-04-20',
        recordingDate: '2026-04-22',
        salePrice: 410_000,
        buyerId: null,
        buyerName: 'VISIBILITY TEST BUYER LLC',
        sellerId: null,
        sellerName: 'VISIBILITY TEST SELLER',
        isAssignment: false,
        assignorName: null,
        supplementalTax: null,
        supplementalTaxBills: [],
        ...overrides,
    };
}

// Mirrors the integration seed: April acquisition, two statutory rows (bill + refund),
// window closed at 4 presumed-date months → −95.83 final.
const sbtTx = makeTx({
    supplementalTax: { amount: -95.83, monthsOwned: 4, status: 'final' },
    supplementalTaxBills: [
        {
            fiscalYear: 2025,
            billType: 'bill',
            amount: 100,
            priorAssessedValue: 285_000,
            priorValueSource: 'prior_transaction',
            netSupplementalValue: 125_000,
            taxRate: 0.0125,
            prorationFactor: 0.17,
        },
        {
            fiscalYear: 2026,
            billType: 'refund',
            amount: 25,
            priorAssessedValue: 285_000,
            priorValueSource: 'prior_transaction',
            netSupplementalValue: 125_000,
            taxRate: 0.0125,
            prorationFactor: 1,
        },
    ],
});

describe('TransactionHistory', () => {
    it('TransactionHistory — no transactions — renders the empty state', () => {
        render(<TransactionHistory transactions={[]} />);
        expect(screen.getByText('No transactions recorded.')).toBeInTheDocument();
    });

    it('TransactionHistory — populated row — shows type badge, formatted names, and price', () => {
        render(<TransactionHistory transactions={[makeTx()]} />);
        expect(screen.getByText('Arms Length')).toBeInTheDocument();
        // ARV.RAW-COMPANY-NAME: raw ALL-CAPS DB names must render through formatCompanyName.
        expect(
            screen.getByText(formatCompanyName('VISIBILITY TEST BUYER LLC')),
        ).toBeInTheDocument();
        expect(screen.getByText(formatCompanyName('VISIBILITY TEST SELLER'))).toBeInTheDocument();
        expect(screen.getByText('$410,000')).toBeInTheDocument();
    });

    it('TransactionHistory — assignment row — shows the Assigned by note', () => {
        render(
            <TransactionHistory
                transactions={[makeTx({ isAssignment: true, assignorName: 'ARV ASSIGNOR LLC' })]}
            />,
        );
        expect(
            screen.getByText(`Assigned by ${formatCompanyName('ARV ASSIGNOR LLC')}`),
        ).toBeInTheDocument();
    });

    it('TransactionHistory — row without supplemental tax — renders no SBT line or breakdown button', () => {
        render(<TransactionHistory transactions={[makeTx()]} />);
        expect(screen.queryByText(/Supplemental Tax/)).not.toBeInTheDocument();
        expect(screen.queryByTestId('button-sbt-breakdown-1')).not.toBeInTheDocument();
    });

    it('TransactionHistory — final accrual — signed amount and held-months label', () => {
        render(<TransactionHistory transactions={[sbtTx]} />);
        expect(screen.getByTestId('text-supplemental-tax-1')).toHaveTextContent('-$95.83');
        expect(screen.getByText(/held 4 mo/)).toBeInTheDocument();
    });

    it('TransactionHistory — accruing window — months-to-date label', () => {
        render(
            <TransactionHistory
                transactions={[
                    makeTx({
                        supplementalTax: { amount: -200, monthsOwned: 2, status: 'accruing' },
                        supplementalTaxBills: sbtTx.supplementalTaxBills.slice(0, 1),
                    }),
                ]}
            />,
        );
        expect(screen.getByTestId('text-supplemental-tax-1')).toHaveTextContent('-$200.00');
        expect(screen.getByText(/2 mo to date/)).toBeInTheDocument();
    });

    it('TransactionHistory — breakdown chevron — expands and collapses the statutory rows', async () => {
        const user = userEvent.setup();
        render(<TransactionHistory transactions={[sbtTx]} />);

        expect(screen.queryByTestId('sbt-breakdown-1')).not.toBeInTheDocument();

        await user.click(screen.getByTestId('button-sbt-breakdown-1'));
        const breakdown = screen.getByTestId('sbt-breakdown-1');
        expect(breakdown).toHaveTextContent('FY 2025–26');
        expect(breakdown).toHaveTextContent('FY 2026–27');
        expect(breakdown).toHaveTextContent('-$100.00');
        expect(breakdown).toHaveTextContent('+$25.00');
        expect(breakdown).toHaveTextContent('prior $285,000 (prior sale)');
        expect(
            screen.getByRole('button', { name: 'Hide statutory breakdown' }),
        ).toBeInTheDocument();

        await user.click(screen.getByTestId('button-sbt-breakdown-1'));
        expect(screen.queryByTestId('sbt-breakdown-1')).not.toBeInTheDocument();
    });
});
