import { z } from "zod";
import { companies } from "../schema/companies.schema";
import { insertCompanySchema } from "../insert/companies.insert";
import { updateCompanySchema } from "../update/companies.update";

export type Company = typeof companies.$inferSelect;
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type UpdateCompany = z.infer<typeof updateCompanySchema>;