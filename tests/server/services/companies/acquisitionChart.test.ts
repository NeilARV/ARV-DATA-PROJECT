import { describe, it, expect } from 'vitest';
import {
    buildAcquisitionWindow,
    tallyAcquisitionChart,
} from 'server/services/companies/acquisitionChart';

// A fixed "now" keeps every boundary deterministic: 2026-07-17 puts the 90-day cutoff on
// 2026-04-18 and the chart start on 2026-04-01.
const NOW = new Date(2026, 6, 17);

describe('buildAcquisitionWindow', () => {
    it('computes the YTD, 90-day, and chart-superset boundaries', () => {
        const w = buildAcquisitionWindow(NOW);
        expect(w.ytdStartStr).toBe('2026-01-01');
        expect(w.todayStr).toBe('2026-07-17');
        expect(w.ninetyDaysAgoStr).toBe('2026-04-18');
        expect(w.chartStartStr).toBe('2026-04-01');
    });

    it('chart start crosses a year boundary when the window does', () => {
        const w = buildAcquisitionWindow(new Date(2026, 0, 15));
        expect(w.ninetyDaysAgoStr).toBe('2025-10-17');
        expect(w.chartStartStr).toBe('2025-10-01');
        expect(w.ytdStartStr).toBe('2026-01-01');
    });
});

describe('tallyAcquisitionChart', () => {
    const w = buildAcquisitionWindow(NOW);

    it('builds one zero bar per month from the earliest 90-day month through now', () => {
        const { acquisition90DayByMonth, acquisition90DayTotal } = tallyAcquisitionChart([], w);
        expect(acquisition90DayByMonth).toEqual([
            { key: 'Apr', count: 0 },
            { key: 'May', count: 0 },
            { key: 'Jun', count: 0 },
            { key: 'Jul', count: 0 },
        ]);
        expect(acquisition90DayTotal).toBe(0);
    });

    it('counts a full-month row in its bar but excludes it from the strict 90-day total', () => {
        // 2026-04-10 is inside the chart's April bar but before the 2026-04-18 cutoff.
        const { acquisition90DayByMonth, acquisition90DayTotal } = tallyAcquisitionChart(
            [{ recordingDate: '2026-04-10' }, { recordingDate: '2026-05-02' }],
            w,
        );
        expect(acquisition90DayByMonth).toEqual([
            { key: 'Apr', count: 1 },
            { key: 'May', count: 1 },
            { key: 'Jun', count: 0 },
            { key: 'Jul', count: 0 },
        ]);
        expect(acquisition90DayTotal).toBe(1);
    });

    it('counts boundary dates inclusively and accepts Date rows', () => {
        const { acquisition90DayTotal } = tallyAcquisitionChart(
            [{ recordingDate: '2026-04-18' }, { recordingDate: new Date(2026, 6, 17) }],
            w,
        );
        expect(acquisition90DayTotal).toBe(2);
    });

    it('skips rows with no parseable date', () => {
        const { acquisition90DayTotal, acquisition90DayByMonth } = tallyAcquisitionChart(
            [{ recordingDate: null }, { recordingDate: '2026-06-01' }],
            w,
        );
        expect(acquisition90DayTotal).toBe(1);
        expect(acquisition90DayByMonth.find((m) => m.key === 'Jun')?.count).toBe(1);
    });
});
