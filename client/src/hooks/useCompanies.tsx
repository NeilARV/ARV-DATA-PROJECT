import { createContext, ReactNode, useContext, useState, useCallback } from "react";
import type { CompanyContactWithCounts } from "@/types/companies";
import { fetchCompanyContacts } from "@/api/companies.api";

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
  loadCompanies: (county?: string) => Promise<void>;
};

const CompaniesContext = createContext<CompaniesContextValue | null>(null);

type CompanyProviderProps = {
  children: ReactNode;
};

export function CompaniesProvider({ children }: CompanyProviderProps) {
  const [company, setCompany] = useState<CompanyContactWithCounts | null>(null);
  const [companies, setCompaniesState] = useState<CompanyContactWithCounts[]>([]);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(false);

  const loadCompanies = useCallback(async (county?: string) => {
    setIsLoadingCompanies(true);
    try {
      const data = await fetchCompanyContacts(county);
      setCompaniesState(data ?? []);
    } finally {
      setIsLoadingCompanies(false);
    }
  }, []);

  const value: CompaniesContextValue = {
    company,
    setCompany,
    companies,
    setCompanies: setCompaniesState,
    isLoadingCompanies,
    loadCompanies,
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
