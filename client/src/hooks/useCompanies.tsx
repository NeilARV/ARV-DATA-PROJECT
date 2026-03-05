import { createContext, ReactNode, useContext, useState, useCallback, useRef } from "react";
import type { CompanyContactWithCounts } from "@/types/companies";
import { fetchCompanyContacts } from "@/api/companies.api";
import { useFilters } from "./useFilters";

export type CompaniesContextValue = {
  /** Currently selected company (full object) or null */
  company: CompanyContactWithCounts | null;
  setCompany: (company: CompanyContactWithCounts | null) => void;

  /** List of companies (e.g. for directory). Fetched via loadCompanies(county?). */
  companies: CompanyContactWithCounts[];
  setCompanies: (companies: CompanyContactWithCounts[]) => void;

  /** True while loadCompanies is in progress. */
  isLoadingCompanies: boolean;

  /** Fetch companies from API and set companies state. Optional county filter. */
  loadCompanies: () => Promise<void>;

  /**
   * Ref set to true while a company selection is in progress (e.g. before setCompany).
   * Used by useMapCenterFromFilters to avoid moving the map from filters until we've centered on the company.
   * Set to true when initiating selection; useMapCenterFromFilters sets to false when done centering.
   */
  companySelectionInProgressRef: React.MutableRefObject<boolean>;
};

const CompaniesContext = createContext<CompaniesContextValue | null>(null);

type CompanyProviderProps = {
  children: ReactNode;
};

export function CompaniesProvider({ children }: CompanyProviderProps) {
  const { filters } = useFilters();
  const [company, setCompany] = useState<CompanyContactWithCounts | null>(null);
  const [companies, setCompaniesState] = useState<CompanyContactWithCounts[]>([]);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(false);
  const companySelectionInProgressRef = useRef(false);

  const loadCompanies = useCallback(async () => {
    setIsLoadingCompanies(true);
    try {
      const data = await fetchCompanyContacts(filters.county);
      setCompaniesState(data ?? []);
    } finally {
      setIsLoadingCompanies(false);
    }
  }, [filters.county]);

  const value: CompaniesContextValue = {
    company,
    setCompany,
    companies,
    setCompanies: setCompaniesState,
    isLoadingCompanies,
    loadCompanies,
    companySelectionInProgressRef,
  };

  return (
    <CompaniesContext.Provider value={value}>{children}</CompaniesContext.Provider>
  );
}

export function useCompanies(): CompaniesContextValue {
    const ctx = useContext(CompaniesContext);
    if (!ctx) {
        throw new Error("useCompanies must be used within a CompaniesProvider");
    }
    return ctx;
}
