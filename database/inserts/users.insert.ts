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

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});