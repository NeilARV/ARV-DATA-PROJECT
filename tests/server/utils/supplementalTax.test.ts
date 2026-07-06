import { describe, it, expect } from 'vitest';
import {
    getSupplementalTaxSchedule,
    calculateSupplementalBill,
    accrueSupplementalOverWindow,
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

describe('accrueSupplementalOverWindow', () => {
    // Oct 2026 event → factor 0.67, one FY-2026 slot billed Nov 1 2026 – Jun 30 2027 (8 months).
    const octoberBill = { fiscalYear: 2026, billType: 'bill' as const, amount: 800 };
    const octoberBase = {
        rows: [octoberBill],
        acquisitionDate: '2026-10-05',
        resaleDate: null,
        asOf: '2026-12-15',
        state: 'CA',
    };

    describe('returns null — nothing to display', () => {
        it('accrueSupplementalOverWindow — no rows — null', () => {
            expect(accrueSupplementalOverWindow({ ...octoberBase, rows: [] })).toBeNull();
        });

        it.each([['WA'], ['FL'], [null], [undefined]])(
            'accrueSupplementalOverWindow — state %j — null',
            (state) => {
                expect(accrueSupplementalOverWindow({ ...octoberBase, state })).toBeNull();
            },
        );

        it('accrueSupplementalOverWindow — unparseable acquisition date — null', () => {
            expect(
                accrueSupplementalOverWindow({ ...octoberBase, acquisitionDate: 'not-a-date' }),
            ).toBeNull();
        });

        it('accrueSupplementalOverWindow — unparseable resale date — null', () => {
            expect(
                accrueSupplementalOverWindow({ ...octoberBase, resaleDate: '10/25/2026' }),
            ).toBeNull();
        });

        it('accrueSupplementalOverWindow — same-calendar-month flip — null ($0 owed)', () => {
            // Both presumed dates are Nov 1 — the windows tile with zero overlap.
            expect(
                accrueSupplementalOverWindow({ ...octoberBase, resaleDate: '2026-10-25' }),
            ).toBeNull();
        });

        it('accrueSupplementalOverWindow — purchase in the current month (0 accrued) — null', () => {
            expect(
                accrueSupplementalOverWindow({
                    ...octoberBase,
                    acquisitionDate: '2026-07-06',
                    asOf: '2026-07-20',
                }),
            ).toBeNull();
        });

        it('accrueSupplementalOverWindow — rows matching no schedule slot — null', () => {
            expect(
                accrueSupplementalOverWindow({
                    ...octoberBase,
                    rows: [{ ...octoberBill, fiscalYear: 2020 }],
                }),
            ).toBeNull();
        });
    });

    describe('held (accruing to asOf)', () => {
        it('accrueSupplementalOverWindow — Oct purchase, asOf Dec — 2/8 of the bill, accruing', () => {
            // Owned Nov 1 → Jan 1 = 2 of the slot's 8 billed months: −800 × 2/8.
            expect(accrueSupplementalOverWindow(octoberBase)).toEqual({
                amount: -200,
                monthsOwned: 2,
                status: 'accruing',
            });
        });

        it('accrueSupplementalOverWindow — June event — accrual starts Jul 1 of the next FY', () => {
            // June → single next-FY slot at 1.00 (12 billed months, Jul–Jun).
            const result = accrueSupplementalOverWindow({
                rows: [{ fiscalYear: 2026, billType: 'bill', amount: 1_200 }],
                acquisitionDate: '2026-06-15',
                resaleDate: null,
                asOf: '2026-09-10',
                state: 'CA',
            });
            // Owned Jul 1 → Oct 1 = 3 of 12 months: −1,200 × 3/12.
            expect(result).toEqual({ amount: -300, monthsOwned: 3, status: 'accruing' });
        });

        it('accrueSupplementalOverWindow — asOf past the last billed month — full statutory sum, final', () => {
            const result = accrueSupplementalOverWindow({ ...octoberBase, asOf: '2027-08-10' });
            expect(result).toEqual({ amount: -800, monthsOwned: 10, status: 'final' });
        });
    });

    describe('completed flip (resale closes the window)', () => {
        it('accrueSupplementalOverWindow — Oct purchase resold Feb — 4/8 of the bill, final', () => {
            const result = accrueSupplementalOverWindow({
                ...octoberBase,
                resaleDate: '2027-02-10',
            });
            expect(result).toEqual({ amount: -400, monthsOwned: 4, status: 'final' });
        });

        it('accrueSupplementalOverWindow — Jan–May event resold in the second FY — both rows prorate', () => {
            // Feb 2026 event: slot 1 = FY 2025 billed Mar–Jun (4 months), slot 2 = FY 2026 full year.
            const result = accrueSupplementalOverWindow({
                rows: [
                    { fiscalYear: 2025, billType: 'bill', amount: 400 },
                    { fiscalYear: 2026, billType: 'bill', amount: 1_200 },
                ],
                acquisitionDate: '2026-02-10',
                resaleDate: '2026-09-15',
                asOf: '2026-12-01',
                state: 'CA',
            });
            // Slot 1 fully owned (−400) + Jul→Oct = 3/12 of slot 2 (−300).
            expect(result).toEqual({ amount: -700, monthsOwned: 7, status: 'final' });
        });

        it('accrueSupplementalOverWindow — Jan–May event resold before Jul 1 — second-FY row at zero share', () => {
            const result = accrueSupplementalOverWindow({
                rows: [
                    { fiscalYear: 2025, billType: 'bill', amount: 400 },
                    { fiscalYear: 2026, billType: 'bill', amount: 1_200 },
                ],
                acquisitionDate: '2026-02-10',
                resaleDate: '2026-05-10',
                asOf: '2026-12-01',
                state: 'CA',
            });
            // Owned Mar 1 → Jun 1 = 3 of slot 1's 4 billed months; slot 2 never starts.
            expect(result).toEqual({ amount: -300, monthsOwned: 3, status: 'final' });
        });

        it('accrueSupplementalOverWindow — resale after every billed month — full statutory sum, final (matches v1)', () => {
            const result = accrueSupplementalOverWindow({
                ...octoberBase,
                resaleDate: '2028-03-01',
            });
            expect(result?.amount).toBe(-800);
            expect(result?.status).toBe('final');
        });
    });

    describe('signs (bill = −, refund = +, matching the v1 display convention)', () => {
        it('accrueSupplementalOverWindow — refund rows — positive, scaled symmetrically', () => {
            const result = accrueSupplementalOverWindow({
                ...octoberBase,
                rows: [{ ...octoberBill, billType: 'refund' }],
            });
            expect(result).toEqual({ amount: 200, monthsOwned: 2, status: 'accruing' });
        });

        it('accrueSupplementalOverWindow — mixed bill + refund rows — signed sum, rounded to cents', () => {
            // Apr 2026 event: FY-2025 bill fully owned (−100) + 2/12 of the FY-2026
            // refund (+25 × 2/12 = +4.1667) → −95.83.
            const result = accrueSupplementalOverWindow({
                rows: [
                    { fiscalYear: 2025, billType: 'bill', amount: 100 },
                    { fiscalYear: 2026, billType: 'refund', amount: 25 },
                ],
                acquisitionDate: '2026-04-20',
                resaleDate: '2026-08-15',
                asOf: '2026-12-01',
                state: 'CA',
            });
            expect(result).toEqual({ amount: -95.83, monthsOwned: 4, status: 'final' });
        });
    });
});
