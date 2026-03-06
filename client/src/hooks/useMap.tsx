import { createContext, useContext, useState } from "react";

type MapContextValue = {
    mapCenter: [number, number] | undefined;
    setMapCenter: React.Dispatch<React.SetStateAction<[number, number] | undefined>>;

    mapZoom: number | undefined;
    setMapZoom: React.Dispatch<React.SetStateAction<number | undefined>>;
}

const MapContext = createContext<MapContextValue| null>(null)

type MapProviderProps = {
    children: string
}

export function MapProvider({children}: MapProviderProps) {

    const [ mapCenter, setMapCenter ] = useState<[number, number] | undefined>(undefined)
    const [ mapZoom, setMapZoom ] = useState<number | undefined>(12)

    const value = {
        mapCenter,
        setMapCenter,
        mapZoom,
        setMapZoom
    }

    return (
        <MapContext.Provider value={value}>{children}</MapContext.Provider>
    )
}

export function useMap(): MapContextValue {
    const ctx = useContext(MapContext)
    if (!ctx) {
        throw new Error(`Error positioning map`)
    }
    return ctx
}