import type { Property } from "@/types/property";

// Fetch full property data by ID
export const fetchPropertyById = async (propertyId: string): Promise<Property | null> => {
    try {
        const response = await fetch(`/api/properties/${propertyId}`, {
            credentials: "include",
        });
    
        if (!response.ok) {
            if (response.status === 404) {
                console.error("Property not found");
                return null;
            }
            throw new Error(`Failed to fetch property: ${response.status}`);
        }
    
        return await response.json();
    } catch (error) {
        console.error("Error fetching property by ID:", error);
        return null;
    }
};