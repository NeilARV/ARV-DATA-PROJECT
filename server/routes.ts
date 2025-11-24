import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { db } from "./storage";
import { properties, companyContacts, insertPropertySchema } from "@shared/schema";
import { eq, and, gt, lt } from "drizzle-orm";
import { seedCompanyContacts } from "./seed-companies";
import pLimit from "p-limit";

// Middleware to check admin authentication
function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  console.log(`[AUTH CHECK] Path: ${req.path}, Authenticated: ${!!req.session.isAdminAuthenticated}, Session ID: ${req.sessionID}`);
  if (req.session.isAdminAuthenticated) {
    next();
  } else {
    console.error(`[AUTH DENIED] Unauthorized access attempt to ${req.path}, Session: ${JSON.stringify(req.session)}`);
    res.status(401).json({ message: "Unauthorized - Admin authentication required" });
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Seed company contacts on startup
  await seedCompanyContacts();

  // Verify admin passcode and create session
  app.post("/api/admin/verify", async (req, res) => {
    try {
      const { passcode } = req.body;
      const adminPasscode = process.env.ADMIN_PASSCODE;
      
      if (!adminPasscode) {
        return res.status(500).json({ message: "Admin passcode not configured" });
      }
      
      if (passcode === adminPasscode) {
        req.session.isAdminAuthenticated = true;
        res.json({ success: true });
      } else {
        res.status(401).json({ success: false, message: "Incorrect passcode" });
      }
    } catch (error) {
      console.error('Error verifying admin passcode:', error);
      res.status(500).json({ message: "Error verifying passcode" });
    }
  });

  // Check admin authentication status
  app.get("/api/admin/status", async (req, res) => {
    res.json({ authenticated: !!req.session.isAdminAuthenticated });
  });

  // Logout admin
  app.post("/api/admin/logout", async (req, res) => {
    // Destroy the session completely
    req.session.destroy((err) => {
      if (err) {
        console.error('Error destroying session:', err);
        return res.status(500).json({ message: "Error logging out" });
      }
      // Clear the session cookie with same settings as session middleware
      res.clearCookie('connect.sid', {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
      });
      res.json({ success: true });
    });
  });

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

  // Create a single property (requires admin auth)
  app.post("/api/properties", requireAdminAuth, async (req, res) => {
    try {
      console.log("POST /api/properties - Raw request body:", JSON.stringify(req.body, null, 2));
      
      // Validate request body with Zod schema
      const validation = insertPropertySchema.safeParse(req.body);
      if (!validation.success) {
        console.error("Validation errors:", JSON.stringify(validation.error.errors, null, 2));
        return res.status(400).json({ 
          message: "Invalid property data",
          errors: validation.error.errors
        });
      }

      const propertyData = validation.data;
      console.log("Validated property data:", JSON.stringify(propertyData, null, 2));
      let enriched = { ...propertyData };
      
      // Geocode if lat/lng not provided or invalid
      const hasValidCoords = propertyData.latitude != null && 
                             propertyData.longitude != null && 
                             !isNaN(Number(propertyData.latitude)) && 
                             !isNaN(Number(propertyData.longitude));

      if (!hasValidCoords) {
        console.log(`Geocoding address: ${propertyData.address}, ${propertyData.city}, ${propertyData.state} ${propertyData.zipCode}`);
        const coords = await geocodeAddress(propertyData.address, propertyData.city, propertyData.state, propertyData.zipCode);
        if (coords) {
          enriched.latitude = coords.lat;
          enriched.longitude = coords.lng;
        } else {
          // Geocoding failed - allow property creation without coordinates
          console.warn(`Geocoding unavailable for: ${propertyData.address}. Property will be created without map coordinates.`);
          enriched.latitude = null;
          enriched.longitude = null;
        }
      } else {
        console.log(`Using provided coordinates for: ${propertyData.address} (${propertyData.latitude}, ${propertyData.longitude})`);
      }
      
      // Look up company contact
      if (propertyData.propertyOwner) {
        const contact = await db
          .select()
          .from(companyContacts)
          .where(eq(companyContacts.companyName, propertyData.propertyOwner))
          .limit(1);
        
        if (contact.length > 0) {
          enriched.companyContactName = contact[0].contactName;
          enriched.companyContactEmail = contact[0].contactEmail;
        }
      }
      
      const [inserted] = await db.insert(properties).values(enriched).returning();
      console.log(`Property created: ${inserted.address} (ID: ${inserted.id})`);
      
      // Add warning in response if coordinates are missing
      if (!inserted.latitude || !inserted.longitude) {
        res.json({
          ...inserted,
          _warning: "Property created without map coordinates. Enable Google Geocoding API or provide latitude/longitude to display on map."
        });
      } else {
        res.json(inserted);
      }
    } catch (error) {
      console.error('Error creating property:', error);
      res.status(500).json({ message: "Error creating property" });
    }
  });

  // Upload properties with chunked processing and controlled concurrency (requires admin auth)
  app.post("/api/properties/upload", requireAdminAuth, async (req, res) => {
    try {
      const propertiesToUpload = req.body;
      
      if (!Array.isArray(propertiesToUpload)) {
        return res.status(400).json({ message: "Expected an array of properties" });
      }

      console.log(`[UPLOAD] Starting upload of ${propertiesToUpload.length} properties`);
      
      const geocodingFailures: string[] = [];
      const successfulProperties: any[] = [];
      
      // Limit concurrent geocoding to 5 requests at a time to avoid overwhelming the API
      const limit = pLimit(5);
      const CHUNK_SIZE = 50;
      
      // Process properties in chunks to avoid timeouts
      for (let i = 0; i < propertiesToUpload.length; i += CHUNK_SIZE) {
        const chunk = propertiesToUpload.slice(i, i + CHUNK_SIZE);
        console.log(`[UPLOAD] Processing chunk ${Math.floor(i / CHUNK_SIZE) + 1}/${Math.ceil(propertiesToUpload.length / CHUNK_SIZE)} (${chunk.length} properties)`);
        
        // Process chunk with controlled concurrency
        const geocodingTasks = chunk.map((prop) => 
          limit(async () => {
            let enriched = { ...prop };
            let shouldInsert = true;
            
            // Geocode if lat/lng not provided or invalid
            if (!prop.latitude || !prop.longitude || isNaN(prop.latitude) || isNaN(prop.longitude)) {
              const coords = await geocodeAddress(prop.address, prop.city, prop.state, prop.zipCode);
              if (coords) {
                enriched.latitude = coords.lat;
                enriched.longitude = coords.lng;
              } else {
                console.warn(`Geocoding failed for: ${prop.address}, ${prop.city}, ${prop.state} ${prop.zipCode}`);
                geocodingFailures.push(`${prop.address}, ${prop.city}, ${prop.state} ${prop.zipCode}`);
                shouldInsert = false;
              }
            }
            
            // Look up company contact
            if (shouldInsert && prop.propertyOwner) {
              try {
                const contact = await db
                  .select()
                  .from(companyContacts)
                  .where(eq(companyContacts.companyName, prop.propertyOwner))
                  .limit(1);
                
                if (contact.length > 0) {
                  enriched.companyContactName = contact[0].contactName;
                  enriched.companyContactEmail = contact[0].contactEmail;
                }
              } catch (contactError) {
                console.error(`Error looking up contact for ${prop.propertyOwner}:`, contactError);
              }
            }
            
            return { enriched, shouldInsert };
          })
        );
        
        // Wait for all geocoding tasks in this chunk to complete
        const results = await Promise.all(geocodingTasks);
        
        // Collect successful properties from this chunk
        results.forEach(({ enriched, shouldInsert }) => {
          if (shouldInsert) {
            successfulProperties.push(enriched);
          }
        });
        
        // Insert this chunk into database immediately to avoid memory buildup
        if (results.some(r => r.shouldInsert)) {
          const chunkToInsert = results
            .filter(r => r.shouldInsert)
            .map(r => r.enriched);
          
          if (chunkToInsert.length > 0) {
            await db.insert(properties).values(chunkToInsert);
            console.log(`[UPLOAD] Inserted ${chunkToInsert.length} properties from chunk`);
          }
        }
      }
      
      console.log(`[UPLOAD] Upload complete: ${successfulProperties.length} properties inserted, ${geocodingFailures.length} failed`);
      
      const response: any = { 
        count: successfulProperties.length,
        total: propertiesToUpload.length,
        success: true
      };
      
      if (geocodingFailures.length > 0) {
        response.warnings = {
          message: `Failed to geocode ${geocodingFailures.length} propert${geocodingFailures.length === 1 ? 'y' : 'ies'}. ${geocodingFailures.length === 1 ? 'This property was' : 'These properties were'} not imported. Please verify the addresses and try again.`,
          failedAddresses: geocodingFailures
        };
      }
      
      res.json(response);
    } catch (error) {
      console.error('[UPLOAD ERROR]', error);
      res.status(500).json({ message: "Error uploading properties" });
    }
  });

  // Delete all properties (requires admin auth)
  app.delete("/api/properties", requireAdminAuth, async (_req, res) => {
    try {
      await db.delete(properties);
      res.json({ message: "All properties deleted" });
    } catch (error) {
      console.error('Error deleting properties:', error);
      res.status(500).json({ message: "Error deleting properties" });
    }
  });

  // Delete a single property by ID (requires admin auth)
  app.delete("/api/properties/:id", requireAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      console.log(`[DELETE] Attempting to delete property ID: ${id}`);
      const deleted = await db.delete(properties).where(eq(properties.id, id)).returning();
      
      if (deleted.length === 0) {
        console.warn(`[DELETE] Property not found: ${id}`);
        return res.status(404).json({ message: "Property not found" });
      }
      
      console.log(`[DELETE] Successfully deleted property: ${deleted[0].address}`);
      res.json({ message: "Property deleted successfully", property: deleted[0] });
    } catch (error) {
      console.error('[DELETE ERROR]', error);
      res.status(500).json({ message: `Error deleting property: ${error instanceof Error ? error.message : 'Unknown error'}` });
    }
  });

  // Debug endpoint to find problematic properties (for admin use only)
  app.get("/api/debug/bad-coords", requireAdminAuth, async (_req, res) => {
    try {
      const badCoordProperties = await db
        .select()
        .from(properties)
        .where(
          and(
            gt(properties.latitude, 36.5),
            lt(properties.latitude, 38.5),
            gt(properties.longitude, -124),
            lt(properties.longitude, -121)
          )
        );
      
      res.json({
        count: badCoordProperties.length,
        properties: badCoordProperties,
        message: "Properties with potential coordinate issues found"
      });
    } catch (error) {
      console.error('[DEBUG ERROR]', error);
      res.status(500).json({ message: "Error fetching debug info" });
    }
  });

  // Delete problematic properties by ID (for admin cleanup)
  app.post("/api/debug/delete-bad-coords", requireAdminAuth, async (req, res) => {
    try {
      const { propertyIds } = req.body;
      if (!Array.isArray(propertyIds)) {
        return res.status(400).json({ message: "Expected array of property IDs" });
      }

      let deletedCount = 0;
      for (const id of propertyIds) {
        const result = await db.delete(properties).where(eq(properties.id, id)).returning();
        if (result.length > 0) deletedCount++;
      }

      res.json({ message: `Deleted ${deletedCount} properties`, deletedCount });
    } catch (error) {
      console.error('[DEBUG DELETE ERROR]', error);
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

  // Helper function to parse Excel serial dates
  function parseExcelDate(value: string | null): string | null {
    if (!value) return null;
    
    // Check if it's an Excel serial number (pure numeric string)
    if (/^\d+(\.\d+)?$/.test(value)) {
      const num = parseFloat(value);
      if (num > 0 && num < 100000) {
        // Excel serial date: number of days since December 30, 1899
        const excelEpoch = new Date(1899, 11, 30);
        const date = new Date(excelEpoch.getTime() + num * 24 * 60 * 60 * 1000);
        
        // Validate the parsed date is reasonable
        if (date.getFullYear() >= 1900 && date.getFullYear() <= 2100) {
          return date.toISOString();
        }
      }
    }
    
    // Try parsing as existing ISO string or return as-is
    return value;
  }

  // Clean up bad date formats - Convert Excel serial dates to ISO strings (requires admin auth)
  app.post("/api/properties/cleanup-dates", requireAdminAuth, async (_req, res) => {
    try {
      const allProps = await db.select().from(properties);
      // Find properties with Excel serial date format (numeric strings like "45961")
      const badDates = allProps.filter(p => 
        p.dateSold && /^\d+(\.\d+)?$/.test(p.dateSold)
      );

      console.log(`Found ${badDates.length} properties with Excel serial dates`);
      
      let fixed = 0;

      for (const prop of badDates) {
        const isoDate = parseExcelDate(prop.dateSold);
        if (isoDate && isoDate !== prop.dateSold) {
          await db
            .update(properties)
            .set({ dateSold: isoDate })
            .where(eq(properties.id, prop.id));
          fixed++;
          console.log(`Fixed date for ${prop.address}: ${prop.dateSold} -> ${isoDate}`);
        }
      }

      res.json({
        totalBadDates: badDates.length,
        fixed: fixed
      });
    } catch (error) {
      console.error('Error cleaning up dates:', error);
      res.status(500).json({ message: "Error cleaning up dates" });
    }
  });

  // Remove duplicate properties - Keep only the one with correct coordinates (requires admin auth)
  app.post("/api/properties/cleanup-duplicates", requireAdminAuth, async (_req, res) => {
    try {
      const allProps = await db.select().from(properties);
      
      // Group properties by address
      const propertyGroups = new Map<string, typeof allProps>();
      for (const prop of allProps) {
        const key = `${prop.address}|${prop.city}|${prop.state}|${prop.zipCode}`;
        const group = propertyGroups.get(key) || [];
        group.push(prop);
        propertyGroups.set(key, group);
      }

      // Find duplicates
      const duplicateGroups = Array.from(propertyGroups.entries())
        .filter(([, group]) => group.length > 1);

      console.log(`Found ${duplicateGroups.length} addresses with duplicates`);

      let deletedCount = 0;
      const deletedAddresses: string[] = [];

      for (const [key, group] of duplicateGroups) {
        // Sort by priority: properties with SF fallback coords should be deleted
        const sorted = group.sort((a, b) => {
          const aIsBad = a.latitude && a.longitude && 
            Math.abs(a.latitude - 37.7749) < 0.0001 && 
            Math.abs(a.longitude + 122.4194) < 0.0001;
          const bIsBad = b.latitude && b.longitude && 
            Math.abs(b.latitude - 37.7749) < 0.0001 && 
            Math.abs(b.longitude + 122.4194) < 0.0001;
          
          // Bad coords should be deleted (sort to end)
          if (aIsBad && !bIsBad) return 1;
          if (!aIsBad && bIsBad) return -1;
          return 0;
        });

        // Keep the first (best) one, delete the rest
        const toKeep = sorted[0];
        const toDelete = sorted.slice(1);

        for (const prop of toDelete) {
          await db.delete(properties).where(eq(properties.id, prop.id));
          deletedCount++;
          console.log(`Deleted duplicate: ${prop.address} (ID: ${prop.id}, coords: ${prop.latitude}, ${prop.longitude})`);
        }

        if (toDelete.length > 0) {
          deletedAddresses.push(`${toKeep.address}, ${toKeep.city}, ${toKeep.state} ${toKeep.zipCode}`);
        }
      }

      res.json({
        duplicateAddresses: duplicateGroups.length,
        duplicatesDeleted: deletedCount,
        cleanedAddresses: deletedAddresses
      });
    } catch (error) {
      console.error('Error cleaning up duplicates:', error);
      res.status(500).json({ message: "Error cleaning up duplicates" });
    }
  });

  // Clean up bad geocoding - Re-geocode properties with San Francisco fallback coordinates (requires admin auth)
  app.post("/api/properties/cleanup-geocoding", requireAdminAuth, async (_req, res) => {
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
