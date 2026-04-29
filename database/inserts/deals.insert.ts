import { z } from "zod";

export const dealFormSchema = z
  .object({
    address:      z.string().optional(),
    city:         z.string().min(1, "City is required"),
    state:        z.string().length(2, "State must be 2 characters"),
    zipCode:      z.string().min(5, "Valid zip code is required").max(10),
    price:        z.coerce
                    .number({ invalid_type_error: "Price must be a number" })
                    .positive("Price must be greater than 0"),
    dealType:     z.enum(["wholesale", "agent", "sold"]).default("agent"),
    beds:         z.coerce.number().int().positive().optional(),
    baths:        z.coerce.number().positive().optional(),
    sqft:         z.coerce.number().int().positive().optional(),
    propertyType:      z.string().optional(),
    potentialARV:      z.preprocess(
                         (v) => (v === "" || v == null ? undefined : v),
                         z.coerce.number().positive("ARV must be greater than 0").optional()
                       ),
    notes:             z.string().max(1000, "Notes must be 1000 characters or fewer").optional(),
    closeOfEscrow:     z.preprocess(
                         (v) => (v === "" || v == null ? undefined : v),
                         z.coerce.number().positive("Close of escrow must be greater than 0").optional()
                       ),
    sendNotifications: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    const hasFullAddress =
      typeof data.address === "string" && /^\d+[a-zA-Z]?\s+/i.test(data.address.trim());
    if (!hasFullAddress) {
      if (data.beds == null)
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["beds"],         message: "Required when no street address" });
      if (data.baths == null)
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["baths"],        message: "Required when no street address" });
      if (data.sqft == null)
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sqft"],         message: "Required when no street address" });
      if (!data.propertyType)
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["propertyType"], message: "Required when no street address" });
    }
  });

export type DealFormValues = z.infer<typeof dealFormSchema>;
