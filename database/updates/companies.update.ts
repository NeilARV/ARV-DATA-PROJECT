import { z } from "zod";

export const updateCompanySchema = z.object({
  isArvClient: z.boolean().optional(),
}).strict();
