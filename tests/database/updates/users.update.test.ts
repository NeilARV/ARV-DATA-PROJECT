import { describe, it, expect } from 'vitest';
import { updateUserProfileSchema, updateEmailSubscriptionListSchema } from '@database/updates';

describe('updateUserProfileSchema', () => {
    it('accepts a profile update with a countySubscriptions replace-list', () => {
        const result = updateUserProfileSchema.safeParse({
            firstName: 'Jane',
            countySubscriptions: [
                { county: 'Denver', state: 'CO' },
                { county: 'San Diego', state: 'CA' },
            ],
        });
        expect(result.success).toBe(true);
    });

    it('accepts an empty countySubscriptions list (clears all rows)', () => {
        const result = updateUserProfileSchema.safeParse({ countySubscriptions: [] });
        expect(result.success).toBe(true);
    });

    it('rejects the retired msaSubscriptions field (issue #118, strict schema)', () => {
        const result = updateUserProfileSchema.safeParse({
            msaSubscriptions: ['Denver-Aurora-Centennial, CO'],
        });
        expect(result.success).toBe(false);
    });

    it('rejects a countySubscriptions entry missing its state', () => {
        const result = updateUserProfileSchema.safeParse({
            countySubscriptions: [{ county: 'Denver' }],
        });
        expect(result.success).toBe(false);
    });
});

describe('updateEmailSubscriptionListSchema', () => {
    it('accepts a counties replace-list on its own', () => {
        const result = updateEmailSubscriptionListSchema.safeParse({
            counties: [{ county: 'Orange', state: 'CA' }],
        });
        expect(result.success).toBe(true);
    });

    it('accepts a relationshipManagerId change on its own (null clears)', () => {
        expect(
            updateEmailSubscriptionListSchema.safeParse({ relationshipManagerId: null }).success,
        ).toBe(true);
        expect(
            updateEmailSubscriptionListSchema.safeParse({
                relationshipManagerId: '00000134-0000-4000-8000-000000000001',
            }).success,
        ).toBe(true);
    });

    it('rejects an empty counties list', () => {
        expect(updateEmailSubscriptionListSchema.safeParse({ counties: [] }).success).toBe(false);
    });

    it('rejects a body with neither counties nor relationshipManagerId', () => {
        expect(updateEmailSubscriptionListSchema.safeParse({}).success).toBe(false);
    });

    it('rejects the retired msaName form (issue #134, strict schema)', () => {
        const result = updateEmailSubscriptionListSchema.safeParse({
            msaName: 'Denver-Aurora-Centennial, CO',
        });
        expect(result.success).toBe(false);
    });

    it('rejects a county entry missing its state', () => {
        const result = updateEmailSubscriptionListSchema.safeParse({
            counties: [{ county: 'Orange' }],
        });
        expect(result.success).toBe(false);
    });

    it('rejects a non-uuid relationshipManagerId', () => {
        const result = updateEmailSubscriptionListSchema.safeParse({
            relationshipManagerId: 'not-a-uuid',
        });
        expect(result.success).toBe(false);
    });
});
