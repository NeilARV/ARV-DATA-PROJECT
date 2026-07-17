import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { CompaniesProvider, useCompanies } from '@/hooks/useCompanies';
import type { GroupDirectoryRow } from '@shared/types/groups';
import type { CompanyContactWithCounts } from '@/types/companies';
import type { ReactNode } from 'react';

// Group selection in the companies context (TST.HOOK): company ↔ group mutual exclusivity, and
// ensureGroup's deep-link resolution — a valid ?group= id selects the group and expands filters;
// a stale id resolves false so the caller can deselect gracefully.

const setFiltersMock = vi.fn();
vi.mock('@/hooks/useFilters', () => ({
    useFilters: () => ({
        filters: { counties: ['San Diego'], statusFilters: [], dateRange: '90d' },
        setFilters: setFiltersMock,
    }),
}));
vi.mock('@/hooks/useView', () => ({
    useView: () => ({ setSidebarView: vi.fn() }),
}));

const fetchGroupDirectoryRowMock = vi.fn();
vi.mock('@/api/groups.api', () => ({
    fetchGroupDirectoryRow: (...args: unknown[]) => fetchGroupDirectoryRowMock(...args),
}));
vi.mock('@/api/companies.api', () => ({
    fetchCompanyContactsPage: vi.fn(async () => null),
    fetchCompanyById: vi.fn(async () => null),
}));

const GROUP_ROW: GroupDirectoryRow = {
    id: 'g1',
    name: 'ACME GROUP',
    companyCount: 2,
    propertyCount: 5,
    propertiesSoldCount: 0,
    propertiesSoldCountAllTime: 0,
    propertiesBoughtCount: 0,
    propertiesBoughtCountAllTime: 0,
    wholesaleBuyCount: 0,
    wholesalerCount: 0,
};

const COMPANY = { id: 'c1', companyName: 'ACME LLC' } as CompanyContactWithCounts;

const wrapper = ({ children }: { children: ReactNode }) => (
    <CompaniesProvider>{children}</CompaniesProvider>
);

beforeEach(() => {
    vi.clearAllMocks();
});

describe('useCompanies — group selection', () => {
    it('setGroup selects the group and clears the company (mutual exclusivity)', () => {
        const { result } = renderHook(() => useCompanies(), { wrapper });

        act(() => result.current.setCompany(COMPANY));
        expect(result.current.company?.id).toBe('c1');

        act(() => result.current.setGroup(GROUP_ROW));
        expect(result.current.group?.id).toBe('g1');
        expect(result.current.company).toBeNull();
    });

    it('setCompany clears a selected group (mutual exclusivity)', () => {
        const { result } = renderHook(() => useCompanies(), { wrapper });

        act(() => result.current.setGroup(GROUP_ROW));
        act(() => result.current.setCompany(COMPANY));

        expect(result.current.company?.id).toBe('c1');
        expect(result.current.group).toBeNull();
    });

    it('ensureGroup — valid deep link — selects the group and expands filters', async () => {
        fetchGroupDirectoryRowMock.mockResolvedValueOnce(GROUP_ROW);
        const { result } = renderHook(() => useCompanies(), { wrapper });

        let found = false;
        await act(async () => {
            found = await result.current.ensureGroup('g1');
        });

        expect(found).toBe(true);
        await waitFor(() => expect(result.current.group?.id).toBe('g1'));
        expect(setFiltersMock).toHaveBeenCalledWith(
            expect.objectContaining({ dateRange: 'all-time', companyRole: undefined }),
        );
    });

    it('ensureGroup — stale deep link — resolves false and selects nothing', async () => {
        fetchGroupDirectoryRowMock.mockResolvedValueOnce(null);
        const { result } = renderHook(() => useCompanies(), { wrapper });

        let found = true;
        await act(async () => {
            found = await result.current.ensureGroup('gone');
        });

        expect(found).toBe(false);
        expect(result.current.group).toBeNull();
        expect(setFiltersMock).not.toHaveBeenCalled();
    });
});
