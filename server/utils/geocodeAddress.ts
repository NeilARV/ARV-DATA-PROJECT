  // Geocode an address to get lat/lng using Google Maps Geocoding API
  export async function geocodeAddress(
    address: string,
    city?: string,
    state?: string,
    zipCode?: string,
  ): Promise<{ lat: number; lng: number } | null> {
    try {
      const apiKey = process.env.GOOGLE_API_KEY;
      if (!apiKey) {
        console.error("GOOGLE_API_KEY not configured");
        return null;
      }

      // Build search query with full address components
      const parts = [address];
      if (city) parts.push(city);
      if (state) parts.push(state);
      if (zipCode) parts.push(zipCode);
      const query = parts.join(", ");

      // Use Google Maps Geocoding API for accurate results
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`;
      const response = await fetch(url);

      if (response.ok) {
        const data = await response.json();
        if (data.status === "OK" && data.results.length > 0) {
          const location = data.results[0].geometry.location;
          console.log(`Geocoded: ${query} -> ${location.lat}, ${location.lng}`);
          return {
            lat: location.lat,
            lng: location.lng,
          };
        } else {
          console.warn(
            `Geocoding failed for: ${query} (Status: ${data.status}${data.error_message ? ", Error: " + data.error_message : ""})`,
          );
        }
      } else {
        const errorBody = await response.text();
        console.error(
          `Geocoding HTTP error for: ${query} (Status: ${response.status}, Body: ${errorBody.substring(0, 200)})`,
        );
      }

      return null;
    } catch (error) {
      console.error("Geocoding error:", error);
      return null;
    }
  }