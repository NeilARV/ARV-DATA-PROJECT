/**
 * Fetches a Google Street View Static API URL for a property address from the backend
 * @param address - Full street address
 * @param city - City name
 * @param state - State abbreviation
 * @param size - Image size in format "widthxheight" (default: "600x400")
 * @returns Promise that resolves to Street View image URL
 */
export async function getStreetViewUrl(
  address: string,
  city: string,
  state: string,
  size: string = "600x400"
): Promise<string> {
  try {
    const params = new URLSearchParams({
      address,
      city,
      state,
      size
    });
    
    const response = await fetch(`/api/streetview?${params}`);
    if (!response.ok) {
      console.warn('Failed to fetch Street View URL');
      return '';
    }
    
    const data = await response.json();
    return data.url || '';
  } catch (error) {
    console.error('Error fetching Street View URL:', error);
    return '';
  }
}
