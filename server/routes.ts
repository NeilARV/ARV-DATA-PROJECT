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
              console.warn(`Could not geocode address: ${prop.address}`);
              return null; // Skip this property
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

      // Filter out failed geocodes
      const validProperties = enrichedProperties.filter(p => p !== null);
      
      if (validProperties.length === 0) {
        return res.status(400).json({ message: "No valid properties could be geocoded" });
      }

      const inserted = await db.insert(properties).values(validProperties).returning();
      res.json({ count: inserted.length, properties: inserted, skipped: propertiesToUpload.length - validProperties.length });
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

  const httpServer = createServer(app);

  return httpServer;
}
