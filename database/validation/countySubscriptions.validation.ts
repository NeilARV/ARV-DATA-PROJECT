import { z } from 'zod';

// The (county, state, msaId) shape check the old MSA-only link table never had. Kept to the shape the
// database layer can own alone — county↔MSA membership is derived upstream (COUNTY_TO_MSA, issue #112),
// not re-encoded here, so this stays a pure schema with no cross-layer coupling.
export const countySubscriptionSchema = z.object({
    county: z.string().trim().min(1, 'County is required'),
    state: z.string().regex(/^[A-Z]{2}$/, 'State must be a 2-letter uppercase code'),
    msaId: z.number().int().positive('msaId must be a positive integer'),
});

export type CountySubscriptionInput = z.infer<typeof countySubscriptionSchema>;
