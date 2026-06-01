import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users, emailSubscriptionList } from "../schemas";

const MSA_NAMES = [
  "San Diego-Chula Vista-Carlsbad, CA",
  "Los Angeles-Long Beach-Anaheim, CA",
  "Riverside-San Bernardino-Ontario, CA",
  "Denver-Aurora-Centennial, CO",
  "San Francisco-Oakland-Fremont, CA",
  "Miami-Fort Lauderdale-West Palm Beach, FL",
  "Port St. Lucie, FL",
  "Seattle-Tacoma-Bellevue, WA",
  "Tampa-St. Petersburg-Clearwater, FL"
] as const;

export const insertEmailSubscriptionListSchema = createInsertSchema(emailSubscriptionList).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  msa: true,
}).extend({
  email: z.string().email("Invalid email address"),
  msaName: z.enum(MSA_NAMES, { message: "Please select an MSA" }),
  relationshipManagerId: z.string().uuid().optional().nullable(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  passwordHash: true,
  createdAt: true,
  updatedAt: true,
  notifications: true,
}).extend({
  password: z.string().min(6, "Password must be at least 6 characters"),
  email: z.string().email("Invalid email address"),
  phone: z.string().min(14, "Valid phone number is required"),
  county: z.string().nullable().optional(),
  state: z.string().max(2).nullable().optional(),
});

export const insertUserBySignUpSchema = insertUserSchema
  .extend({
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  })
  .refine(
    (data) => !(data.county && !data.state),
    { message: "State is required when a county is selected", path: ["state"] }
  );

