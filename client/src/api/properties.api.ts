import type { Property } from "@/types/property";
import { apiRequest } from "@/lib/queryClient";

// Fetch full property data by ID
export const fetchPropertyById = async (propertyId: string): Promise<Property | null> => {
    try {
        const res = await apiRequest("GET", `/api/properties/${propertyId}`);
        return await res.json();
    } catch (error) {
        console.error("Error fetching property by ID:", error);
        return null;
    }
};
