import { createContext, ReactNode, useContext, useState } from "react";
import { View } from "@/types/options";

type ViewContextValue = {
    view: View,
    setView: (view: View) => void;
}

const ViewContext = createContext<ViewContextValue | null>(null)

type ViewProviderProps = {
    children: ReactNode
}

export function ViewProvider({children}: ViewProviderProps) {
    const [view, setView] = useState<View>("map");

    const value = {
        view,
        setView
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
