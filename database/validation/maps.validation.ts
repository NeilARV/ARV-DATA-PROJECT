import { z } from 'zod';

// Map endpoints read everything off the query string, so values arrive as strings (or string[] when
// a key repeats). This schema coerces + validates them once so the controllers can hand clean,
// typed filters to the service. A non-numeric edge/price coerces to NaN and is rejected by .finite().

/** A query param that may appear once (string) or repeated (string[]); always normalized to string[]. */
const stringOrArray = z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v : [v]));

/** Coerced number that rejects NaN/Infinity (so `?south=abc` fails validation instead of passing). */
const finiteNumber = z.coerce.number().finite();

/**
 * Validated query for the map endpoints (pins, extent, regions). The viewport box is all-or-nothing:
 * either none of south/west/north/east are present, or all four are.
 */
export const mapQuerySchema = z
    .object({
        county: z.string().optional(),
        status: stringOrArray.optional(),
        dateRange: z.string().optional(),
        companyId: z.string().optional(),
        companyRole: z.enum(['buyer', 'seller']).optional(),
        zipcode: z.string().optional(),
        city: z.string().optional(),
        minPrice: finiteNumber.optional(),
        maxPrice: finiteNumber.optional(),
        bedrooms: finiteNumber.optional(),
        bathrooms: finiteNumber.optional(),
        propertyType: stringOrArray.optional(),
        south: finiteNumber.optional(),
        west: finiteNumber.optional(),
        north: finiteNumber.optional(),
        east: finiteNumber.optional(),
    })
    .refine(
        (q) => {
            const provided = [q.south, q.west, q.north, q.east].filter(
                (e) => e !== undefined,
            ).length;
            return provided === 0 || provided === 4;
        },
        { message: 'Map bounds must include all of south, west, north, east' },
    );

export type MapQuery = z.infer<typeof mapQuerySchema>;
