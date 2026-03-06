import { createContext, ReactNode, useContext, useState, useCallback, useRef } from "react";
import type { CompanyContactWithCounts } from "@/types/companies";
import type { DirectorySortOption } from "@/types/options";
import { fetchCompanyContactsPage, fetchCompanyById } from "@/api/companies.api";
import { useFilters } from "./useFilters";
import { useView } from "./useView";

const DEFAULT_PAGE_SIZE = 50;

export type CompaniesContextValue = {
  company: CompanyContactWithCounts | null;
  setCompany: (company: CompanyContactWithCounts | null) => void;
  companies: CompanyContactWithCounts[];
  total: number;
  hasMore: boolean;
  isLoadingCompanies: boolean;
  isLoadingMoreCompanies: boolean;
  directorySort: DirectorySortOption;
  directorySearch: string;
  setDirectorySort: (sort: DirectorySortOption) => void;
  setDirectorySearch: (search: string) => void;
  loadCompanies: (overrides?: { sort?: DirectorySortOption; search?: string }) => Promise<void>;
  loadMoreCompanies: () => Promise<void>;
  companySelectionInProgressRef: React.MutableRefObject<boolean>;
  handleCompanyClick: (companyName: string, companyId: string | null, keepPanelOpen?: boolean) => void;
  /** When user selects a company from panel/modal that isn't in the loaded list, we fetch and show it here so scroll-into-view works */
  ensuredCompany: CompanyContactWithCounts | null;
};

const CompaniesContext = createContext<CompaniesContextValue | null>(null);

type CompanyProviderProps = {
  children: ReactNode;
};

export function CompaniesProvider({ children }: CompanyProviderProps) {
  const { filters } = useFilters();
  const { setSidebarView } = useView();
  const [company, setCompanyState] = useState<CompanyContactWithCounts | null>(null);
  const setCompany = useCallback((value: CompanyContactWithCounts | null) => {
    setCompanyState(value);
    if (value == null) setEnsuredCompany(null);
  }, []);
  const [companies, setCompaniesState] = useState<CompanyContactWithCounts[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(false);
  const [isLoadingMoreCompanies, setIsLoadingMoreCompanies] = useState(false);
  const [directorySort, setDirectorySortState] = useState<DirectorySortOption>("most-properties");
  const [directorySearch, setDirectorySearchState] = useState("");
  const [ensuredCompany, setEnsuredCompany] = useState<CompanyContactWithCounts | null>(null);
  const companySelectionInProgressRef = useRef(false);
  const loadCompaniesAbortRef = useRef<AbortController | null>(null);

  const loadCompanies = useCallback(
    async (overrides?: { sort?: DirectorySortOption; search?: string }) => {
      const sort = overrides?.sort ?? directorySort;
      const search = overrides?.search ?? directorySearch;
      const county = filters.county ?? "";
      // Never run a "load all" (no overrides) when user has active search – prevents search results being overwritten by a stale effect
      if (!overrides && directorySearch.trim() !== "") {
        return;
      }
      loadCompaniesAbortRef.current?.abort();
      const controller = new AbortController();
      loadCompaniesAbortRef.current = controller;

      if (overrides?.sort !== undefined) setDirectorySortState(overrides.sort);
      if (overrides?.search !== undefined) setDirectorySearchState(overrides.search);
      setEnsuredCompany(null);
      setPage(1);
      setIsLoadingCompanies(true);
      try {
        const data = await fetchCompanyContactsPage({
          county: county || undefined,
          page: 1,
          limit: DEFAULT_PAGE_SIZE,
          sort,
          search,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (data) {
          setCompaniesState(data.companies);
          setTotal(data.total);
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        throw err;
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingCompanies(false);
        }
      }
    },
    [filters.county, directorySort, directorySearch]
  );

  const loadMoreCompanies = useCallback(async () => {
    const county = filters.county ?? "";
    const nextPage = page + 1;
    if (total > 0 && (nextPage - 1) * DEFAULT_PAGE_SIZE >= total) return;
    setIsLoadingMoreCompanies(true);
    try {
      const data = await fetchCompanyContactsPage({
        county: county || undefined,
        page: nextPage,
        limit: DEFAULT_PAGE_SIZE,
        sort: directorySort,
        search: directorySearch,
      });
      if (data && data.companies.length > 0) {
        setCompaniesState((prev) => [...prev, ...data.companies]);
        setPage(nextPage);
      }
    } finally {
      setIsLoadingMoreCompanies(false);
    }
  }, [filters.county, directorySort, directorySearch, page, total]);

  const setDirectorySort = useCallback((sort: DirectorySortOption) => {
    setDirectorySortState(sort);
  }, []);

  const setDirectorySearch = useCallback((search: string) => {
    setDirectorySearchState(search);
  }, []);

  const handleCompanyClick = useCallback(
    async (companyName: string, companyId: string | null, _keepPanelOpen?: boolean) => {
      companySelectionInProgressRef.current = true;
      try {
        const found = companies.find(
          (c) => c.id === companyId || c.companyName.trim().toLowerCase() === companyName.trim().toLowerCase()
        );
        if (found) {
          setEnsuredCompany(null);
          setCompany(found);
        } else if (companyId) {
          const stub: CompanyContactWithCounts = {
            id: companyId,
            companyName,
            propertyCount: 0,
            propertiesSoldCount: 0,
            propertiesSoldCountAllTime: 0,
          } as CompanyContactWithCounts;
          setCompany(stub);
          setSidebarView("directory");
          try {
            const detail = await fetchCompanyById(companyId);
            if (detail) {
              const withCounts: CompanyContactWithCounts = {
                ...detail,
                companyName: detail.companyName ?? companyName,
                propertyCount: detail.propertyCount ?? 0,
                propertiesSoldCount: detail.propertiesSoldCount ?? 0,
                propertiesSoldCountAllTime: detail.propertiesSoldCountAllTime ?? 0,
              };
              setCompany(withCounts);
              setEnsuredCompany(withCounts);
            } else {
              setEnsuredCompany(stub);
            }
          } catch {
            setEnsuredCompany(stub);
          }
        } else {
          setCompany({
            id: "",
            companyName,
            propertyCount: 0,
            propertiesSoldCount: 0,
            propertiesSoldCountAllTime: 0,
          } as CompanyContactWithCounts);
          setEnsuredCompany(null);
        }
        setSidebarView("directory");
      } finally {
        companySelectionInProgressRef.current = false;
      }
    },
    [companies, setCompany, setSidebarView]
  );

  const hasMore = total > companies.length;

  const value: CompaniesContextValue = {
    company,
    setCompany,
    companies,
    total,
    hasMore,
    isLoadingCompanies,
    isLoadingMoreCompanies,
    directorySort,
    directorySearch,
    setDirectorySort,
    setDirectorySearch,
    loadCompanies,
    loadMoreCompanies,
    companySelectionInProgressRef,
    handleCompanyClick,
    ensuredCompany,
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
