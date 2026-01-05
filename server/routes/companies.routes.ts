import { Router } from "express";
import { db } from "server/storage";
import { companyContacts } from "@shared/schema";
import { sql } from "drizzle-orm";

const router = Router();

// Get all company contacts
router.get("/contacts", async (req, res) => {
    try {
        const { county } = req.query;

        if (!county) {
            // If no county filter, return all contacts
        const allContacts = await db
            .select()
            .from(companyContacts)
            .orderBy(companyContacts.companyName);
            
            console.log("Company contacts (all):", allContacts.length);
            return res.json(allContacts);
        }

        // Filter by county - check if the county is in the JSON array
        const normalizedCounty = county.toString().trim().toLowerCase();
        
        // Use JSON containment operator to check if county exists in the counties array
        // PostgreSQL: counties::jsonb @> '["San Diego"]'::jsonb
        const filteredContacts = await db
            .select()
            .from(companyContacts)
            .where(
                sql`LOWER(${companyContacts.counties}::text) LIKE ${'%"' + normalizedCounty + '"%'}`
            )
            .orderBy(companyContacts.companyName);

        console.log(`Company contacts (county: ${county}):`, filteredContacts.length);
        res.json(filteredContacts);
        
    } catch (error) {
        console.error("Error fetching company contacts:", error);
        res.status(500).json({ message: "Error fetching company contacts" });
    }
});

export default router