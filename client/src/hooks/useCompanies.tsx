import { createContext, ReactNode, useContext, useState } from "react";

type CompaniesContextValue = {
    company: string | null;
    setCompany: (company: string | null) => void;

    companyId: string | null;
    setCompanyId: (company: string | null) => void;
}

const CompaniesContext = createContext<CompaniesContextValue | null>(null);

type CompanyProviderProps = {
    children: ReactNode
}

export function CompaniesProvider({children}: CompanyProviderProps) {

    const [ company, setCompany ] = useState<string | null>(null)
    const [ companyId, setCompanyId ] = useState<string | null>(null)

    const value = {
        company,
        setCompany,
        companyId,
        setCompanyId
    }

    return (
        <CompaniesContext.Provider value={value}>{children}</CompaniesContext.Provider>
    )
}

export function useCompanies(): CompaniesContextValue {
    const ctx = useContext(CompaniesContext);
    if (!ctx) {
        throw new Error(`Error with companies provider and context`);
    }
    return ctx;
}