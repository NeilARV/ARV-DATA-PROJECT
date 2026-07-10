import { z } from 'zod';
import {
    companies,
    companyDetails,
    companyAddresses,
    companyContacts,
    companyGroups,
    groupMembers,
} from '../schemas/companies.schema';
import { insertCompanySchema } from '../inserts/companies.insert';
import { insertCompanyContactSchema } from '../inserts/companyContacts.insert';
import { updateCompanySchema, updateCompanyContactSchema } from '../updates/companies.update';

export type Company = typeof companies.$inferSelect;
export type CompanyDetails = typeof companyDetails.$inferSelect;
export type CompanyAddress = typeof companyAddresses.$inferSelect;
export type CompanyContact = typeof companyContacts.$inferSelect;
export type CompanyGroup = typeof companyGroups.$inferSelect;
export type GroupMember = typeof groupMembers.$inferSelect;
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type InsertCompanyContact = z.infer<typeof insertCompanyContactSchema>;
export type UpdateCompany = z.infer<typeof updateCompanySchema>;
export type UpdateCompanyContact = z.infer<typeof updateCompanyContactSchema>;
