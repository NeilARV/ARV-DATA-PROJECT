import { describe, it, expect } from 'vitest';
import { mapQuerySchema } from '@database/validation/maps.validation';

// Pins the query contract the map controllers rely on: county normalizes to string[]
// (single or repeated param), msa is a single string, and the viewport box stays
// all-or-nothing.

describe('mapQuerySchema', () => {
    it('accepts an empty query', () => {
        expect(mapQuerySchema.safeParse({}).success).toBe(true);
    });

    it('normalizes a single county param to a one-element array', () => {
        const result = mapQuerySchema.safeParse({ county: 'San Diego' });
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.county).toEqual(['San Diego']);
    });

    it('accepts repeated county params as an array', () => {
        const result = mapQuerySchema.safeParse({ county: ['Denver', 'Adams'] });
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.county).toEqual(['Denver', 'Adams']);
    });

    it('accepts msa alongside counties', () => {
        const result = mapQuerySchema.safeParse({
            msa: 'Denver-Aurora-Centennial, CO',
            county: ['Denver'],
        });
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.msa).toBe('Denver-Aurora-Centennial, CO');
    });

    it('rejects a repeated msa param', () => {
        const result = mapQuerySchema.safeParse({ msa: ['A, CA', 'B, CO'] });
        expect(result.success).toBe(false);
    });

    it('rejects a partially specified viewport box', () => {
        expect(mapQuerySchema.safeParse({ south: 32.5 }).success).toBe(false);
    });

    it('rejects a non-numeric viewport edge', () => {
        const result = mapQuerySchema.safeParse({
            south: 'abc',
            west: -117.3,
            north: 33.1,
            east: -116.9,
        });
        expect(result.success).toBe(false);
    });
});
