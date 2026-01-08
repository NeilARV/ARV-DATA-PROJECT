import { Router } from "express";
import { db } from "server/storage";
import { companyContacts, properties, updateCompanyContactSchema } from "@shared/schema";
import { requireAdminAuth } from "server/middleware/requireAdminAuth";
import { sql, and, eq } from "drizzle-orm";

const router = Router();

// Get all company contacts with property counts
router.get("/contacts", async (req, res) => {
    try {
        const { county } = req.query;

        // Get all company contacts (filtered by county if provided)
        let contactsQuery = db.select().from(companyContacts);
        
        if (county) {
            const normalizedCounty = county.toString().trim().toLowerCase();
            contactsQuery = contactsQuery.where(
                sql`LOWER(${companyContacts.counties}::text) LIKE ${'%"' + normalizedCounty + '"%'}`
            ) as any;
        }
        
        const contacts = await contactsQuery.orderBy(companyContacts.companyName);

        // Get all properties (filtered by county if provided) - only need propertyOwner for counting
        let propertiesQuery = db.select({
            propertyOwner: properties.propertyOwner,
            county: properties.county,
        }).from(properties);
        
        if (county) {
            const normalizedCounty = county.toString().trim().toLowerCase();
            propertiesQuery = propertiesQuery.where(
                sql`LOWER(TRIM(${properties.county})) = ${normalizedCounty}`
            ) as any;
        }
        
        const allProperties = await propertiesQuery;

        // Calculate property count for each company
        const contactsWithCounts = contacts.map(contact => {
            const companyNameNormalized = contact.companyName.trim().toLowerCase();
            
            // Filter properties for this company (case-insensitive)
            const companyProperties = allProperties.filter(p => {
                const ownerName = (p.propertyOwner ?? "").trim().toLowerCase();
                return ownerName === companyNameNormalized;
            });
            
            const propertyCount = companyProperties.length;
            
            return {
                ...contact,
                propertyCount,
            };
        });

        console.log(`Company contacts (county: ${county || 'all'}):`, contactsWithCounts.length);
        res.json(contactsWithCounts);
        
    } catch (error) {
        console.error("Error fetching company contacts:", error);
        res.status(500).json({ message: "Error fetching company contacts" });
    }
});

// Get a single company contact by ID
router.get("/contacts/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const contact = await db
            .select()
            .from(companyContacts)
            .where(eq(companyContacts.id, id))
            .limit(1);

        if (contact.length === 0) {
            return res.status(404).json({ 
                message: "Company contact not found" 
            });
        }

        const result = contact[0]

        res.json(result);

    } catch (error) {
        console.error("Error fetching company contact:", error);
        res.status(500).json({ 
            message: "Error fetching company contact",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
});

// Update company contact (admin only)
router.patch("/contacts/:id", requireAdminAuth, async (req, res) => {
    try {
        const { id } = req.params;

        // Validate request body
        const validation = updateCompanyContactSchema.safeParse(req.body);
        
        if (!validation.success) {
            console.error("Validation errors:", validation.error.errors);
            return res.status(400).json({
                message: "Invalid update data",
                errors: validation.error.errors,
            });
        }

        const updateData = validation.data;

        // Check if company contact exists
        const existingContact = await db
            .select()
            .from(companyContacts)
            .where(eq(companyContacts.id, id))
            .limit(1);

        if (existingContact.length === 0) {
            return res.status(404).json({ 
                message: "Company contact not found" 
            });
        }

        // If companyName is being updated, check for uniqueness
        if (updateData.companyName && updateData.companyName !== existingContact[0].companyName) {
            const duplicateCheck = await db
                .select()
                .from(companyContacts)
                .where(eq(companyContacts.companyName, updateData.companyName))
                .limit(1);

            if (duplicateCheck.length > 0) {
                return res.status(409).json({ 
                    message: "A company contact with this name already exists" 
                });
            }
        }

        // Build update object (only include fields that are being updated)
        const updateFields: any = {};
        if (updateData.contactName !== undefined) {
            updateFields.contactName = updateData.contactName;
        }
        if (updateData.contactEmail !== undefined) {
            updateFields.contactEmail = updateData.contactEmail;
        }
        if (updateData.counties !== undefined) {
            updateFields.counties = updateData.counties;
        }
        if (updateData.companyName !== undefined) {
            updateFields.companyName = updateData.companyName;
        }

        // Check if there are any fields to update
        if (Object.keys(updateFields).length === 0) {
            return res.status(400).json({ 
                message: "No fields provided to update" 
            });
        }

        // Always update the updatedAt timestamp
        updateFields.updatedAt = new Date();

        // Update the contact
        const [updatedContact] = await db
            .update(companyContacts)
            .set(updateFields)
            .where(eq(companyContacts.id, id))
            .returning();

        console.log(`Updated company contact: ${updatedContact.companyName} (ID: ${id})`);

        res.json(updatedContact);

    } catch (error) {
        console.error("Error updating company contact:", error);
        res.status(500).json({ 
            message: "Error updating company contact",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
});

// Get leaderboard stats (top 10 companies and top 10 zip codes for San Diego county)
router.get("/leaderboard", async (req, res) => {
    try {
        // Filter to San Diego county only
        const normalizedCounty = "san diego";
        
        // Get all properties in San Diego county (only need propertyOwner and zipCode)
        const allProperties = await db.select({
            propertyOwner: properties.propertyOwner,
            zipCode: properties.zipCode,
        })
        .from(properties)
        .where(
            sql`LOWER(TRIM(${properties.county})) = ${normalizedCounty}`
        ) as any;

        // Calculate company counts
        const companyCounts: Record<string, number> = {};
        allProperties.forEach((p: { propertyOwner: string | null }) => {
            const owner = (p.propertyOwner || "Unknown").trim();
            companyCounts[owner] = (companyCounts[owner] || 0) + 1;
        });

        // Get top 10 companies
        const topCompanies = Object.entries(companyCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([name, count], index) => ({
                rank: index + 1,
                name,
                count,
            }));

        // Calculate zip code counts
        const zipCounts: Record<string, number> = {};
        allProperties.forEach((p: { zipCode: string | null }) => {
            const zip = (p.zipCode || "Unknown").trim();
            zipCounts[zip] = (zipCounts[zip] || 0) + 1;
        });

        // Get top 10 zip codes
        const topZipCodes = Object.entries(zipCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([zipCode, count], index) => ({
                rank: index + 1,
                zipCode,
                count,
            }));

        res.json({
            companies: topCompanies,
            zipCodes: topZipCodes,
        });
        
    } catch (error) {
        console.error("Error fetching leaderboard:", error);
        res.status(500).json({ message: "Error fetching leaderboard" });
    }
});

export default router