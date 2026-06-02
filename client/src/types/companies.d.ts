import type { Company } from '@database/types/companies';
import type { PropertyFilters } from '@/types/filters';
import type { View } from '@/types/options';

export type CompanyContact = {
    id: number;
    companyId: string;
    userId: string | null;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phoneNumber: string | null;
    title: string | null;
    sortOrder: number;
    createdAt: string;
    updatedAt: string | null;
};

export type CompanyContactWithCounts = Company & {
    propertyCount: number;
    propertiesSoldCount: number;
    propertiesSoldCountAllTime: number;
    propertiesBoughtCount: number;
    propertiesBoughtCountAllTime: number;
    wholesaleBuyCount: number;
    wholesalerCount: number;
    isFinancedByARV: boolean;
    // Joined from company_contacts (primary contact)
    contactName?: string | null;
    contactEmail?: string | null;
    phoneNumber?: string | null;
};

export type CompanyContactDetail = Company & {
    propertyCount: number;
    propertiesSoldCount: number;
    propertiesSoldCountAllTime?: number;
    acquisition90DayTotal: number;
    acquisition90DayByMonth: Array<{ key: string; count: number }>;
    contacts: CompanyContact[];
    // Derived from contacts[0] for backward compat
    contactName?: string | null;
    contactEmail?: string | null;
    phoneNumber?: string | null;
};

export type CompanyDirectoryProps = Record<string, never>;
