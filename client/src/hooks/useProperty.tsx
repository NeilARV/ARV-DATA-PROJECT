import { Property } from "@/types/property"
import { useState, useContext, createContext, ReactNode } from "react"
import { fetchPropertyById } from "@/api/properties.api"


type PropertyContextValue = {
    property: Property | null,
    setProperty: React.Dispatch<React.SetStateAction<Property | null>>
    fetchProperty: (propertyId: string) => void;
}

const PropertyContext = createContext<PropertyContextValue | null>(null)

type PropertyProviderProps = {
    children: ReactNode,
}

export function PropertyProvider({children}: PropertyProviderProps) {

    const [ property, setProperty ] = useState<Property | null>(null)
    
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

export function useProperty(): PropertyContextValue {
    const ctx = useContext(PropertyContext)
    if (!ctx) {
        throw new Error(`Trouble fetching property context`)
    }
    return ctx
}