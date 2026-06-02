import { createContext, ReactNode, useContext, useState, useCallback } from 'react';
import { useLocation, useSearch } from 'wouter';
import { SidebarView, View } from '@/types/options';

const VALID_VIEWS: View[] = ['map', 'table', 'grid', 'buyers-feed', 'wholesale'];
const DEFAULT_VIEW: View = 'map';

function parseViewParam(search: string): View | null {
    const v = new URLSearchParams(search).get('view') as View | null;
    return v && VALID_VIEWS.includes(v) ? v : null;
}

type ViewContextValue = {
    view: View;
    setView: (view: View) => void;
    sidebarView: SidebarView;
    setSidebarView: (sidebarView: SidebarView) => void;
};

const ViewContext = createContext<ViewContextValue | null>(null);

type ViewProviderProps = {
    children: ReactNode;
};

export function ViewProvider({ children }: ViewProviderProps) {
    const [location, setLocation] = useLocation();
    const search = useSearch();
    const isHome = location === '/';

    // Derive view directly from the URL — no state copy, no sync effect, no extra render cycle
    const view: View = isHome ? (parseViewParam(search) ?? DEFAULT_VIEW) : DEFAULT_VIEW;
    const [sidebarView, setSidebarView] = useState<SidebarView>('directory');

    const setView = useCallback(
        (newView: View) => {
            // Preserve existing search params only when already on home; otherwise start fresh
            const p = new URLSearchParams(isHome ? search : '');
            if (newView === DEFAULT_VIEW) p.delete('view');
            else p.set('view', newView);
            const qs = p.toString();
            setLocation(qs ? `/?${qs}` : '/');
        },
        [isHome, search, setLocation],
    );

    const value = {
        view,
        setView,
        sidebarView,
        setSidebarView,
    };

    return <ViewContext.Provider value={value}>{children}</ViewContext.Provider>;
}

export function useView(): ViewContextValue {
    const ctx = useContext(ViewContext);
    if (!ctx) {
        throw new Error(`Trouble accessing properties view`);
    }
    return ctx;
}
