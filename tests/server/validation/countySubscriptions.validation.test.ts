import { describe, it, expect } from 'vitest';
import {
    countySubscriptionSchema,
    countySubscriptionSelectionSchema,
} from '../../../database/validation/countySubscriptions.validation';

describe('countySubscriptionSchema', () => {
    const valid = { county: 'San Diego', state: 'CA', msaId: 1 };

    it('accepts a well-formed (county, state, msaId)', () => {
        expect(countySubscriptionSchema.safeParse(valid).success).toBe(true);
    });

    it('trims surrounding whitespace on county', () => {
        const result = countySubscriptionSchema.safeParse({ ...valid, county: '  San Diego  ' });
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.county).toBe('San Diego');
    });

    it.each([
        ['empty county', { ...valid, county: '' }],
        ['whitespace-only county', { ...valid, county: '   ' }],
        ['lowercase state', { ...valid, state: 'ca' }],
        ['one-letter state', { ...valid, state: 'C' }],
        ['three-letter state', { ...valid, state: 'CAL' }],
        ['numeric state', { ...valid, state: 'C1' }],
        ['zero msaId', { ...valid, msaId: 0 }],
        ['negative msaId', { ...valid, msaId: -1 }],
        ['fractional msaId', { ...valid, msaId: 1.5 }],
    ])('rejects %s', (_label, input) => {
        expect(countySubscriptionSchema.safeParse(input).success).toBe(false);
    });
});

describe('countySubscriptionSelectionSchema', () => {
    const valid = { county: 'San Diego', state: 'CA' };

    it('accepts a well-formed (county, state) with no msaId', () => {
        expect(countySubscriptionSelectionSchema.safeParse(valid).success).toBe(true);
    });

    it('trims surrounding whitespace on county', () => {
        const result = countySubscriptionSelectionSchema.safeParse({
            ...valid,
            county: '  San Diego  ',
        });
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.county).toBe('San Diego');
    });

    it.each([
        ['empty county', { ...valid, county: '' }],
        ['whitespace-only county', { ...valid, county: '   ' }],
        ['missing county', { state: 'CA' }],
        ['lowercase state', { ...valid, state: 'ca' }],
        ['one-letter state', { ...valid, state: 'C' }],
        ['three-letter state', { ...valid, state: 'CAL' }],
        ['numeric state', { ...valid, state: 'C1' }],
        ['missing state', { county: 'San Diego' }],
    ])('rejects %s', (_label, input) => {
        expect(countySubscriptionSelectionSchema.safeParse(input).success).toBe(false);
    });
});
