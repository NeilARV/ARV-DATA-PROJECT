import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { useDataNav } from '@/hooks/useNav';
import { getCountiesForMsa } from '@shared/constants/countyToMsa';
import type { ReactNode } from 'react';

// URL ↔ state sync for the Data nav (TST.HOOK): the selection parsed from ?msa=&counties=
// (and legacy ?county=), the once-only subscribed-county default anchored on the home county,
// and setSelection writing the URL while clearing the property/company params.

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

function renderDataNav(path: string) {
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
    const view = renderHook(() => useDataNav(), { wrapper });
    return { ...view, history: memory.history };
}

describe('useDataNav', () => {
    it('parses ?msa=&counties= from the URL into the selection', () => {
        const { result } = renderDataNav(
            `/data?msa=${encodeURIComponent(DENVER_MSA)}&counties=${encodeURIComponent('Denver,Adams')}`,
        );
        expect(result.current.selection).toEqual({
            msa: DENVER_MSA,
            counties: ['Denver', 'Adams'],
        });
    });

    it('an empty counties param parses as none selected', () => {
        const { result } = renderDataNav(`/data?msa=${encodeURIComponent(DENVER_MSA)}&counties=`);
        expect(result.current.selection).toEqual({ msa: DENVER_MSA, counties: [] });
    });

    it('resolves a legacy ?county= URL to that county within its MSA', () => {
        const { result } = renderDataNav('/data?county=Adams');
        expect(result.current.selection).toEqual({ msa: DENVER_MSA, counties: ['Adams'] });
    });

    it('applies the home-county default to the URL exactly once on first load', async () => {
        const { result, history } = renderDataNav('/data');

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
        const { result } = renderDataNav('/data');

        await waitFor(() => {
            expect(result.current.selection).toEqual({
                msa: 'Port St. Lucie, FL',
                counties: ['Martin'],
            });
        });
    });

    it('falls back to the home county when no subscription is in the home MSA', async () => {
        mockUser = { county: 'St. Lucie', countySubscriptions: [{ county: 'Denver' }] };
        const { result } = renderDataNav('/data');

        await waitFor(() => {
            expect(result.current.selection).toEqual({
                msa: 'Port St. Lucie, FL',
                counties: ['St. Lucie'],
            });
        });
    });

    it('setSelection writes msa + counties and clears the property/company params', async () => {
        const { result, history } = renderDataNav(
            `/data?msa=${encodeURIComponent(DENVER_MSA)}&counties=Denver&property=p1&company=c1`,
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
        expect(latest.get('property')).toBeNull();
        expect(latest.get('company')).toBeNull();
    });

    it('setSelection with an identical selection does not push a new URL', () => {
        const { result, history } = renderDataNav(
            `/data?msa=${encodeURIComponent(DENVER_MSA)}&counties=Denver`,
        );
        const before = history.length;

        act(() => {
            result.current.setSelection({ msa: DENVER_MSA, counties: ['Denver'] });
        });

        expect(history).toHaveLength(before);
    });

    // ── Group selection param (?group=) ──────────────────────────────────────

    it('parses ?group= from the URL into groupId', () => {
        const { result } = renderDataNav(
            `/data?msa=${encodeURIComponent(DENVER_MSA)}&counties=Denver&group=g1`,
        );
        expect(result.current.groupId).toBe('g1');
        expect(result.current.companyId).toBeNull();
    });

    it('company wins when both company and group params are present', () => {
        const { result } = renderDataNav(
            `/data?msa=${encodeURIComponent(DENVER_MSA)}&counties=Denver&company=c1&group=g1`,
        );
        expect(result.current.companyId).toBe('c1');
        expect(result.current.groupId).toBeNull();
    });

    it('setGroupId writes the group param and clears the company param', async () => {
        const { result, history } = renderDataNav(
            `/data?msa=${encodeURIComponent(DENVER_MSA)}&counties=Denver&company=c1`,
        );

        act(() => {
            result.current.setGroupId('g1');
        });

        await waitFor(() => {
            expect(result.current.groupId).toBe('g1');
        });
        const latest = new URLSearchParams(history[history.length - 1].split('?')[1]);
        expect(latest.get('group')).toBe('g1');
        expect(latest.get('company')).toBeNull();
    });

    it('setCompanyId writes the company param and clears the group param', async () => {
        const { result, history } = renderDataNav(
            `/data?msa=${encodeURIComponent(DENVER_MSA)}&counties=Denver&group=g1`,
        );

        act(() => {
            result.current.setCompanyId('c1');
        });

        await waitFor(() => {
            expect(result.current.companyId).toBe('c1');
        });
        const latest = new URLSearchParams(history[history.length - 1].split('?')[1]);
        expect(latest.get('company')).toBe('c1');
        expect(latest.get('group')).toBeNull();
    });

    it('setGroupId(null) removes the group param', async () => {
        const { result, history } = renderDataNav(
            `/data?msa=${encodeURIComponent(DENVER_MSA)}&counties=Denver&group=g1`,
        );

        act(() => {
            result.current.setGroupId(null);
        });

        await waitFor(() => {
            expect(result.current.groupId).toBeNull();
        });
        const latest = new URLSearchParams(history[history.length - 1].split('?')[1]);
        expect(latest.get('group')).toBeNull();
    });

    it('setSelection clears the group param along with property/company', async () => {
        const { result, history } = renderDataNav(
            `/data?msa=${encodeURIComponent(DENVER_MSA)}&counties=Denver&group=g1`,
        );

        act(() => {
            result.current.setSelection({ msa: LA_MSA, counties: getCountiesForMsa(LA_MSA) });
        });

        await waitFor(() => {
            expect(result.current.selection.msa).toBe(LA_MSA);
        });
        const latest = new URLSearchParams(history[history.length - 1].split('?')[1]);
        expect(latest.get('group')).toBeNull();
    });
});
