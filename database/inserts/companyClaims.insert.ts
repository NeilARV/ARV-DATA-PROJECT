import { z } from 'zod';

export const insertCompanyClaimSchema = z.object({
    companyId: z.string().uuid(),
    userMessage: z.string().max(1000).optional(),
});
