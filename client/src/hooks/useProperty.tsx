import { useState, createContext, useContext, ReactNode } from "react";
import type { Property } from "@/types/property";
import { fetchPropertyById } from "@/api/properties.api";

type PropertyContextValue = {
    property: Property | null,
    setProperty: (property: Property | null) => void;
    fetchProperty: (propertyId: string) => void;
}

const PropertyContext = createContext<PropertyContextValue | null>(null)

type PropertyProviderProps = {
    children: ReactNode,
}

export function PropertyProvider({children}: PropertyProviderProps) {
    
    const [ property, setProperty] = useState<Property | null>(null)

    const fetchProperty = async (propertyId: string) => {
        const prop = await fetchPropertyById(propertyId)
        setProperty(prop)
    }

    const value = {
        property,
        setProperty,
        fetchProperty
    }

    return (
        <PropertyContext.Provider value={value}>{children}</PropertyContext.Provider>
    )
}

type PropertyResult = {
    property: Property | null,
    setProperty: (property: Property | null) => void;
    fetchProperty: (propertyId: string) => void;
}

export function useProperty(): PropertyResult {

    const ctx = useContext(PropertyContext)
    
    if (!ctx) {
        throw new Error(`Trouble getting property`)
    }
    
    return ctx
}