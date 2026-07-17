import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { useDealsNav } from '@/hooks/useNav';
import { getCountiesForMsa } from '@shared/constants/countyToMsa';
import type { ReactNode } from 'react';

// URL ↔ state sync for the Deals nav (TST.HOOK), mirroring useDataNav's: the selection parsed
// from ?msa=&counties= (and legacy ?filterType= deal-email deep links), the once-only
// subscribed-county default anchored on the home county, and setSelection/setTab preserving
// the rest of the URL.

const DENVER_MSA = 'Denver-Aurora-Centennial, CO';
const LA_MSA = 'Los Angeles-Long Beach-Anaheim, CA';

type MockUser = { county?: string; countySubscriptions?: { county: string }[] };
let mockUser: MockUser | null = { county: 'St. Lucie' };
vi.mock('@/hooks/use-auth', () => ({
    useAuth: () => ({ user: mockUser }),
}));

beforeEach(() => {
    mockUser = { county: 'St. Lucie' };
});

function renderDealsNav(path: string) {
    const memory = memoryLocation({ path, record: true });
    // wouter's default searchHook reads window.location; derive it from the memory path instead.
    const searchHook = () => {
        const [current] = memory.hook();
        const idx = current.indexOf('?');
        return idx === -1 ? '' : current.slice(idx + 1);
    };
    const wrapper = ({ children }: { children: ReactNode }) => (
        <Router hook={memory.hook} searchHook={searchHook}>
            {children}
        </Router>
    );
    const view = renderHook(() => useDealsNav(), { wrapper });
    return { ...view, history: memory.history };
}

describe('useDealsNav', () => {
    it('parses ?msa=&counties= from the URL into the selection', () => {
        const { result } = renderDealsNav(
            `/deals?msa=${encodeURIComponent(DENVER_MSA)}&counties=${encodeURIComponent('Denver,Adams')}`,
        );
        expect(result.current.selection).toEqual({
            msa: DENVER_MSA,
            counties: ['Denver', 'Adams'],
        });
    });

    it('an empty counties param parses as none selected', () => {
        const { result } = renderDealsNav(`/deals?msa=${encodeURIComponent(DENVER_MSA)}&counties=`);
        expect(result.current.selection).toEqual({ msa: DENVER_MSA, counties: [] });
    });

    it('resolves a legacy county deep link to that county within its MSA', () => {
        const { result } = renderDealsNav(
            '/deals?filterType=county&filterValue=Adams&filterState=CO',
        );
        expect(result.current.selection).toEqual({ msa: DENVER_MSA, counties: ['Adams'] });
    });

    it('resolves a legacy msa deep link to the whole MSA', () => {
        const { result } = renderDealsNav(
            `/deals?filterType=msa&filterValue=${encodeURIComponent(DENVER_MSA)}`,
        );
        expect(result.current.selection).toEqual({
            msa: DENVER_MSA,
            counties: getCountiesForMsa(DENVER_MSA),
        });
    });

    it('applies the home-county default to the URL exactly once on first load', async () => {
        const { result, history } = renderDealsNav('/deals');

        await waitFor(() => {
            expect(result.current.selection).toEqual({
                msa: 'Port St. Lucie, FL',
                counties: ['St. Lucie'],
            });
        });
        // Applied with replace — no extra history entry beyond the rewritten one.
        expect(history).toHaveLength(1);
        expect(history[0]).toContain('msa=');
    });

    it('pre-selects the subscribed counties within the home MSA on first load', async () => {
        mockUser = { county: 'St. Lucie', countySubscriptions: [{ county: 'Martin' }] };
        const { result } = renderDealsNav('/deals');

        await waitFor(() => {
            expect(result.current.selection).toEqual({
                msa: 'Port St. Lucie, FL',
                counties: ['Martin'],
            });
        });
    });

    it('falls back to the home county when no subscription is in the home MSA', async () => {
        mockUser = { county: 'St. Lucie', countySubscriptions: [{ county: 'Denver' }] };
        const { result } = renderDealsNav('/deals');

        await waitFor(() => {
            expect(result.current.selection).toEqual({
                msa: 'Port St. Lucie, FL',
                counties: ['St. Lucie'],
            });
        });
    });

    it('a legacy city deep link has no county equivalent — the default applies instead', async () => {
        const { result } = renderDealsNav(
            '/deals?filterType=city&filterValue=Aurora&filterState=CO',
        );
        await waitFor(() => {
            expect(result.current.selection).toEqual({
                msa: 'Port St. Lucie, FL',
                counties: ['St. Lucie'],
            });
        });
    });

    it('setSelection writes msa + counties, clears legacy params, and keeps tab + dealId', async () => {
        const { result, history } = renderDealsNav(
            '/deals?filterType=county&filterValue=Adams&filterState=CO&tab=mine&dealId=42',
        );

        act(() => {
            result.current.setSelection({ msa: LA_MSA, counties: getCountiesForMsa(LA_MSA) });
        });

        await waitFor(() => {
            expect(result.current.selection).toEqual({
                msa: LA_MSA,
                counties: getCountiesForMsa(LA_MSA),
            });
        });
        const latest = new URLSearchParams(history[history.length - 1].split('?')[1]);
        expect(latest.get('msa')).toBe(LA_MSA);
        expect(latest.get('counties')).toBe(getCountiesForMsa(LA_MSA).join(','));
        expect(latest.get('filterType')).toBeNull();
        expect(latest.get('filterValue')).toBeNull();
        expect(latest.get('filterState')).toBeNull();
        expect(latest.get('tab')).toBe('mine');
        expect(latest.get('dealId')).toBe('42');
    });

    it('setSelection with an identical selection does not push a new URL', () => {
        const { result, history } = renderDealsNav(
            `/deals?msa=${encodeURIComponent(DENVER_MSA)}&counties=Denver`,
        );
        const before = history.length;

        act(() => {
            result.current.setSelection({ msa: DENVER_MSA, counties: ['Denver'] });
        });

        expect(history).toHaveLength(before);
    });

    it('setTab toggles the tab param and keeps the selection', async () => {
        const { result, history } = renderDealsNav(
            `/deals?msa=${encodeURIComponent(DENVER_MSA)}&counties=Denver`,
        );
        expect(result.current.tab).toBe('all');

        act(() => {
            result.current.setTab('mine');
        });

        await waitFor(() => {
            expect(result.current.tab).toBe('mine');
        });
        const latest = new URLSearchParams(history[history.length - 1].split('?')[1]);
        expect(latest.get('tab')).toBe('mine');
        expect(latest.get('msa')).toBe(DENVER_MSA);
        expect(latest.get('counties')).toBe('Denver');
    });
});
