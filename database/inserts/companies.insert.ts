import { createInsertSchema } from "drizzle-zod";
import { companies } from "../schemas";

export const insertCompanySchema = createInsertSchema(companies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});