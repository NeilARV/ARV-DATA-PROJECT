import { z } from "zod";

export const updateCompanySchema = z.object({
  companyName: z.string().min(1, "Company name is required").optional(),
  // Contact fields — to be managed via company_contacts routes (PATCH /api/companies/:id/contacts/:contactId)
  // Kept here temporarily so the edit dialog compiles during migration.
  contactName: z.string().nullable().optional(),
  contactEmail: z.preprocess(
    (val) => (val === "" || val === undefined ? null : val),
    z.union([
      z.string().email("Invalid email address"),
      z.null(),
    ]).optional()
  ),
  phoneNumber: z.string().nullable().optional(),
  isArvClient: z.boolean().optional(),
}).strict();
