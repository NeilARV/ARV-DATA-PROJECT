import { createContext, ReactNode, useContext, useState, useCallback, useRef } from "react";
import type { CompanyContactWithCounts } from "@/types/companies";
import { fetchCompanyContacts } from "@/api/companies.api";
import { useFilters } from "./useFilters";
import { useView } from "./useView";

export type CompaniesContextValue = {
  company: CompanyContactWithCounts | null;
  setCompany: (company: CompanyContactWithCounts | null) => void;
  companies: CompanyContactWithCounts[];
  setCompanies: (companies: CompanyContactWithCounts[]) => void;
  isLoadingCompanies: boolean;
  loadCompanies: () => Promise<void>;
  companySelectionInProgressRef: React.MutableRefObject<boolean>;
  handleCompanyClick: (companyName: string, companyId: string | null, keepPanelOpen?: boolean) => void
};

const CompaniesContext = createContext<CompaniesContextValue | null>(null);

type CompanyProviderProps = {
  children: ReactNode;
};

export function CompaniesProvider({ children }: CompanyProviderProps) {
  const { filters } = useFilters();
  const { setSidebarView } = useView();
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

  const handleCompanyClick = (companyName: string, companyId: string | null, _keepPanelOpen?: boolean) => {
    companySelectionInProgressRef.current = true;
    const found = companies.find(
      (c) => c.id === companyId || c.companyName.trim().toLowerCase() === companyName.trim().toLowerCase()
    );
    setCompany(
      found ??
        ({
          id: companyId ?? "",
          companyName,
          propertyCount: 0,
          propertiesSoldCount: 0,
          propertiesSoldCountAllTime: 0,
        } as CompanyContactWithCounts)
    );
    setSidebarView("directory");
    // Callers that want to clear the property detail panel call setProperty(null) themselves
    // (CompaniesProvider cannot use useProperties because it must wrap PropertiesProvider in the tree)
  }

  const value: CompaniesContextValue = {
    company,
    setCompany,
    companies,
    setCompanies: setCompaniesState,
    isLoadingCompanies,
    loadCompanies,
    companySelectionInProgressRef,
    handleCompanyClick
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
