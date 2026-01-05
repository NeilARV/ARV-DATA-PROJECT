// Reverse geocode coordinates to get county using US Census Bureau API
export async function fetchCounty(longitude: number, latitude: number): Promise<string | null> {
    try {
        const url = `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=${longitude}&y=${latitude}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;

        const response = await fetch(url);
        
        if (!response.ok) {
            console.error(`Census API error: ${response.status} ${response.statusText}`);
            return null;
        }
        
        const data = await response.json();
        
        if (data.result && data.result.geographies && data.result.geographies.Counties && data.result.geographies.Counties.length > 0) {
            return data.result.geographies.Counties[0].BASENAME;
        }
        
        console.warn('No county found in Census API response');
        return null;
    } catch (error) {
        console.error('Error fetching county from Census API:', error);
        return null;
    }
}