import { describe, it, expect } from 'vitest';
import { updateUserProfileSchema } from '@database/updates';

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
