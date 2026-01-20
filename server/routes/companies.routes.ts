import { Router } from "express";
import { db } from "server/storage";
import { companies } from "../../database/schemas/companies.schema";
import { properties, addresses } from "../../database/schemas/properties.schema";
import { updateCompanySchema } from "../../database/updates/companies.update";
import { requireAdminAuth } from "server/middleware/requireAdminAuth";
import { sql, and, eq } from "drizzle-orm";

const router = Router();

// Get company suggestions for autocomplete/search
router.get("/contacts/suggestions", async (req, res) => {
    try {
        const { search } = req.query;
        
        if (!search || search.toString().trim().length < 2) {
            return res.status(200).json([]);
        }

        const searchTerm = `%${search.toString().trim().toLowerCase()}%`;

        // Search company names that match the search term
        const results = await db
            .select({
                id: companies.id,
                companyName: companies.companyName,
                contactName: companies.contactName,
                contactEmail: companies.contactEmail,
            })
            .from(companies)
            .where(
                sql`LOWER(TRIM(${companies.companyName})) LIKE ${searchTerm}`
            )
            .orderBy(companies.companyName)
            .limit(5);

        res.status(200).json(results);

    } catch (error) {
        console.error("Error fetching company suggestions:", error);
        res.status(500).json({ message: "Error fetching company suggestions" });
    }
});

// Get all companies with property counts
router.get("/contacts", async (req, res) => {
    try {
        const { county } = req.query;

        // Get all companies (filtered by county if provided)
        let contactsQuery = db.select().from(companies);
        
        if (county) {
            const normalizedCounty = county.toString().trim().toLowerCase();
            contactsQuery = contactsQuery.where(
                sql`LOWER(${companies.counties}::text) LIKE ${'%"' + normalizedCounty + '"%'}`
            ) as any;
        }
        
        const contacts = await contactsQuery.orderBy(companies.companyName);

        // Get all properties (filtered by county if provided) - only need propertyOwnerId for counting
        let propertiesQuery = db.select({
            propertyOwnerId: properties.propertyOwnerId,
            county: properties.county,
        }).from(properties);
        
        if (county) {
            const normalizedCounty = county.toString().trim().toLowerCase();
            propertiesQuery = propertiesQuery.where(
                sql`LOWER(TRIM(${properties.county})) = ${normalizedCounty}`
            ) as any;
        }
        
        const allProperties = await propertiesQuery;

        // Calculate property count for each company using propertyOwnerId
        const contactsWithCounts = contacts.map(contact => {
            // Filter properties for this company by matching propertyOwnerId with company contact id
            const companyProperties = allProperties.filter(p => {
                return p.propertyOwnerId === contact.id;
            });
            
            const propertyCount = companyProperties.length;
            
            return {
                ...contact,
                propertyCount,
            };
        });

        console.log(`Companies (county: ${county || 'all'}):`, contactsWithCounts.length);
        res.json(contactsWithCounts);
        
    } catch (error) {
        console.error("Error fetching companies:", error);
        res.status(500).json({ message: "Error fetching companies" });
    }
});

// Get leaderboard stats (top 10 companies and top 10 zip codes for specified county)
router.get("/leaderboard", async (req, res) => {
    try {
        // Get county from query parameter, default to "San Diego" if not provided
        const countyParam = req.query.county?.toString() || "San Diego";
        const normalizedCounty = countyParam.trim().toLowerCase();
        
        // Get all properties in the specified county with company info (need propertyOwnerId, zipCode, companyName, and contactName)
        // Note: properties table now uses addresses table for address info, so we need to join addresses
        const allProperties = await db
            .select({
                propertyOwnerId: properties.propertyOwnerId,
                companyName: companies.companyName,
                contactName: companies.contactName,
            })
            .from(properties)
            .leftJoin(companies, eq(properties.propertyOwnerId, companies.id))
            .where(
                sql`LOWER(TRIM(${properties.county})) = ${normalizedCounty}`
            ) as any;

        // Calculate company counts and collect contact names using companyName from joined table
        const companyCounts: Record<string, number> = {};
        const companyContactNames: Record<string, string | null> = {};
        allProperties.forEach((p: { companyName: string | null; contactName: string | null }) => {
            if (p.companyName) {
                const companyName = p.companyName.trim();
                companyCounts[companyName] = (companyCounts[companyName] || 0) + 1;
                // Store contact name for this company (use first non-null contact name found)
                if (p.contactName && !companyContactNames[companyName]) {
                    companyContactNames[companyName] = p.contactName.trim();
                } else if (!(companyName in companyContactNames)) {
                    companyContactNames[companyName] = null;
                }
            }
        });

        // Get top 10 companies with contact names
        const topCompanies = Object.entries(companyCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([name, count], index) => ({
                rank: index + 1,
                name,
                count,
                contactName: companyContactNames[name] || null,
            }));

        // Calculate zip code counts - need to join addresses table for zip codes
        const propertiesWithAddresses = await db
            .select({
                zipCode: addresses.zipCode,
            })
            .from(properties)
            .leftJoin(addresses, eq(properties.id, addresses.propertyId))
            .where(
                sql`LOWER(TRIM(${properties.county})) = ${normalizedCounty}`
            );
        
        const zipCounts: Record<string, number> = {};
        propertiesWithAddresses.forEach((p: { zipCode: string | null }) => {
            if (p.zipCode) {
                const zip = (p.zipCode).trim();
                zipCounts[zip] = (zipCounts[zip] || 0) + 1;
            }
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

// Get a single company by ID
router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const contact = await db
            .select()
            .from(companies)
            .where(eq(companies.id, id))
            .limit(1);

        if (contact.length === 0) {
            return res.status(404).json({ 
                message: "Company contact not found" 
            });
        }

        const result = contact[0]

        res.json(result);

    } catch (error) {
        console.error("Error fetching company:", error);
        res.status(500).json({ 
            message: "Error fetching company",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
});

// Update company (admin only)
router.patch("/:id", requireAdminAuth, async (req, res) => {
    try {
        const { id } = req.params;

        // Validate request body
        const validation = updateCompanySchema.safeParse(req.body);
        
        if (!validation.success) {
            console.error("Validation errors:", validation.error.errors);
            return res.status(400).json({
                message: "Invalid update data",
                errors: validation.error.errors,
            });
        }

        const updateData = validation.data;

        // Check if company exists
        const existingContact = await db
            .select()
            .from(companies)
            .where(eq(companies.id, id))
            .limit(1);

        if (existingContact.length === 0) {
            return res.status(404).json({ 
                message: "Company not found" 
            });
        }

        // If companyName is being updated, check for uniqueness
        if (updateData.companyName && updateData.companyName !== existingContact[0].companyName) {
            const duplicateCheck = await db
                .select()
                .from(companies)
                .where(eq(companies.companyName, updateData.companyName))
                .limit(1);

            if (duplicateCheck.length > 0) {
                return res.status(409).json({ 
                    message: "A company with this name already exists" 
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
        if (updateData.phoneNumber !== undefined) {
            updateFields.phoneNumber = updateData.phoneNumber;
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

        // Update the company
        const [updatedContact] = await db
            .update(companies)
            .set(updateFields)
            .where(eq(companies.id, id))
            .returning();

        console.log(`Updated company: ${updatedContact.companyName} (ID: ${id})`);

        res.json(updatedContact);

    } catch (error) {
        console.error("Error updating company:", error);
        res.status(500).json({ 
            message: "Error updating company",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
});

export default router