import { z } from "zod";

export const updateUserProfileSchema = z.object({
  firstName: z.string().min(1, "First name is required").optional(),
  lastName: z.string().min(1, "Last name is required").optional(),
  email: z.string().email("Invalid email address").optional(),
  phone: z.string().min(1, "Phone is required").optional(),
  notifications: z.boolean().optional(),
}).strict();