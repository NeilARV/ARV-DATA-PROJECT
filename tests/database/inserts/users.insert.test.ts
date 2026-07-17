import { describe, it, expect } from 'vitest';
import { insertEmailSubscriptionListSchema } from '@database/inserts';

const VALID = {
    email: 'prospect@example.com',
    counties: [
        { county: 'San Diego', state: 'CA' },
        { county: 'Orange', state: 'CA' },
    ],
    relationshipManagerId: null,
};

describe('insertEmailSubscriptionListSchema', () => {
    it('accepts an entry with a counties replace-list', () => {
        expect(insertEmailSubscriptionListSchema.safeParse(VALID).success).toBe(true);
    });

    it('accepts an omitted relationshipManagerId', () => {
        const { relationshipManagerId: _rm, ...rest } = VALID;
        expect(insertEmailSubscriptionListSchema.safeParse(rest).success).toBe(true);
    });

    it('rejects an empty counties list', () => {
        const result = insertEmailSubscriptionListSchema.safeParse({ ...VALID, counties: [] });
        expect(result.success).toBe(false);
    });

    it('rejects a missing counties field', () => {
        const { counties: _counties, ...rest } = VALID;
        expect(insertEmailSubscriptionListSchema.safeParse(rest).success).toBe(false);
    });

    it('rejects the retired msaName form (issue #134)', () => {
        const { counties: _counties, ...rest } = VALID;
        const result = insertEmailSubscriptionListSchema.safeParse({
            ...rest,
            msaName: 'San Diego-Chula Vista-Carlsbad, CA',
        });
        expect(result.success).toBe(false);
    });

    it('rejects an invalid email', () => {
        const result = insertEmailSubscriptionListSchema.safeParse({
            ...VALID,
            email: 'not-an-email',
        });
        expect(result.success).toBe(false);
    });

    it('rejects a county entry missing its state', () => {
        const result = insertEmailSubscriptionListSchema.safeParse({
            ...VALID,
            counties: [{ county: 'San Diego' }],
        });
        expect(result.success).toBe(false);
    });

    it('rejects a non-uuid relationshipManagerId', () => {
        const result = insertEmailSubscriptionListSchema.safeParse({
            ...VALID,
            relationshipManagerId: 'not-a-uuid',
        });
        expect(result.success).toBe(false);
    });
});
