import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { db } from "./storage";
import {
  properties,
  companyContacts,
  users,
  insertPropertySchema,
  insertUserSchema,
  loginSchema,
  sfrSyncState,
} from "@shared/schema";
import { eq, and, gt, lt, desc, sql } from "drizzle-orm";
import { seedCompanyContacts } from "./seed-companies";
import pLimit from "p-limit";
import { z } from "zod";
import { parseExcelDate } from "./utils/parseExcelDate";
import { normalizeToTitleCase } from "./utils/normalizeToTitleCase";
import { geocodeAddress } from "./utils/geocodeAddress";

// Map varying property type strings (from SFR or other sources) to canonical app types
function mapPropertyType(raw?: string | null) {
  if (!raw || typeof raw !== 'string') return 'Single Family';
  const s = raw.trim().toLowerCase();

  // Common mappings
  if (s.includes('single') && s.includes('family')) return 'Single Family';
  if (s.includes('condo') || s.includes('condominium')) return 'Condo';
  if (s.includes('town') && s.includes('house')) return 'Townhouse';
  if (s.includes('townhouse')) return 'Townhouse';
  //if (s.includes('duplex') || s.includes('triplex') || s.includes('multi') || s.includes('multi-family')) return 'Multi Family';
  //if (s.includes('mobile') || s.includes('manufactured')) return 'Mobile Home';
  //if (s.includes('lot') || s.includes('land')) return 'Land';

  // Fallback to a normalized title-case value
  const title = normalizeToTitleCase(raw) || raw;
  return title;
}
import bcrypt from "bcrypt";
import dotenv from "dotenv";

dotenv.config()

// Zod schema for partial property updates with proper validation
const updatePropertySchema = z
  .object({
    address: z.string().min(1, "Address is required").optional(),
    city: z.string().min(1, "City is required").optional(),
    state: z.string().min(1, "State is required").optional(),
    zipCode: z.string().min(1, "Zip code is required").optional(),
    price: z.coerce.number().min(0, "Price must be positive").optional(),
    bedrooms: z.coerce
      .number()
      .int()
      .min(0, "Bedrooms must be 0 or more")
      .optional(),
    bathrooms: z.coerce
      .number()
      .min(0, "Bathrooms must be 0 or more")
      .optional(),
    squareFeet: z.coerce
      .number()
      .int()
      .min(0, "Square feet must be positive")
      .optional(),
    propertyType: z.string().min(1, "Property type is required").optional(),
    imageUrl: z.string().nullable().optional(),
    latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
    longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
    description: z.string().nullable().optional(),
    yearBuilt: z.coerce
      .number()
      .int()
      .min(1800)
      .max(2100)
      .nullable()
      .optional(),
    propertyOwner: z.string().nullable().optional(),
    purchasePrice: z.coerce.number().min(0).nullable().optional(),
    dateSold: z.string().nullable().optional(),
  })
  .strict();

