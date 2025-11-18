import type { Express } from "express";
import { createServer, type Server } from "http";
import { db } from "./storage";
import { properties, companyContacts, insertPropertySchema } from "@shared/schema";
import { eq } from "drizzle-orm";
import { seedCompanyContacts } from "./seed-companies";

export async function registerRoutes(app: Express): Promise<Server> {
  // Seed company contacts on startup
  await seedCompanyContacts();

  // Get all properties
  app.get("/api/properties", async (_req, res) => {
    try {
      const allProperties = await db.select().from(properties);
      res.json(allProperties);
    } catch (error) {
      console.error('Error fetching properties:', error);
      res.status(500).json({ message: "Error fetching properties" });
    }
  });

  // Geocode an address to get lat/lng
  async function geocodeAddress(address: string, city?: string, state?: string, zipCode?: string): Promise<{ lat: number; lng: number } | null> {
    try {
      // Build search query
      const parts = [address];
      if (city) parts.push(city);
      if (state) parts.push(state);
      if (zipCode) parts.push(zipCode);
      const query = parts.join(', ');
      
      // Use OpenStreetMap Nominatim API (free, no API key required)
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
        {
          headers: {
            'User-Agent': 'PropertyListingApp/1.0'
          }
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        if (data.length > 0) {
          return {
            lat: parseFloat(data[0].lat),
            lng: parseFloat(data[0].lon)
          };
        }
      }
      
      return null;
    } catch (error) {
      console.error('Geocoding error:', error);
      return null;
    }
  }

  // Upload properties
  app.post("/api/properties/upload", async (req, res) => {
    try {
      const propertiesToUpload = req.body;
      
      if (!Array.isArray(propertiesToUpload)) {
        return res.status(400).json({ message: "Expected an array of properties" });
      }

      const geocodingWarnings: string[] = [];

      // Auto-populate company contact and geocode if needed
      const enrichedProperties = await Promise.all(
        propertiesToUpload.map(async (prop) => {
          let enriched = { ...prop };
          
          // Geocode if lat/lng not provided
          if (!prop.latitude || !prop.longitude || isNaN(prop.latitude) || isNaN(prop.longitude)) {
            const coords = await geocodeAddress(prop.address, prop.city, prop.state, prop.zipCode);
            if (coords) {
              enriched.latitude = coords.lat;
              enriched.longitude = coords.lng;
            } else {
              // Use fallback coordinates (San Francisco Bay Area) when geocoding fails
              // This prevents properties from being dropped
              console.warn(`Could not geocode address: ${prop.address} - using fallback coordinates`);
              geocodingWarnings.push(prop.address);
              enriched.latitude = 37.7749; // San Francisco
              enriched.longitude = -122.4194;
            }
          }
          
          // Look up company contact
          if (prop.propertyOwner) {
            const contact = await db
              .select()
              .from(companyContacts)
              .where(eq(companyContacts.companyName, prop.propertyOwner))
              .limit(1);
            
            if (contact.length > 0) {
              enriched.companyContactName = contact[0].contactName;
              enriched.companyContactEmail = contact[0].contactEmail;
            }
          }
          
          return enriched;
        })
      );

      const inserted = await db.insert(properties).values(enrichedProperties).returning();
      
      const response: any = { 
        count: inserted.length, 
        properties: inserted 
      };
      
      if (geocodingWarnings.length > 0) {
        response.warnings = {
          message: `Could not find exact coordinates for ${geocodingWarnings.length} propert${geocodingWarnings.length === 1 ? 'y' : 'ies'}. Using approximate location. Please update manually if needed.`,
          addresses: geocodingWarnings
        };
      }
      
      res.json(response);
    } catch (error) {
      console.error('Error uploading properties:', error);
      res.status(500).json({ message: "Error uploading properties" });
    }
  });

  // Delete all properties
  app.delete("/api/properties", async (_req, res) => {
    try {
      await db.delete(properties);
      res.json({ message: "All properties deleted" });
    } catch (error) {
      console.error('Error deleting properties:', error);
      res.status(500).json({ message: "Error deleting properties" });
    }
  });

  // Get all company contacts
  app.get("/api/company-contacts", async (_req, res) => {
    try {
      const allContacts = await db.select().from(companyContacts).orderBy(companyContacts.companyName);
      res.json(allContacts);
    } catch (error) {
      console.error('Error fetching company contacts:', error);
      res.status(500).json({ message: "Error fetching company contacts" });
    }
  });

  // Proxy Street View image to keep API key secure on server
  app.get("/api/streetview", async (req, res) => {
    try {
      const { address, city, state, size = "600x400" } = req.query;
      
      if (!address) {
        return res.status(400).json({ message: "Address parameter is required" });
      }

      const apiKey = process.env.GOOGLE_API_KEY;
      if (!apiKey) {
        console.error('GOOGLE_API_KEY not configured');
        return res.status(500).json({ message: "Street View service not configured" });
      }

      // Combine address components for the location parameter
      const locationParts = [address];
      if (city) locationParts.push(city);
      if (state) locationParts.push(state);
      const location = locationParts.join(', ');
      
      const streetViewUrl = `https://maps.googleapis.com/maps/api/streetview?size=${size}&location=${encodeURIComponent(location)}&key=${apiKey}`;
      
      console.log('Fetching Street View for:', location, 'size:', size);
      
      // Fetch the image from Google and proxy it to the client
      const imageResponse = await fetch(streetViewUrl);
      
      if (!imageResponse.ok) {
        const responseText = await imageResponse.text();
        console.error('Failed to fetch Street View image:', {
          status: imageResponse.status,
          statusText: imageResponse.statusText,
          response: responseText.substring(0, 500), // First 500 chars of response
          location
        });
        return res.status(404).json({ message: "Street View image not available" });
      }

      // Set appropriate headers and stream the image to the client
      const contentType = imageResponse.headers.get('content-type');
      if (contentType) {
        res.setHeader('Content-Type', contentType);
      }
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
      
      // Stream the image data to the response
      const imageBuffer = await imageResponse.arrayBuffer();
      res.send(Buffer.from(imageBuffer));
    } catch (error) {
      console.error('Error fetching Street View image:', error);
      res.status(500).json({ message: "Error fetching Street View image" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
