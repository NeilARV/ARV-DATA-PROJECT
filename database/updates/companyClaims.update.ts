import { z } from 'zod';

export const reviewCompanyClaimSchema = z
    .object({
        action: z.enum(['approve', 'reject']),
        adminNotes: z.string().max(1000).optional(),
        adminMessage: z.string().max(1000).optional(),
    })
    .strict();
