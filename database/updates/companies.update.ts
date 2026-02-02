import { z } from "zod";

export const updateCompanySchema = z.object({
  companyName: z.string().min(1, "Company name is required").optional(),
  contactName: z.string().nullable().optional(),
  contactEmail: z.preprocess(
    (val) => (val === "" || val === undefined ? null : val),
    z.union([
      z.string().email("Invalid email address"),
      z.null(),
    ]).optional()
  ),
  phoneNumber: z.string().nullable().optional(),
  counties: z.array(z.string()).nullable().optional(),
}).strict();