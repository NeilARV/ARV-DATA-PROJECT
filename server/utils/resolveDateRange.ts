export function resolveDateRange(dateRange: string): { dateMin: string; dateMax: string } | null {
    const now = new Date();
    const fmt = (d: Date) => d.toISOString().split("T")[0];
    const sub = (days: number) => new Date(now.getTime() - days * 86400000);
    switch (dateRange) {
        case "30d":      return { dateMin: fmt(sub(30)),  dateMax: fmt(now) };
        case "60d":      return { dateMin: fmt(sub(60)),  dateMax: fmt(now) };
        case "90d":      return { dateMin: fmt(sub(90)),  dateMax: fmt(now) };
        case "180d":     return { dateMin: fmt(sub(180)), dateMax: fmt(now) };
        case "1y":       return { dateMin: fmt(sub(365)), dateMax: fmt(now) };
        case "ytd":      return { dateMin: `${now.getFullYear()}-01-01`, dateMax: fmt(now) };
        case "all-time": return null;
        default:         return null;
    }
}