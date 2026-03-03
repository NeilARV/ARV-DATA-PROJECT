import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users, emailWhitelist } from "../schemas";

const MSA_NAMES = [
  "San Diego-Chula Vista-Carlsbad, CA",
  "Los Angeles-Long Beach-Anaheim, CA",
  "Denver-Aurora-Centennial, CO",
  "San Francisco-Oakland-Fremont, CA",
] as const;

export const insertEmailWhitelistSchema = createInsertSchema(emailWhitelist).omit({
  id: true,
  createdAt: true,
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
});

export const insertUserBySignUpSchema = insertUserSchema
  .extend({
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

