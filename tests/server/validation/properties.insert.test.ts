import { describe, it, expect } from 'vitest';
import { insertSupplementalTaxBillSchema } from '../../../database/inserts/properties.insert';

/** Baseline valid insert — mirrors the §2 worked example row. */
const valid = {
    propertyId: '8b7e6a4c-2f3d-4e5a-9c1b-0d2e4f6a8b0c',
    propertyTransactionId: 101,
    fiscalYear: 2026,
    billType: 'bill',
    priorAssessedValue: '122000.00',
    newBaseValue: '1000000.00',
    netSupplementalValue: '878000.00',
    taxRate: '0.0125',
    prorationFactor: '0.92',
    amount: '10097.00',
    priorValueSource: 'assessment',
};

describe('insertSupplementalTaxBillSchema', () => {
    it('insertSupplementalTaxBillSchema — full valid bill — passes', () => {
        expect(insertSupplementalTaxBillSchema.safeParse(valid).success).toBe(true);
    });

    it('insertSupplementalTaxBillSchema — refund billType — passes', () => {
        expect(
            insertSupplementalTaxBillSchema.safeParse({ ...valid, billType: 'refund' }).success,
        ).toBe(true);
    });

    it('insertSupplementalTaxBillSchema — null priorAssessedValue — passes (nullable column)', () => {
        expect(
            insertSupplementalTaxBillSchema.safeParse({ ...valid, priorAssessedValue: null })
                .success,
        ).toBe(true);
    });

    it.each([
        ['propertyId'],
        ['propertyTransactionId'],
        ['fiscalYear'],
        ['billType'],
        ['newBaseValue'],
        ['netSupplementalValue'],
        ['taxRate'],
        ['prorationFactor'],
        ['amount'],
        ['priorValueSource'],
    ])('insertSupplementalTaxBillSchema — missing required %s — fails', (key) => {
        const input: Record<string, unknown> = { ...valid };
        delete input[key];
        expect(insertSupplementalTaxBillSchema.safeParse(input).success).toBe(false);
    });

    it('insertSupplementalTaxBillSchema — string fiscalYear — fails (integer column)', () => {
        expect(
            insertSupplementalTaxBillSchema.safeParse({ ...valid, fiscalYear: '2026' }).success,
        ).toBe(false);
    });

    it('insertSupplementalTaxBillSchema — numeric amount — fails (Drizzle decimals are strings)', () => {
        expect(
            insertSupplementalTaxBillSchema.safeParse({ ...valid, amount: 10_097 }).success,
        ).toBe(false);
    });

    it('insertSupplementalTaxBillSchema — unknown billType — fails (enum)', () => {
        expect(
            insertSupplementalTaxBillSchema.safeParse({ ...valid, billType: 'credit' }).success,
        ).toBe(false);
    });

    it('insertSupplementalTaxBillSchema — generated columns in input — stripped, not accepted', () => {
        const result = insertSupplementalTaxBillSchema.safeParse({
            ...valid,
            supplementalTaxBillsId: 99,
            createdAt: new Date(),
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect('supplementalTaxBillsId' in result.data).toBe(false);
            expect('createdAt' in result.data).toBe(false);
        }
    });
});
