import { z } from "zod";
import { companies } from "../schemas/companies.schema";
import { insertCompanySchema } from "../inserts/companies.insert";
import { updateCompanySchema } from "../updates/companies.update";

export type Company = typeof companies.$inferSelect;
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type UpdateCompany = z.infer<typeof updateCompanySchema>;