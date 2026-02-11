import type { Company } from "@database/types/companies";

export type CompanyContactWithCounts = Company & {
  propertyCount: number;
  propertiesSoldCount: number;
  propertiesSoldCountAllTime: number;
};

export type CompanyContactDetail = Company & {
  propertiesSoldCount: number;
  propertiesSoldCountAllTime?: number;
  acquisition90DayTotal: number;
  acquisition90DayByMonth: Array<{ key: string; count: number }>;
};