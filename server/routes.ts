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

  // Geocode an address to get lat/lng using Google Maps Geocoding API
  async function geocodeAddress(address: string, city?: string, state?: string, zipCode?: string): Promise<{ lat: number; lng: number } | null> {
    try {
      const apiKey = process.env.GOOGLE_API_KEY;
      if (!apiKey) {
        console.error('GOOGLE_API_KEY not configured');
        return null;
      }

      // Build search query with full address components
      const parts = [address];
      if (city) parts.push(city);
      if (state) parts.push(state);
      if (zipCode) parts.push(zipCode);
      const query = parts.join(', ');
      
      // Use Google Maps Geocoding API for accurate results
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`;
      const response = await fetch(url);
      
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'OK' && data.results.length > 0) {
          const location = data.results[0].geometry.location;
          console.log(`Geocoded: ${query} -> ${location.lat}, ${location.lng}`);
          return {
            lat: location.lat,
            lng: location.lng
          };
        } else {
          console.warn(`Geocoding failed for: ${query} (Status: ${data.status}${data.error_message ? ', Error: ' + data.error_message : ''})`);
        }
      } else {
        const errorBody = await response.text();
        console.error(`Geocoding HTTP error for: ${query} (Status: ${response.status}, Body: ${errorBody.substring(0, 200)})`);
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

      const geocodingFailures: string[] = [];
      const successfulProperties: any[] = [];

      // Auto-populate company contact and geocode if needed
      for (const prop of propertiesToUpload) {
        let enriched = { ...prop };
        let shouldInsert = true;
        
        // Geocode if lat/lng not provided
        if (!prop.latitude || !prop.longitude || isNaN(prop.latitude) || isNaN(prop.longitude)) {
          const coords = await geocodeAddress(prop.address, prop.city, prop.state, prop.zipCode);
          if (coords) {
            enriched.latitude = coords.lat;
            enriched.longitude = coords.lng;
          } else {
            // REMOVED DANGEROUS FALLBACK - Don't insert properties with bad coordinates
            console.warn(`Geocoding failed for: ${prop.address}, ${prop.city}, ${prop.state} ${prop.zipCode}`);
            geocodingFailures.push(`${prop.address}, ${prop.city}, ${prop.state} ${prop.zipCode}`);
            shouldInsert = false;
          }
        }
        
        // Look up company contact
        if (shouldInsert && prop.propertyOwner) {
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
        
        if (shouldInsert) {
          successfulProperties.push(enriched);
        }
      }

      const inserted = successfulProperties.length > 0 
        ? await db.insert(properties).values(successfulProperties).returning()
        : [];
      
      const response: any = { 
        count: inserted.length,
        properties: inserted,
        total: propertiesToUpload.length
      };
      
      if (geocodingFailures.length > 0) {
        response.warnings = {
          message: `Failed to geocode ${geocodingFailures.length} propert${geocodingFailures.length === 1 ? 'y' : 'ies'}. ${geocodingFailures.length === 1 ? 'This property was' : 'These properties were'} not imported. Please verify the addresses and try again.`,
          failedAddresses: geocodingFailures
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

  // Clean up bad geocoding - Re-geocode properties with San Francisco fallback coordinates
  app.post("/api/properties/cleanup-geocoding", async (_req, res) => {
    try {
      // Find properties with the old SF fallback coordinates (37.7749, -122.4194)
      const allProps = await db.select().from(properties);
      const badCoords = allProps.filter(p => 
        (p.latitude && p.longitude && 
         Math.abs(p.latitude - 37.7749) < 0.0001 && 
         Math.abs(p.longitude + 122.4194) < 0.0001)
      );

      console.log(`Found ${badCoords.length} properties with fallback SF coordinates`);
      
      const fixed: string[] = [];
      const stillFailed: string[] = [];

      for (const prop of badCoords) {
        const coords = await geocodeAddress(prop.address, prop.city, prop.state, prop.zipCode);
        if (coords) {
          await db
            .update(properties)
            .set({ latitude: coords.lat, longitude: coords.lng })
            .where(eq(properties.id, prop.id));
          fixed.push(`${prop.address}, ${prop.city}, ${prop.state} ${prop.zipCode}`);
          console.log(`Fixed: ${prop.address} -> ${coords.lat}, ${coords.lng}`);
        } else {
          stillFailed.push(`${prop.address}, ${prop.city}, ${prop.state} ${prop.zipCode}`);
        }
      }

      res.json({
        totalBadCoordinates: badCoords.length,
        fixed: fixed.length,
        stillFailed: stillFailed.length,
        fixedAddresses: fixed,
        failedAddresses: stillFailed
      });
    } catch (error) {
      console.error('Error cleaning up geocoding:', error);
      res.status(500).json({ message: "Error cleaning up geocoding" });
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
