import type { Company } from "@database/types/companies";

export type CompanyContactWithCounts = Company & {
  propertyCount: number;
};