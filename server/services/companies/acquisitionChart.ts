import { normalizeDateToYMD } from 'server/utils/normalization';

// The 90-day acquisition chart shown on the company and group profiles. The chart spans the same
// months as the 90-day window (first day of the earliest 90-day month → today) but each bar counts
// the FULL month — so one superset query serves both the bars and the strict 90-day total.

export interface AcquisitionWindow {
    ytdStartStr: string;
    todayStr: string;
    ninetyDaysAgoStr: string;
    chartStartStr: string;
    ninetyDaysAgo: Date;
    now: Date;
}

/** Date-window strings for the profile stat queries: YTD, the strict 90-day window, and the chart superset. */
export function buildAcquisitionWindow(now: Date = new Date()): AcquisitionWindow {
    const ninetyDaysAgo = new Date(now);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const chartStart = new Date(ninetyDaysAgo.getFullYear(), ninetyDaysAgo.getMonth(), 1);
    return {
        ytdStartStr: `${now.getFullYear()}-01-01`,
        todayStr: normalizeDateToYMD(now)!,
        ninetyDaysAgoStr: normalizeDateToYMD(ninetyDaysAgo)!,
        chartStartStr: normalizeDateToYMD(chartStart)!,
        ninetyDaysAgo,
        now,
    };
}

const MONTH_NAMES = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
];

/**
 * Tallies the chart-superset rows into full-month bars plus the strict 90-day total.
 * @param rows every acquisition recorded between window.chartStartStr and window.todayStr
 */
export function tallyAcquisitionChart(
    rows: { recordingDate: string | Date | null }[],
    window: AcquisitionWindow,
): {
    acquisition90DayTotal: number;
    acquisition90DayByMonth: { key: string; count: number }[];
} {
    const months: { key: string; count: number }[] = [];
    const cursor = new Date(window.ninetyDaysAgo.getFullYear(), window.ninetyDaysAgo.getMonth(), 1);
    const endMonth = new Date(window.now.getFullYear(), window.now.getMonth(), 1);
    while (cursor <= endMonth) {
        months.push({ key: MONTH_NAMES[cursor.getMonth()], count: 0 });
        cursor.setMonth(cursor.getMonth() + 1);
    }

    let acquisition90DayTotal = 0;
    rows.forEach((row) => {
        const dateStr = normalizeDateToYMD(row.recordingDate);
        if (!dateStr) return;
        const [, m] = dateStr.split('-').map(Number);
        const monthKey = MONTH_NAMES[m - 1];
        const existing = months.find((mo) => mo.key === monthKey);
        if (existing) existing.count++;
        if (dateStr >= window.ninetyDaysAgoStr) acquisition90DayTotal++;
    });

    return { acquisition90DayTotal, acquisition90DayByMonth: months };
}
