import { describe, it, expect } from 'vitest';
import {
    getSupplementalTaxSchedule,
    calculateSupplementalBill,
    isSupplementalTaxState,
    SUPPLEMENTAL_TAX_STATES,
    CA_SUPPLEMENTAL_TAX_RATE,
} from '../../../server/utils/supplementalTax';

/** Baseline valid bill input: value rose, single full-year slot. */
const baseBill = {
    priorAssessedValue: 122_000,
    newBaseValue: 1_000_000,
    taxRate: CA_SUPPLEMENTAL_TAX_RATE,
    fiscalYear: 2026,
    prorationFactor: 1,
};

describe('isSupplementalTaxState', () => {
    it.each([['CA'], ['ca'], [' Ca ']])(
        'isSupplementalTaxState — %j — true (case/whitespace tolerant)',
        (state) => {
            expect(isSupplementalTaxState(state)).toBe(true);
        },
    );

    it.each([['WA'], ['FL'], ['CO'], [''], [null], [undefined]])(
        'isSupplementalTaxState — %j — false',
        (state) => {
            expect(isSupplementalTaxState(state)).toBe(false);
        },
    );

    it('SUPPLEMENTAL_TAX_STATES — v1 supports exactly CA', () => {
        expect(Array.from(SUPPLEMENTAL_TAX_STATES)).toEqual(['CA']);
    });
});

describe('getSupplementalTaxSchedule', () => {
    describe('gating — returns []', () => {
        it.each([['WA'], ['FL'], [''], [null], [undefined]])(
            'getSupplementalTaxSchedule — state %j — returns []',
            (state) => {
                expect(getSupplementalTaxSchedule(state, '2026-08-15')).toEqual([]);
            },
        );

        it.each([['not-a-date'], [''], ['08/15/2026'], ['2026-13-01']])(
            'getSupplementalTaxSchedule — unparseable saleDate %j — returns []',
            (saleDate) => {
                expect(getSupplementalTaxSchedule('CA', saleDate)).toEqual([]);
            },
        );
    });

    describe('proration factors (R&T §75.41(c): prorated from the presumed first-of-following-month date)', () => {
        it.each([
            ['2026-01-10', 0.42],
            ['2026-02-10', 0.33],
            ['2026-03-10', 0.25],
            ['2026-04-10', 0.17],
            ['2026-05-10', 0.08],
            ['2026-06-10', 1.0], // presumed Jul 1 → single full-year bill on the next FY
            ['2026-07-10', 0.92],
            ['2026-08-10', 0.83],
            ['2026-09-10', 0.75],
            ['2026-10-10', 0.67],
            ['2026-11-10', 0.58],
            ['2026-12-10', 0.5],
        ])('getSupplementalTaxSchedule — event %s — first factor %d', (saleDate, factor) => {
            const [first] = getSupplementalTaxSchedule('CA', saleDate);
            expect(first.prorationFactor).toBe(factor);
        });
    });

    describe('bill count and fiscal-year labeling', () => {
        it.each([
            ['2026-01-01', 2],
            ['2026-05-31', 2],
            ['2026-06-15', 1], // June: one bill — the NEXT fiscal year in full
            ['2026-07-15', 1],
            ['2026-12-31', 1],
        ])('getSupplementalTaxSchedule — event %s — %d entr(y/ies)', (saleDate, count) => {
            expect(getSupplementalTaxSchedule('CA', saleDate)).toHaveLength(count);
        });

        it('getSupplementalTaxSchedule — March event — current FY prorated + next FY full', () => {
            expect(getSupplementalTaxSchedule('CA', '2026-03-15')).toEqual([
                { fiscalYear: 2025, prorationFactor: 0.25 },
                { fiscalYear: 2026, prorationFactor: 1 },
            ]);
        });

        it('getSupplementalTaxSchedule — June event — single NEXT-FY entry at 1.00 (§75.41(c)(6))', () => {
            expect(getSupplementalTaxSchedule('CA', '2026-06-15')).toEqual([
                { fiscalYear: 2026, prorationFactor: 1 },
            ]);
        });

        it.each([
            // Jul–Dec → FY starts the event year; Jan–May → FY started the prior year
            ['2026-07-01', 2026],
            ['2026-12-15', 2026],
            ['2026-01-15', 2025],
            ['2026-05-15', 2025],
        ])(
            'getSupplementalTaxSchedule — event %s — first fiscalYear %d',
            (saleDate, fiscalYear) => {
                const [first] = getSupplementalTaxSchedule('CA', saleDate);
                expect(first.fiscalYear).toBe(fiscalYear);
            },
        );
    });
});

