import { createContext, ReactNode, useContext, useState } from "react";
import { SidebarView, View } from "@/types/options";

type ViewContextValue = {
    view: View,
    setView: (view: View) => void;
    sidebarView: SidebarView;
    setSidebarView: (sidebarView: SidebarView) => void;
}

const ViewContext = createContext<ViewContextValue | null>(null)

type ViewProviderProps = {
    children: ReactNode
}

export function ViewProvider({children}: ViewProviderProps) {
    const [view, setView] = useState<View>("map");
    const [sidebarView, setSidebarView] = useState<SidebarView>("directory");

    const value = {
        view,
        setView,
        sidebarView,
        setSidebarView
    }

    return (
        <ViewContext.Provider value={value}>{children}</ViewContext.Provider>
    )
}

export function useView(): ViewContextValue {
    const ctx = useContext(ViewContext)
    if (!ctx) {
        throw new Error(`Trouble accessing properties view`)
    }
    return ctx
}
