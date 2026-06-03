import { z } from 'zod';

export const insertCompanyClaimSchema = z.object({
    companyId: z.string().uuid(),
});
