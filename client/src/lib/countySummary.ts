import { msaShortName } from '@/lib/county';
import {
    filterCountiesToMsa,
    getCountiesForMsa,
    getTrackedMsas,
} from '@shared/constants/countyToMsa';

/**
 * Compact per-MSA summary of a county set — `"<MSA> (all)"` when every county of the MSA is
 * selected, otherwise `"<MSA>: <county names>"` — one string per MSA, in tracked-MSA order.
 */
export function summarizeCountiesByMsa(counties: { county: string; msaName: string }[]): string[] {
    return getTrackedMsas().flatMap(({ msaName }) => {
        const selected = filterCountiesToMsa(
            msaName,
            counties.filter((c) => c.msaName === msaName).map((c) => c.county),
        );
        if (selected.length === 0) return [];
        const isAll = selected.length === getCountiesForMsa(msaName).length;
        return [
            isAll
                ? `${msaShortName(msaName)} (all)`
                : `${msaShortName(msaName)}: ${selected.join(', ')}`,
        ];
    });
}