describe('calculateSupplementalBill', () => {
    describe('returns null — nothing to issue', () => {
        it('calculateSupplementalBill — difference exactly 0 — null', () => {
            expect(
                calculateSupplementalBill({
                    ...baseBill,
                    priorAssessedValue: 500_000,
                    newBaseValue: 500_000,
                }),
            ).toBeNull();
        });

        it('calculateSupplementalBill — non-finite values — null', () => {
            expect(calculateSupplementalBill({ ...baseBill, priorAssessedValue: NaN })).toBeNull();
            expect(calculateSupplementalBill({ ...baseBill, newBaseValue: Infinity })).toBeNull();
        });

        it('calculateSupplementalBill — amount rounds to $0.00 — null (no zero-dollar bills)', () => {
            // net 4 × 0.0125 × 0.08 = 0.004 → rounds to 0.00
            expect(
                calculateSupplementalBill({
                    ...baseBill,
                    priorAssessedValue: 500_000,
                    newBaseValue: 500_004,
                    prorationFactor: 0.08,
                }),
            ).toBeNull();
        });
    });

    describe('bill vs refund', () => {
        it('calculateSupplementalBill — value rose — billType bill with positive magnitudes', () => {
            const bill = calculateSupplementalBill(baseBill);
            expect(bill?.billType).toBe('bill');
            expect(bill?.netSupplementalValue).toBe(878_000);
            expect(bill?.amount).toBeGreaterThan(0);
        });

        it('calculateSupplementalBill — value fell — billType refund with positive magnitudes', () => {
            const refund = calculateSupplementalBill({
                ...baseBill,
                priorAssessedValue: 1_000_000,
                newBaseValue: 700_000,
            });
            expect(refund?.billType).toBe('refund');
            expect(refund?.netSupplementalValue).toBe(300_000);
            expect(refund?.amount).toBeGreaterThan(0);
        });
    });

    describe('amounts', () => {
        it('calculateSupplementalBill — worked example (§2, August event → factor 0.83) — $9,109.25', () => {
            const bill = calculateSupplementalBill({ ...baseBill, prorationFactor: 0.83 });
            // 878,000 × 0.0125 × 0.83 — literal so the rounded amount can't drift
            expect(bill?.amount).toBe(9_109.25);
            expect(bill?.taxRate).toBe(CA_SUPPLEMENTAL_TAX_RATE);
            expect(bill?.fiscalYear).toBe(2026);
        });

        it('calculateSupplementalBill — July event factor 0.92 — $10,097', () => {
            const bill = calculateSupplementalBill({ ...baseBill, prorationFactor: 0.92 });
            // 878,000 × 0.0125 × 0.92 = 10,096.99999… → rounds to 10,097
            expect(bill?.amount).toBe(10_097);
        });

        it('calculateSupplementalBill — amount rounds to cents', () => {
            const bill = calculateSupplementalBill({
                ...baseBill,
                priorAssessedValue: 100_000,
                newBaseValue: 100_001, // net 1 × 0.0125 × 0.92 = 0.0115
                prorationFactor: 0.92,
            });
            expect(bill?.amount).toBe(0.01);
        });

        it('calculateSupplementalBill — explicit taxRate — used for rate and amount', () => {
            const bill = calculateSupplementalBill({ ...baseBill, taxRate: 0.011 });
            expect(bill?.taxRate).toBe(0.011);
            // 878,000 × 0.011 at factor 1.00
            expect(bill?.amount).toBe(9_658);
        });
    });
});
