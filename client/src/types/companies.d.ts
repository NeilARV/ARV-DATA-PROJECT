import type { Company } from "@database/types/companies";
import type { PropertyFilters } from "@/types/filters";
import type { View } from "@/types/options";

export type CompanyContactWithCounts = Company & {
  propertyCount: number;
  propertiesSoldCount: number;
  propertiesSoldCountAllTime: number;
  wholesaleBuyCount: number;
  isFinancedByARV: boolean;
  // Joined from company_contacts (primary contact)
  contactName?: string | null;
  contactEmail?: string | null;
  phoneNumber?: string | null;
};

export type CompanyContactDetail = Company & {
  propertiesSoldCount: number;
  propertiesSoldCountAllTime?: number;
  acquisition90DayTotal: number;
  acquisition90DayByMonth: Array<{ key: string; count: number }>;
  // Joined from company_contacts (primary contact)
  contactName?: string | null;
  contactEmail?: string | null;
  phoneNumber?: string | null;
};

export type CompanyDirectoryProps = Record<string, never>;
