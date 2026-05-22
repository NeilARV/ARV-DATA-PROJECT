import { useCallback, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { getMsaNameFromCounty } from "@/lib/county";
import type { LocationFilter } from "@/components/deals/DealsLocationSearch";

function buildDealsUrl(tab: DealTab, filter: LocationFilter | null, dealId?: number | null): string {
    const params = new URLSearchParams();
    if (tab === "mine") params.set("tab", "mine");
    if (filter) {
        params.set("filterType", filter.type);
        params.set("filterValue", filter.value);
        params.set("filterLabel", filter.label);
        if (filter.type === "msa") {
            params.set("filterCounty", filter.county);
            params.set("filterState", filter.state);
        }
    }
    if (dealId != null) params.set("dealId", String(dealId));
    const qs = params.toString();
    return qs ? `/deals?${qs}` : "/deals";
}

function parseFilter(params: URLSearchParams): LocationFilter | null {
    const type = params.get("filterType");
    const value = params.get("filterValue");
    const label = params.get("filterLabel");
    if (!type || !value || !label) return null;
    if (type === "msa") {
        const county = params.get("filterCounty") ?? "";
        const state = params.get("filterState") ?? "";
        return { type: "msa", value, label, county, state };
    }
    if (type === "city") return { type: "city", value, label };
    if (type === "zip")  return { type: "zip",  value, label };
    return null;
}

export function useDealsNav() {
    const [, setLocation] = useLocation();
    const search = useSearch();
    const { user } = useAuth();
    const defaultApplied = useRef(false);

    const params = new URLSearchParams(search);
    const rawTab = params.get("tab");
    const tab: DealTab = rawTab === "mine" ? "mine" : "all";
    const locationFilter = parseFilter(params);
    const hasExplicitFilter = params.has("filterType");

    const rawDealId = params.get("dealId");
    const dealId: number | null = rawDealId ? Number(rawDealId) || null : null;

    // On first load when no filter is set, default to user's county
    useEffect(() => {
        if (defaultApplied.current) return;
        if (hasExplicitFilter) {
            defaultApplied.current = true;
            return;
        }
        if (!user?.county) return;
        const msaName = getMsaNameFromCounty(user.county);
        if (!msaName) {
            defaultApplied.current = true;
            return;
        }
        defaultApplied.current = true;
        const filter: LocationFilter = {
            type: "msa",
            value: msaName,
            label: `${user.county} County, ${user.state ?? ""}`,
            county: user.county,
            state: user.state ?? "",
        };
        setLocation(buildDealsUrl(tab, filter, dealId), { replace: true });
    }, [user?.county, user?.state, hasExplicitFilter, tab, dealId, setLocation]);

    const setTab = useCallback((newTab: DealTab) => {
        setLocation(buildDealsUrl(newTab, locationFilter, dealId));
    }, [setLocation, locationFilter, dealId]);

    const setLocationFilter = useCallback((filter: LocationFilter | null) => {
        setLocation(buildDealsUrl(tab, filter, dealId));
    }, [setLocation, tab, dealId]);

    const setDealId = useCallback((id: number | null) => {
        const p = new URLSearchParams(search);
        if (id !== null) p.set("dealId", String(id));
        else p.delete("dealId");
        const qs = p.toString();
        setLocation(qs ? `/deals?${qs}` : "/deals");
    }, [search, setLocation]);

    return { tab, locationFilter, dealId, setTab, setLocationFilter, setDealId };
}