// Middleware to check admin authentication
async function requireAdminAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    // Check if user is logged in
    if (!req.session.userId) {
      console.error(
        `[AUTH DENIED] No user session for ${req.path}, Session ID: ${req.sessionID}`,
      );
      return res.status(401).json({ message: "Unauthorized - Please log in" });
    }

    // Check if user is admin
    const [user] = await db
      .select({ isAdmin: users.isAdmin })
      .from(users)
      .where(eq(users.id, req.session.userId))
      .limit(1);

    if (!user || !user.isAdmin) {
      console.error(
        `[AUTH DENIED] User ${req.session.userId} is not an admin for ${req.path}`,
      );
      return res
        .status(403)
        .json({ message: "Forbidden - Admin access required" });
    }

    console.log(
      `[AUTH GRANTED] Admin user ${req.session.userId} accessing ${req.path}`,
    );
    next();
  } catch (error) {
    console.error("[AUTH ERROR]", error);
    res.status(500).json({ message: "Error checking admin status" });
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Seed company contacts on startup
  await seedCompanyContacts();

  // Check admin authentication status
  app.get("/api/admin/status", async (req, res) => {
    try {
      // Check if user is logged in
      if (!req.session.userId) {
        return res.json({ authenticated: false, isAdmin: false });
      }

      // Check if user is admin
      const [user] = await db
        .select({ isAdmin: users.isAdmin })
        .from(users)
        .where(eq(users.id, req.session.userId))
        .limit(1);

      const isAdmin = user?.isAdmin;
      res.json({ authenticated: !!req.session.userId, isAdmin });
    } catch (error) {
      console.error("Error checking admin status:", error);
      res.status(500).json({ message: "Error checking admin status" });
    }
  });

  // ============== USER AUTHENTICATION ROUTES ==============

  // User signup
  app.post("/api/auth/signup", async (req, res) => {
    try {
      const validation = insertUserSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          message: "Invalid signup data",
          errors: validation.error.errors,
        });
      }

      const { firstName, lastName, phone, email, password } = validation.data;

      // Check if email already exists
      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);
      if (existingUser.length > 0) {
        return res
          .status(409)
          .json({ message: "An account with this email already exists" });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      // Create user
      const [newUser] = await db
        .insert(users)
        .values({
          firstName,
          lastName,
          phone,
          email: email.toLowerCase(),
          passwordHash,
        })
        .returning();

      // Set user session
      req.session.userId = newUser.id;

      // Return user data (without password hash)
      const { passwordHash: _, ...userWithoutPassword } = newUser;
      res.status(201).json({
        success: true,
        user: userWithoutPassword,
      });
    } catch (error) {
      console.error("Signup error:", error);
      res.status(500).json({ message: "Error creating account" });
    }
  });

  // User login
  app.post("/api/auth/login", async (req, res) => {
    try {
      const validation = loginSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          message: "Invalid login data",
          errors: validation.error.errors,
        });
      }

      const { email, password } = validation.data;

      // Find user by email
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.passwordHash);
      if (!isValidPassword) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Set user session
      req.session.userId = user.id;

      // Return user data (without password hash)
      const { passwordHash: _, ...userWithoutPassword } = user;
      res.json({
        success: true,
        user: userWithoutPassword,
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Error logging in" });
    }
  });

  // User logout
  app.post("/api/auth/logout", async (req, res) => {
    req.session.userId = undefined;
    res.json({ success: true });
  });

  // Get current user
  app.get("/api/auth/me", async (req, res) => {
    try {
      if (!req.session.userId) {
        return res.json({ user: null });
      }

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, req.session.userId))
        .limit(1);
      if (!user) {
        req.session.userId = undefined;
        return res.json({ user: null });
      }

      // Return user data (without password hash)
      const { passwordHash: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword });
    } catch (error) {
      console.error("Error fetching current user:", error);
      res.status(500).json({ message: "Error fetching user" });
    }
  });

  // Admin: Get all users
  app.get("/api/admin/users", requireAdminAuth, async (_req, res) => {
    try {
      const allUsers = await db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          phone: users.phone,
          email: users.email,
          createdAt: users.createdAt,
        })
        .from(users)
        .orderBy(desc(users.createdAt));
      res.json(allUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Error fetching users" });
    }
  });

  // ============== END USER AUTHENTICATION ROUTES ==============

  // Get all properties
  app.get("/api/properties", async (_req, res) => {
    try {
      const allProperties = await db.select().from(properties);
      console.log("Properties Length: ", allProperties.length)
      res.status(200).json(allProperties);
    } catch (error) {
      console.error("Error fetching properties:", error);
      res.status(500).json({ message: "Error fetching properties" });
    }
  });

  // Create a single property (requires admin auth)
  app.post("/api/properties", requireAdminAuth, async (req, res) => {
    try {
      console.log(
        "POST /api/properties - Raw request body:",
        JSON.stringify(req.body, null, 2),
      );

      // Validate request body with Zod schema
      const validation = insertPropertySchema.safeParse(req.body);
      if (!validation.success) {
        console.error(
          "Validation errors:",
          JSON.stringify(validation.error.errors, null, 2),
        );
        return res.status(400).json({
          message: "Invalid property data",
          errors: validation.error.errors,
        });
      }

      const propertyData = validation.data;
      console.log(
        "Validated property data:",
        JSON.stringify(propertyData, null, 2),
      );
      let enriched = { ...propertyData };

      // Geocode if lat/lng not provided or invalid
      const hasValidCoords =
        propertyData.latitude != null &&
        propertyData.longitude != null &&
        !isNaN(Number(propertyData.latitude)) &&
        !isNaN(Number(propertyData.longitude));

      if (!hasValidCoords) {
        console.log(
          `Geocoding address: ${propertyData.address}, ${propertyData.city}, ${propertyData.state} ${propertyData.zipCode}`,
        );
        const coords = await geocodeAddress(
          propertyData.address,
          propertyData.city,
          propertyData.state,
          propertyData.zipCode,
        );
        if (coords) {
          enriched.latitude = coords.lat;
          enriched.longitude = coords.lng;
        } else {
          // Geocoding failed - allow property creation without coordinates
          console.warn(
            `Geocoding unavailable for: ${propertyData.address}. Property will be created without map coordinates.`,
          );
          enriched.latitude = null;
          enriched.longitude = null;
        }
      } else {
        console.log(
          `Using provided coordinates for: ${propertyData.address} (${propertyData.latitude}, ${propertyData.longitude})`,
        );
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

      const [inserted] = await db
        .insert(properties)
        .values(enriched)
        .returning();
      console.log(`Property created: ${inserted.address} (ID: ${inserted.id})`);

      // Add warning in response if coordinates are missing
      if (!inserted.latitude || !inserted.longitude) {
        res.json({
          ...inserted,
          _warning:
            "Property created without map coordinates. Enable Google Geocoding API or provide latitude/longitude to display on map.",
        });
      } else {
        res.json(inserted);
      }
    } catch (error) {
      console.error("Error creating property:", error);
      res.status(500).json({ message: "Error creating property" });
    }
  });

  // Upload properties with chunked processing and controlled concurrency (requires admin auth)
  app.post("/api/properties/upload", requireAdminAuth, async (req, res) => {
    try {
      const propertiesToUpload = req.body;

      if (!Array.isArray(propertiesToUpload)) {
        return res
          .status(400)
          .json({ message: "Expected an array of properties" });
      }

      console.log(
        `[UPLOAD] Starting upload of ${propertiesToUpload.length} properties`,
      );

      const geocodingFailures: string[] = [];
      const successfulProperties: any[] = [];

      // Limit concurrent geocoding to 3 requests at a time for production reliability
      const limit = pLimit(3);
      const CHUNK_SIZE = 10;

      // Process properties in chunks to avoid timeouts
      for (let i = 0; i < propertiesToUpload.length; i += CHUNK_SIZE) {
        const chunk = propertiesToUpload.slice(i, i + CHUNK_SIZE);
        console.log(
          `[UPLOAD] Processing chunk ${Math.floor(i / CHUNK_SIZE) + 1}/${Math.ceil(propertiesToUpload.length / CHUNK_SIZE)} (${chunk.length} properties)`,
        );

        // Process chunk with controlled concurrency
        const geocodingTasks = chunk.map((prop) =>
          limit(async () => {
            let enriched = { ...prop };
            let shouldInsert = true;

            // Geocode if lat/lng not provided or invalid
            if (
              !prop.latitude ||
              !prop.longitude ||
              isNaN(prop.latitude) ||
              isNaN(prop.longitude)
            ) {
              const coords = await geocodeAddress(
                prop.address,
                prop.city,
                prop.state,
                prop.zipCode,
              );
              if (coords) {
                enriched.latitude = coords.lat;
                enriched.longitude = coords.lng;
              } else {
                console.warn(
                  `Geocoding failed for: ${prop.address}, ${prop.city}, ${prop.state} ${prop.zipCode}`,
                );
                geocodingFailures.push(
                  `${prop.address}, ${prop.city}, ${prop.state} ${prop.zipCode}`,
                );
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
                console.error(
                  `Error looking up contact for ${prop.propertyOwner}:`,
                  contactError,
                );
              }
            }

            return { enriched, shouldInsert };
          }),
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
        if (results.some((r) => r.shouldInsert)) {
          const chunkToInsert = results
            .filter((r) => r.shouldInsert)
            .map((r) => r.enriched);

          if (chunkToInsert.length > 0) {
            await db.insert(properties).values(chunkToInsert);
            console.log(
              `[UPLOAD] Inserted ${chunkToInsert.length} properties from chunk`,
            );
          }
        }
      }

      console.log(
        `[UPLOAD] Upload complete: ${successfulProperties.length} properties inserted, ${geocodingFailures.length} failed`,
      );

      const response: any = {
        count: successfulProperties.length,
        total: propertiesToUpload.length,
        success: true,
      };

      if (geocodingFailures.length > 0) {
        response.warnings = {
          message: `Failed to geocode ${geocodingFailures.length} propert${geocodingFailures.length === 1 ? "y" : "ies"}. ${geocodingFailures.length === 1 ? "This property was" : "These properties were"} not imported. Please verify the addresses and try again.`,
          failedAddresses: geocodingFailures,
        };
      }

      res.status(200).json(response);
    } catch (error) {
      console.error("[UPLOAD ERROR]", error);
      res.status(500).json({ message: "Error uploading properties" });
    }
  });

  // Delete all properties (requires admin auth)
  app.delete("/api/properties", requireAdminAuth, async (_req, res) => {
    try {
      await db.delete(properties);
      res.json({ message: "All properties deleted" });
    } catch (error) {
      console.error("Error deleting properties:", error);
      res.status(500).json({ message: "Error deleting properties" });
    }
  });

  // Delete a single property by ID (requires admin auth)
  app.delete("/api/properties/:id", requireAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      console.log(`[DELETE] Attempting to delete property ID: ${id}`);
      const deleted = await db
        .delete(properties)
        .where(eq(properties.id, id))
        .returning();

      if (deleted.length === 0) {
        console.warn(`[DELETE] Property not found: ${id}`);
        return res.status(404).json({ message: "Property not found" });
      }

      console.log(
        `[DELETE] Successfully deleted property: ${deleted[0].address}`,
      );
      res.json({
        message: "Property deleted successfully",
        property: deleted[0],
      });
    } catch (error) {
      console.error("[DELETE ERROR]", error);
      res.status(500).json({
        message: `Error deleting property: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  });

  // Update a single property by ID (requires admin auth)
  app.patch("/api/properties/:id", requireAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const rawUpdates = req.body;

      console.log(`[UPDATE] Attempting to update property ID: ${id}`);
      console.log(`[UPDATE] Raw updates:`, JSON.stringify(rawUpdates, null, 2));

      // Validate request body with Zod schema
      const validation = updatePropertySchema.safeParse(rawUpdates);
      if (!validation.success) {
        console.error(
          "[UPDATE] Validation errors:",
          JSON.stringify(validation.error.errors, null, 2),
        );
        return res.status(400).json({
          message: "Invalid update data",
          errors: validation.error.errors,
        });
      }

      const updates = validation.data;

      // Ensure we have something to update
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }

      // Check if property exists
      const existing = await db
        .select()
        .from(properties)
        .where(eq(properties.id, id))
        .limit(1);
      if (existing.length === 0) {
        console.warn(`[UPDATE] Property not found: ${id}`);
        return res.status(404).json({ message: "Property not found" });
      }

      // If propertyOwner changed, update company contact info
      const finalUpdates: Record<string, any> = { ...updates };
      if (updates.propertyOwner !== undefined) {
        if (updates.propertyOwner) {
          const contact = await db
            .select()
            .from(companyContacts)
            .where(eq(companyContacts.companyName, updates.propertyOwner))
            .limit(1);

          if (contact.length > 0) {
            finalUpdates.companyContactName = contact[0].contactName;
            finalUpdates.companyContactEmail = contact[0].contactEmail;
          } else {
            // Clear contact info if owner changed to unknown company
            finalUpdates.companyContactName = null;
            finalUpdates.companyContactEmail = null;
          }
        } else {
          // Clear contact info if owner removed
          finalUpdates.companyContactName = null;
          finalUpdates.companyContactEmail = null;
        }
      }

      console.log(
        `[UPDATE] Validated updates:`,
        JSON.stringify(finalUpdates, null, 2),
      );

      // Perform the update
      const [updated] = await db
        .update(properties)
        .set(finalUpdates)
        .where(eq(properties.id, id))
        .returning();

      console.log(`[UPDATE] Successfully updated property: ${updated.address}`);
      res.json(updated);
    } catch (error) {
      console.error("[UPDATE ERROR]", error);
      res.status(500).json({
        message: `Error updating property: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  });

  // Get all company contacts
  app.get("/api/company-contacts", async (_req, res) => {
    try {
      const allContacts = await db
        .select()
        .from(companyContacts)
        .orderBy(companyContacts.companyName);
      res.json(allContacts);
    } catch (error) {
      console.error("Error fetching company contacts:", error);
      res.status(500).json({ message: "Error fetching company contacts" });
    }
  });

  // Clean up bad date formats - Convert Excel serial dates to ISO strings (requires admin auth)
  app.post(
    "/api/properties/cleanup-dates",
    requireAdminAuth,
    async (_req, res) => {
      try {
        const allProps = await db.select().from(properties);
        // Find properties with Excel serial date format (numeric strings like "45961")
        const badDates = allProps.filter(
          (p) => p.dateSold && /^\d+(\.\d+)?$/.test(p.dateSold),
        );

        console.log(
          `Found ${badDates.length} properties with Excel serial dates`,
        );

        let fixed = 0;

        for (const prop of badDates) {
          const isoDate = parseExcelDate(prop.dateSold);
          if (isoDate && isoDate !== prop.dateSold) {
            await db
              .update(properties)
              .set({ dateSold: isoDate })
              .where(eq(properties.id, prop.id));
            fixed++;
            console.log(
              `Fixed date for ${prop.address}: ${prop.dateSold} -> ${isoDate}`,
            );
          }
        }

        res.json({
          totalBadDates: badDates.length,
          fixed: fixed,
        });
      } catch (error) {
        console.error("Error cleaning up dates:", error);
        res.status(500).json({ message: "Error cleaning up dates" });
      }
    },
  );

  // Remove duplicate properties - Keep only the one with correct coordinates (requires admin auth)
  app.post(
    "/api/properties/cleanup-duplicates",
    requireAdminAuth,
    async (_req, res) => {
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
        const duplicateGroups = Array.from(propertyGroups.entries()).filter(
          ([, group]) => group.length > 1,
        );

        console.log(
          `Found ${duplicateGroups.length} addresses with duplicates`,
        );

        let deletedCount = 0;
        const deletedAddresses: string[] = [];

        for (const [key, group] of duplicateGroups) {
          // Sort by priority: properties with SF fallback coords should be deleted
          const sorted = group.sort((a, b) => {
            const aIsBad =
              a.latitude &&
              a.longitude &&
              Math.abs(a.latitude - 37.7749) < 0.0001 &&
              Math.abs(a.longitude + 122.4194) < 0.0001;
            const bIsBad =
              b.latitude &&
              b.longitude &&
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
            console.log(
              `Deleted duplicate: ${prop.address} (ID: ${prop.id}, coords: ${prop.latitude}, ${prop.longitude})`,
            );
          }

          if (toDelete.length > 0) {
            deletedAddresses.push(
              `${toKeep.address}, ${toKeep.city}, ${toKeep.state} ${toKeep.zipCode}`,
            );
          }
        }

        res.json({
          duplicateAddresses: duplicateGroups.length,
          duplicatesDeleted: deletedCount,
          cleanedAddresses: deletedAddresses,
        });
      } catch (error) {
        console.error("Error cleaning up duplicates:", error);
        res.status(500).json({ message: "Error cleaning up duplicates" });
      }
    },
  );

  // Cleanup property types to canonical values (admin only)
  app.post(
    "/api/properties/cleanup-property-types",
    requireAdminAuth,
    async (_req, res) => {
      try {
        const allProps = await db.select().from(properties);
        let updated = 0;
        const changed: Array<{ id: string | number; old: string | null; new: string }> = [];

        for (const prop of allProps) {
          const oldVal = prop.propertyType;
          const canonical = mapPropertyType(oldVal || null);
          if ((oldVal || "") !== canonical) {
            await db
              .update(properties)
              .set({ propertyType: canonical })
              .where(eq(properties.id, prop.id));
            updated++;
            changed.push({ id: prop.id as any, old: oldVal ?? null, new: canonical });
            console.log(`Updated propertyType for ID ${prop.id}: ${oldVal} -> ${canonical}`);
          }
        }

        res.json({ total: allProps.length, updated, sampleChanges: changed.slice(0, 20) });
      } catch (error) {
        console.error("Error cleaning up property types:", error);
        res.status(500).json({ message: "Error cleaning up property types" });
      }
    },
  );

  // Proxy Street View image to keep API key secure on server
  app.get("/api/streetview", async (req, res) => {
    try {
      const { address, city, state, size = "600x400" } = req.query;

      if (!address) {
        return res
          .status(400)
          .json({ message: "Address parameter is required" });
      }

      const apiKey = process.env.GOOGLE_API_KEY;
      if (!apiKey) {
        console.error("GOOGLE_API_KEY not configured");
        return res
          .status(500)
          .json({ message: "Street View service not configured" });
      }

      // Combine address components for the location parameter
      const locationParts = [address];
      if (city) locationParts.push(city);
      if (state) locationParts.push(state);
      const location = locationParts.join(", ");

      const streetViewUrl = `https://maps.googleapis.com/maps/api/streetview?size=${size}&location=${encodeURIComponent(location)}&key=${apiKey}`;

      console.log("Fetching Street View for:", location, "size:", size);

      // Fetch the image from Google and proxy it to the client
      const imageResponse = await fetch(streetViewUrl);

      if (!imageResponse.ok) {
        const responseText = await imageResponse.text();
        console.error("Failed to fetch Street View image:", {
          status: imageResponse.status,
          statusText: imageResponse.statusText,
          response: responseText.substring(0, 500), // First 500 chars of response
          location,
        });
        return res
          .status(404)
          .json({ message: "Street View image not available" });
      }

      // Set appropriate headers and stream the image to the client
      const contentType = imageResponse.headers.get("content-type");
      if (contentType) {
        res.setHeader("Content-Type", contentType);
      }
      res.setHeader("Cache-Control", "public, max-age=86400"); // Cache for 24 hours

      // Stream the image data to the response
      const imageBuffer = await imageResponse.arrayBuffer();
      res.send(Buffer.from(imageBuffer));
    } catch (error) {
      console.error("Error fetching Street View image:", error);
      res.status(500).json({ message: "Error fetching Street View image" });
    }
  });

  /* SFR Analytics API calls */
  app.get("/api/sfr/data", requireAdminAuth, async (req, res) => { 
    const API_KEY = process.env.SFR_API_KEY!;
    const API_URL = process.env.SFR_API_URL!;
    const MSA = "San Diego-Chula Vista-Carlsbad, CA";

    const today = new Date().toISOString().split("T")[0];
    
    try {
      // Get or create sync state for this MSA
      let syncState = await db
        .select()
        .from(sfrSyncState)
        .where(eq(sfrSyncState.msa, MSA))
        .limit(1);

      let minDate: string;
      let syncStateId: number;
      let initialTotalSynced: number;

      if (syncState.length === 0) {
        // Create new sync state with default min date
        minDate = "2025-12-03"; // Default start date
        const [newSyncState] = await db
          .insert(sfrSyncState)
          .values({
            msa: MSA,
            lastRecordingDate: null,
            totalRecordsSynced: 0,
          })
          .returning();
        syncStateId = newSyncState.id;
        initialTotalSynced = 0;
      } else {
        // Use last recording date as min date (inclusive), or default
        const lastDate = syncState[0].lastRecordingDate;
        if (lastDate) {
          minDate = new Date(lastDate).toISOString().split("T")[0];
        } else {
          minDate = "2025-12-03"; // Default start date
        }
        syncStateId = syncState[0].id;
        initialTotalSynced = syncState[0].totalRecordsSynced || 0;
      }

      console.log(`[SFR SYNC] Starting sync for ${MSA} from ${minDate} to ${today}`);

      let currentPage = 1;
      let shouldContinue = true;
      let totalProcessed = 0;
      let totalInserted = 0;
      let totalUpdated = 0;
      let totalContactsAdded = 0;
      let latestRecordingDate: string | null = null;

      // Process properties in batches to avoid memory issues
      const BATCH_SIZE = 50;
      let batchBuffer: any[] = [];

      while (shouldContinue) {
        const requestBody = {
          "msa": MSA,
          "city": null,
          "salesDate": {
            "min": minDate,
            "max": today
          },
          "pagination": {
            "page": currentPage,
            "pageSize": 100
          },
          "sort": {
            "field": "recording_date",
            "direction": "asc"
          }
        };
        
        const response = await fetch(`${API_URL}/buyers/market/page`, {
          method: 'POST',
          headers: {
            'X-API-TOKEN': API_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[SFR SYNC] API error on page ${currentPage}:`, errorText);
          return res.status(response.status).json({ 
            message: "Error fetching SFR buyer data",
            status: response.status,
            error: errorText
          });
        }

        const data = await response.json();

        // Check if data is empty
        if (!data || !Array.isArray(data) || data.length === 0) {
          console.log(`[SFR SYNC] No more data on page ${currentPage}, stopping`);
          shouldContinue = false;
          break;
        }

        console.log(`[SFR SYNC] Fetched page ${currentPage} with ${data.length} records`);
        if (data.length > 0) {
          console.log(`[SFR SYNC] Sample record structure:`, JSON.stringify(data[0], null, 2));
        }

        // Process each property
        for (const record of data) {
          try {
            // Normalize text fields
            const rawAddress = record.address || record.property_address || "";
            const rawCity = record.city || "";
            const rawBuyerName = record.buyerName || record.buyer_name || null;
            const rawSellerName = record.sellerName || record.seller_name || null;
            
            const normalizedAddress = normalizeToTitleCase(rawAddress);
            const normalizedCity = normalizeToTitleCase(rawCity);
            
            // Validate required fields
            if (!normalizedAddress || normalizedAddress.trim() === "") {
              console.warn(`[SFR SYNC] Skipping record with empty address:`, JSON.stringify(record, null, 2));
              totalProcessed++;
              continue;
            }
            
            if (!normalizedCity || normalizedCity.trim() === "") {
              console.warn(`[SFR SYNC] Skipping record with empty city:`, JSON.stringify(record, null, 2));
              totalProcessed++;
              continue;
            }
            
            const propertyData: any = {
              address: normalizedAddress,
              city: normalizedCity,
              state: record.state || "CA",
              zipCode: record.zipCode || record.zip_code || record.zip || "",
              price: record.avmValue || record.avm_value || record.price || null,
              bedrooms: record.bedrooms || null,
              bathrooms: record.bathrooms || null,
              squareFeet: record.buildingArea || record.square_feet || record.sqft || null,
              propertyType: mapPropertyType(record.propertyType || record.property_type || null),
              purchasePrice: record.purchasePrice || record.purchase_price || null,
              dateSold: record.saleDate || record.sale_date || record.date_sold || null,
              status: record.status || "sold",
              
              // Buyer info
              buyerName: normalizeToTitleCase(rawBuyerName),
              buyerFormattedName: normalizeToTitleCase(record.formattedBuyerName || record.buyer_formatted_name),
              phone: record.phone || null,
              isCorporate: record.isCorporate || record.is_corporate || false,
              isCashBuyer: record.isCashBuyer || record.is_cash_buyer || false,
              isDiscountedPurchase: record.isDiscountedPurchase || record.is_discounted_purchase || false,
              isPrivateLender: record.isPrivateLender || record.is_private_lender || false,
              buyerPropertiesCount: record.buyerPropertiesCount || record.buyer_properties_count || null,
              buyerTransactionsCount: record.buyerTransactionsCount || record.buyer_transactions_count || null,
              
              // Seller/lender
              sellerName: normalizeToTitleCase(rawSellerName),
              lenderName: normalizeToTitleCase(record.lenderName || record.lender_name),
              
              // Exit info
              exitValue: record.exitValue || record.exit_value || null,
              exitBuyerName: normalizeToTitleCase(record.exitBuyerName || record.exit_buyer_name),
              profitLoss: record.profitLoss || record.profit_loss || null,
              holdDays: record.holdDays || record.hold_days || null,
              
              // Financials
              saleValue: record.saleValue || record.sale_value || null,
              avmValue: record.avmValue || record.avm_value || null,
              loanAmount: record.loanAmount || record.loan_amount || null,
              
              // SFR API IDs
              sfrPropertyId: record.propertyId || record.property_id || record.sfr_property_id || null,
              sfrRecordId: record.id || record.record_id || record.sfr_record_id || null,
              
              // Market
              msa: record.msa || MSA,
              
              // Dates
              recordingDate: record.recordingDate || record.recording_date || null,
              
              // Coordinates
              latitude: record.latitude || null,
              longitude: record.longitude || null,
              
              // Additional fields
              yearBuilt: record.yearBuilt || record.year_built || null,
            };

            // Track latest recording date
            let recordingDateStr: string | null = null;
            if (propertyData.recordingDate) {
              if (propertyData.recordingDate instanceof Date) {
                recordingDateStr = propertyData.recordingDate.toISOString().split("T")[0];
              } else if (typeof propertyData.recordingDate === 'string') {
                recordingDateStr = propertyData.recordingDate.split("T")[0];
              }
              
              if (recordingDateStr && (!latestRecordingDate || recordingDateStr > latestRecordingDate)) {
                latestRecordingDate = recordingDateStr;
              }
            }
            
            // Store recordingDate as date string
            if (recordingDateStr) {
              propertyData.recordingDate = recordingDateStr;
            }

            // Geocode if coordinates are missing
            if ((!propertyData.latitude || !propertyData.longitude) && propertyData.address) {
              const coords = await geocodeAddress(
                propertyData.address,
                propertyData.city,
                propertyData.state,
                propertyData.zipCode
              );
              if (coords) {
                propertyData.latitude = coords.lat;
                propertyData.longitude = coords.lng;
              }
            }

            // Handle company contact
            const rawCompanyName = record.buyerName || record.buyer_name;
            const normalizedCompanyName = normalizeToTitleCase(rawCompanyName);
            
            if (normalizedCompanyName) {
              const contactName = normalizeToTitleCase(record.formattedBuyerName || record.buyer_formatted_name) || normalizedCompanyName;
              const contactEmail = record.contactEmail || record.contact_email || null;

              // Check if company contact already exists (case-insensitive comparison)
              // Normalize existing company names for comparison to catch variations like "Llc" vs "LLC"
              const normalizedCompanyNameLower = normalizedCompanyName.toLowerCase();
              const allContacts = await db
                .select()
                .from(companyContacts);
              
              // Find existing contact by normalizing and comparing
              const existingContact = allContacts.find(contact => {
                const normalizedExisting = normalizeToTitleCase(contact.companyName);
                return normalizedExisting && normalizedExisting.toLowerCase() === normalizedCompanyNameLower;
              });

              if (!existingContact) {
                // Insert new company contact
                try {
                  await db.insert(companyContacts).values({
                    companyName: normalizedCompanyName,
                    contactName: null,
                    contactEmail: contactEmail,
                  });
                  totalContactsAdded++;
                  console.log(`[SFR SYNC] Added new company contact: ${normalizedCompanyName}`);
                } catch (contactError: any) {
                  // Ignore duplicate key errors (race condition)
                  if (!contactError?.message?.includes("duplicate") && !contactError?.code?.includes("23505")) {
                    console.error(`[SFR SYNC] Error adding company contact ${normalizedCompanyName}:`, contactError);
                  }
                }
                
                // Set property owner and contact info
                propertyData.propertyOwner = normalizedCompanyName;
                propertyData.companyContactName = null;
                propertyData.companyContactEmail = contactEmail;
              } else {
                // Use the existing contact's normalized name to ensure consistency
                const existingNormalized = normalizeToTitleCase(existingContact.companyName);
                console.log(`[SFR SYNC] Found existing company contact: ${existingContact.companyName} (normalized: ${existingNormalized})`);
                
                // Set property owner and contact info using existing contact data
                propertyData.propertyOwner = existingNormalized || normalizedCompanyName;
                propertyData.companyContactName = existingContact.contactName || contactName;
                propertyData.companyContactEmail = existingContact.contactEmail || contactEmail;
              }
            }

            // Check for existing property by SFR IDs first
            let existingProperty = null;
            
            if (propertyData.sfrPropertyId) {
              const byPropertyId = await db
                .select()
                .from(properties)
                .where(eq(properties.sfrPropertyId, propertyData.sfrPropertyId))
                .limit(1);
              if (byPropertyId.length > 0) {
                existingProperty = byPropertyId[0];
              }
            }
            
            if (!existingProperty && propertyData.sfrRecordId) {
              const byRecordId = await db
                .select()
                .from(properties)
                .where(eq(properties.sfrRecordId, propertyData.sfrRecordId))
                .limit(1);
              if (byRecordId.length > 0) {
                existingProperty = byRecordId[0];
              }
            }

            // If no match by SFR IDs, check by address
            if (!existingProperty && propertyData.address) {
              const normalizedAddressForCompare = propertyData.address.toLowerCase().trim();
              const normalizedCityForCompare = propertyData.city.toLowerCase().trim();
              
              const byAddress = await db
                .select()
                .from(properties)
                .where(
                  and(
                    sql`LOWER(TRIM(${properties.address})) = ${normalizedAddressForCompare}`,
                    sql`LOWER(TRIM(${properties.city})) = ${normalizedCityForCompare}`,
                    eq(properties.state, propertyData.state),
                    eq(properties.zipCode, propertyData.zipCode)
                  )
                )
                .limit(1);
              if (byAddress.length > 0) {
                existingProperty = byAddress[0];
              }
            }

            if (existingProperty) {
              // Update existing property if this record is more recent
              const shouldUpdate = !existingProperty.recordingDate || 
                (propertyData.recordingDate && propertyData.recordingDate > existingProperty.recordingDate);
              
              if (shouldUpdate) {
                const { id, createdAt, ...updateData } = propertyData;
                updateData.updatedAt = sql`now()`;
                
                try {
                  await db
                    .update(properties)
                    .set(updateData)
                    .where(eq(properties.id, existingProperty.id));
                  
                  totalUpdated++;
                  console.log(`[SFR SYNC] Updated property: ${propertyData.address} (ID: ${existingProperty.id})`);
                } catch (updateError: any) {
                  console.error(`[SFR SYNC] Error updating property ${propertyData.address}:`, updateError);
                }
              } else {
                console.log(`[SFR SYNC] Skipping update for ${propertyData.address} - existing record is same or more recent`);
              }
            } else {
              // Add to batch buffer for insertion
              batchBuffer.push(propertyData);
              console.log(`[SFR SYNC] Adding to batch buffer: ${propertyData.address}`);
              
              // Insert batch if full
              if (batchBuffer.length >= BATCH_SIZE) {
                try {
                  await db.insert(properties).values(batchBuffer);
                  totalInserted += batchBuffer.length;
                  console.log(`[SFR SYNC] Inserted batch of ${batchBuffer.length} properties`);
                  batchBuffer = [];
                } catch (batchError: any) {
                  console.error(`[SFR SYNC] Error inserting batch:`, batchError);
                  // Try inserting individually
                  for (const prop of batchBuffer) {
                    try {
                      await db.insert(properties).values([prop]);
                      totalInserted++;
                    } catch (individualError: any) {
                      console.error(`[SFR SYNC] Error inserting property ${prop.address}:`, individualError);
                    }
                  }
                  batchBuffer = [];
                }
              }
            }

            totalProcessed++;
          } catch (propertyError: any) {
            console.error(`[SFR SYNC] Error processing property:`, propertyError);
            console.error(`[SFR SYNC] Record that caused error:`, JSON.stringify(record, null, 2));
            totalProcessed++;
          }
        }

        // Check if we should continue to next page
        if (data.length < 100) {
          shouldContinue = false;
        } else {
          currentPage++;
        }
      }

      // Insert any remaining properties in buffer (after while loop ends)
      if (batchBuffer.length > 0) {
        try {
          await db.insert(properties).values(batchBuffer);
          totalInserted += batchBuffer.length;
          console.log(`[SFR SYNC] Inserted final batch of ${batchBuffer.length} properties`);
        } catch (batchError: any) {
          console.error(`[SFR SYNC] Error inserting final batch:`, batchError);
          // Try inserting individually
          for (const prop of batchBuffer) {
            try {
              await db.insert(properties).values([prop]);
              totalInserted++;
            } catch (individualError: any) {
              console.error(`[SFR SYNC] Error inserting property ${prop.address}:`, individualError);
            }
          }
        }
        batchBuffer = [];
      }

      // Update sync state with today's date as lastRecordingDate
      const newTotalSynced = initialTotalSynced + totalProcessed;
      
      await db
        .update(sfrSyncState)
        .set({
          lastRecordingDate: today, // Always set to today's date
          totalRecordsSynced: newTotalSynced,
          lastSyncAt: sql`now()`,
        })
        .where(eq(sfrSyncState.id, syncStateId));
      
      console.log(`[SFR SYNC] Updated sync state with lastRecordingDate: ${today}`);
      console.log(`[SFR SYNC] Sync complete: ${totalProcessed} processed, ${totalInserted} inserted, ${totalUpdated} updated, ${totalContactsAdded} contacts added`);

      return res.status(200).json({
        success: true,
        totalProcessed,
        totalInserted,
        totalUpdated,
        totalContactsAdded,
        dateRange: {
          from: minDate,
          to: today
        },
        lastRecordingDate: today,
        msa: MSA,
      });
      
    } catch (error) {
      console.error("[SFR SYNC] Error:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({ 
        message: "Error syncing SFR buyer data",
        error: errorMessage
      });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
