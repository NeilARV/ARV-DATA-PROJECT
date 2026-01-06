import { Router } from "express";
import { db } from "server/storage";
import { companyContacts, properties } from "@shared/schema";
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

export default router