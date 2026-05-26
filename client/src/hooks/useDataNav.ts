import { useCallback, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/hooks/use-auth";

function buildUrl(params: URLSearchParams): string {
    const qs = params.toString();
    return qs ? `/?${qs}` : "/";
}

export function useDataNav() {
    const [, setLocation] = useLocation();
    const search = useSearch();
    const { user } = useAuth();
    const defaultApplied = useRef(false);

    const params = new URLSearchParams(search);
    const county = params.get("county");
    const propertyId = params.get("property");
    const companyId = params.get("company");

    // Apply user's county as URL default on first load when no county param is present
    useEffect(() => {
        if (defaultApplied.current) return;
        if (county !== null) {
            defaultApplied.current = true;
            return;
        }
        if (!user) return;
        defaultApplied.current = true;
        const userCounty = user.county ?? "San Diego";
        const p = new URLSearchParams(search);
        p.set("county", userCounty);
        setLocation(buildUrl(p), { replace: true });
    }, [user, county, search, setLocation]);

    const setCounty = useCallback((c: string) => {
        const p = new URLSearchParams(search);
        if (p.get("county") === c) return;
        p.set("county", c);
        p.delete("property");
        p.delete("company");
        setLocation(buildUrl(p));
    }, [search, setLocation]);

    const setPropertyId = useCallback((id: string | null) => {
        const p = new URLSearchParams(search);
        const current = p.get("property") ?? null;
        if (current === id) return;
        if (id) p.set("property", id);
        else p.delete("property");
        setLocation(buildUrl(p), { replace: true });
    }, [search, setLocation]);

    const setCompanyId = useCallback((id: string | null) => {
        const p = new URLSearchParams(search);
        const current = p.get("company") ?? null;
        if (current === id) return;
        if (id) p.set("company", id);
        else p.delete("company");
        setLocation(buildUrl(p), { replace: true });
    }, [search, setLocation]);

    return {
        county: county ?? "San Diego",
        propertyId,
        companyId,
        setCounty,
        setPropertyId,
        setCompanyId,
    };
}
