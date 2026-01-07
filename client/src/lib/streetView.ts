/**
 * Generates a proxied Google Street View image URL for a property address
 * The image is served through our backend to keep the API key secure
 * @param address - Full street address
 * @param city - City name
 * @param state - State abbreviation
 * @param size - Image size in format "widthxheight" (default: "600x400")
 * @param propertyId - Optional property ID for better cache linking
 * @returns Street View image URL (proxied through backend)
 */
export async function getStreetViewUrl(
  address: string,
  city: string,
  state: string,
  size: string = "600x400",
  propertyId?: string
): Promise<string> {
  try {
    const params = new URLSearchParams({
      address,
      city,
      state,
      size
    });
    
    // Add propertyId if provided for better cache linking
    if (propertyId) {
      params.append('propertyId', propertyId);
    }
    
    // Return the proxied URL directly - backend will serve the image
    return `/api/properties/streetview?${params}`;
  } catch (error) {
    console.error('Error generating Street View URL:', error);
    return '';
  }
}
