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