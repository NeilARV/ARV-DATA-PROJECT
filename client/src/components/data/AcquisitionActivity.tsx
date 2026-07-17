import { TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

type AcquisitionActivityProps = {
    /** Strict 90-day acquisition total; undefined while the profile detail is loading. */
    total?: number;
    /** Full-month bars spanning the 90-day window's months. */
    byMonth?: { key: string; count: number }[];
};

/**
 * The 90-day acquisition activity block (totals row + monthly bar chart) shared by the company and
 * group expanded profiles so the two never drift visually.
 */
export function AcquisitionActivity({ total, byMonth }: AcquisitionActivityProps) {
    return (
        <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-foreground">
                    90-Day Acquisition Activity
                </span>
            </div>

            {total !== undefined ? (
                <>
                    <div className="flex items-center gap-4 text-sm">
                        <div>
                            <span className="text-muted-foreground">Last 90 days: </span>
                            <span className="font-semibold text-foreground">{total}</span>
                        </div>
                        <div>
                            <span className="text-muted-foreground">Avg/month: </span>
                            <span className="font-semibold text-foreground">
                                {total > 0 ? (total / 3).toFixed(1) : '0'}
                            </span>
                        </div>
                    </div>

                    {byMonth?.some((m) => m.count > 0) ? (
                        <div className="h-20 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={byMonth.map((m) => ({ month: m.key, count: m.count }))}
                                    margin={{ top: 5, right: 5, bottom: 5, left: 0 }}
                                >
                                    <XAxis
                                        dataKey="month"
                                        tick={{
                                            fontSize: 10,
                                            fill: 'hsl(var(--muted-foreground))',
                                        }}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <YAxis hide />
                                    <Tooltip
                                        cursor={false}
                                        contentStyle={{
                                            backgroundColor: 'hsl(var(--background))',
                                            border: '1px solid hsl(var(--border))',
                                            borderRadius: '6px',
                                            fontSize: '12px',
                                        }}
                                        formatter={(value: number) => [
                                            `${value} properties`,
                                            'Acquired',
                                        ]}
                                    />
                                    <Bar
                                        dataKey="count"
                                        fill="hsl(var(--primary))"
                                        radius={[4, 4, 0, 0]}
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="text-xs text-muted-foreground italic">
                            No acquisitions in the last 90 days
                        </div>
                    )}
                </>
            ) : (
                <div className="text-xs text-muted-foreground italic">Loading...</div>
            )}
        </div>
    );
}
