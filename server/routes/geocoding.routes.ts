import { Router } from "express";

const router = Router();

// Reverse geocode coordinates to get county using US Census Bureau API
// This endpoint proxies the Census API call to avoid CORS issues
router.get("/county", async (req, res) => {
    try {
        const { longitude, latitude } = req.query;

        if (!longitude || !latitude) {
            return res.status(400).json({ 
                message: "Longitude and latitude query parameters are required" 
            });
        }

        const lon = parseFloat(longitude.toString());
        const lat = parseFloat(latitude.toString());

        if (isNaN(lon) || isNaN(lat)) {
            return res.status(400).json({ 
                message: "Longitude and latitude must be valid numbers" 
            });
        }

        const url = `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=${lon}&y=${lat}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;

        const response = await fetch(url);
        
        if (!response.ok) {
            console.error(`Census API error: ${response.status} ${response.statusText}`);
            return res.status(response.status).json({ 
                message: `Census API error: ${response.statusText}` 
            });
        }
        
        const data = await response.json();
        
        if (data.result && data.result.geographies && data.result.geographies.Counties && data.result.geographies.Counties.length > 0) {
            const countyName = data.result.geographies.Counties[0].BASENAME;
            return res.json({ county: countyName });
        }
        
        console.warn('No county found in Census API response');
        return res.status(404).json({ message: "County not found for the provided coordinates" });
    } catch (error) {
        console.error('Error fetching county from Census API:', error);
        return res.status(500).json({ 
            message: "Error fetching county from Census API",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
});

export default router;

