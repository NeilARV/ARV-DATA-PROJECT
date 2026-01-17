import { createInsertSchema } from "drizzle-zod";
import { companies } from "../schema";

export const insertCompanySchema = createInsertSchema(companies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});