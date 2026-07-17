import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePinnedDeal } from '@/hooks/usePinnedDeal';
import type { Deal } from '@shared/types/deals';

vi.mock('@/lib/queryClient', () => ({
    apiRequest: vi.fn(),
}));

import { apiRequest } from '@/lib/queryClient';
const apiRequestMock = vi.mocked(apiRequest);

function makeDeal(overrides: Partial<Deal> = {}): Deal {
    return {
        id: 1,
        createdAt: '2026-07-01T00:00:00.000Z',
        msaId: 1,
        userId: 'user-1',
        links: [],
        isArvExclusive: false,
        city: 'San Diego',
        state: 'CA',
        zipCode: '92101',
        dealType: 'wholesale',
        ...overrides,
    };
}

type HookProps = { id: number | null; deals: Deal[] };

function renderPinnedDeal(dealId: number | null, loadedDeals: Deal[]) {
    // Fresh client per test so cached results never leak between cases; retry off so a
    // rejected fetch settles immediately instead of retrying three times.
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const rendered = renderHook(({ id, deals }: HookProps) => usePinnedDeal(id, deals), {
        wrapper,
        initialProps: { id: dealId, deals: loadedDeals },
    });
    return { ...rendered, queryClient };
}

beforeEach(() => {
    apiRequestMock.mockReset();
});

describe('usePinnedDeal', () => {
    it('usePinnedDeal — deal absent from loaded pages — fetches and pins it', async () => {
        const pinned = makeDeal({ id: 42 });
        apiRequestMock.mockResolvedValue({ json: async () => pinned } as Response);

        const { result } = renderPinnedDeal(42, [makeDeal({ id: 1 })]);

        await waitFor(() => expect(result.current.pinnedDeal).toEqual(pinned));
        expect(result.current.isGone).toBe(false);
        expect(apiRequestMock).toHaveBeenCalledWith('GET', '/api/deals/42');
    });

    it('usePinnedDeal — deal already in loaded pages — no fetch, no pin', () => {
        const { result } = renderPinnedDeal(1, [makeDeal({ id: 1 })]);

        expect(apiRequestMock).not.toHaveBeenCalled();
        expect(result.current.pinnedDeal).toBeNull();
        expect(result.current.isGone).toBe(false);
    });

    it('usePinnedDeal — no dealId in the URL — idle', () => {
        const { result } = renderPinnedDeal(null, [makeDeal({ id: 1 })]);

        expect(apiRequestMock).not.toHaveBeenCalled();
        expect(result.current.pinnedDeal).toBeNull();
        expect(result.current.isGone).toBe(false);
    });

    it('usePinnedDeal — deal deleted (404) — reports gone with no pin', async () => {
        apiRequestMock.mockRejectedValue(new Error('404: Deal not found'));

        const { result } = renderPinnedDeal(42, []);

        await waitFor(() => expect(result.current.isGone).toBe(true));
        expect(result.current.pinnedDeal).toBeNull();
    });

    it('usePinnedDeal — non-404 failure — neither pins nor reports gone', async () => {
        apiRequestMock.mockRejectedValue(new Error('500: boom'));

        const { result, queryClient } = renderPinnedDeal(42, []);

        await waitFor(() =>
            expect(queryClient.getQueryState(['/api/deals', 42])?.status).toBe('error'),
        );
        expect(result.current.pinnedDeal).toBeNull();
        expect(result.current.isGone).toBe(false);
    });

    it('usePinnedDeal — pinned deal later appears in a loaded page — dedupes to the feed copy', async () => {
        const pinned = makeDeal({ id: 42 });
        apiRequestMock.mockResolvedValue({ json: async () => pinned } as Response);

        const { result, rerender } = renderPinnedDeal(42, [makeDeal({ id: 1 })]);
        await waitFor(() => expect(result.current.pinnedDeal).toEqual(pinned));

        rerender({ id: 42, deals: [makeDeal({ id: 1 }), pinned] });

        expect(result.current.pinnedDeal).toBeNull();
        expect(result.current.isGone).toBe(false);
    });
});
