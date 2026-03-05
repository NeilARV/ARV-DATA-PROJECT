import type { Company } from "@database/types/companies";
import type { PropertyFilters } from "@/types/filters";
import type { View } from "@/types/options";

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

export type CompanyDirectoryProps = {
  onClose?: () => void;
  onSwitchToFilters?: () => void;
  onCompanySelect?: (companyName: string | null, companyId?: string | null) => void;
  selectedCompany?: string | null;
  selectedCompanyId?: string | null;
  viewMode?: View;
}