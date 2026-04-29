import { z } from "zod";

const SUBSCRIPTION_TIERS = ["basic", "pro", "premium"] as const;

export const adminPatchUserSchema = z.object({
  subscriptionTier: z.enum(SUBSCRIPTION_TIERS).nullable().optional(),
  accountTypes: z.array(z.string().min(1)).optional(),
  relationshipManagerId: z.string().uuid().nullable().optional(),
});

export type AdminPatchUser = z.infer<typeof adminPatchUserSchema>;

export const updateUserProfileSchema = z.object({
  firstName: z.string().min(1, "First name is required").optional(),
  lastName: z.string().min(1, "Last name is required").optional(),
  email: z.string().email("Invalid email address").optional(),
  phone: z.string().min(1, "Phone is required").optional(),
  notifications: z.boolean().optional(),
  msaSubscriptions: z.array(z.string()).optional(),
  county: z.string().nullable().optional(),
  state: z.string().max(2).nullable().optional(),
}).strict();