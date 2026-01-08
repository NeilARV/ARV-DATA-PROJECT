import { Router } from "express";
import { fetchCounty } from "server/utils/fetchCounty";

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

        const county = await fetchCounty(lon, lat);

        if (!county) {
            return res.status(404).json({ message: "County not found for the provided coordinates" });
        }

        return res.json({ county });
    } catch (error) {
        console.error('Error fetching county:', error);
        return res.status(500).json({ 
            message: "Error fetching county from Census API",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
});

export default router;

