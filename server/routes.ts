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

  // Upload properties
  app.post("/api/properties/upload", async (req, res) => {
    try {
      const propertiesToUpload = req.body;
      
      if (!Array.isArray(propertiesToUpload)) {
        return res.status(400).json({ message: "Expected an array of properties" });
      }

      // Auto-populate company contact for each property
      const enrichedProperties = await Promise.all(
        propertiesToUpload.map(async (prop) => {
          if (prop.propertyOwner) {
            // Look up company contact
            const contact = await db
              .select()
              .from(companyContacts)
              .where(eq(companyContacts.companyName, prop.propertyOwner))
              .limit(1);
            
            if (contact.length > 0) {
              return {
                ...prop,
                companyContactName: contact[0].contactName,
                companyContactEmail: contact[0].contactEmail,
              };
            }
          }
          return prop;
        })
      );

      const inserted = await db.insert(properties).values(enrichedProperties).returning();
      res.json({ count: inserted.length, properties: inserted });
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
