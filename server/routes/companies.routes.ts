import { Router } from "express";
import { db } from "server/storage";
import { companies } from "../../database/schemas/companies.schema";
import { properties, addresses, propertyTransactions } from "../../database/schemas/properties.schema";
import { updateCompanySchema } from "../../database/updates/companies.update";
import { requireAdminAuth } from "server/middleware/requireAdminAuth";
import { sql, eq, or, and, gte, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

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

        // Get all properties (filtered by county if provided) - use buyer_id/seller_id for counting
        // Need to check both properties.county and addresses.county for county filtering
        let propertiesQuery = db
            .select({
                buyerId: properties.buyerId,
                sellerId: properties.sellerId,
                county: sql<string>`COALESCE(${properties.county}, ${addresses.county}, '')`,
            })
            .from(properties)
            .leftJoin(addresses, eq(properties.id, addresses.propertyId));
        
        if (county) {
            const normalizedCounty = county.toString().trim().toLowerCase();
            propertiesQuery = propertiesQuery.where(
                or(
                    sql`LOWER(TRIM(${properties.county})) = ${normalizedCounty}`,
                    sql`LOWER(TRIM(${addresses.county})) = ${normalizedCounty}`
                ) as any
            ) as any;
        }
        
        const allProperties = await propertiesQuery;

        // YTD: Jan 1 of current year through today
        const now = new Date();
        const ytdStartStr = `${now.getFullYear()}-01-01`;
        const todayStr = now.toISOString().slice(0, 10);

        // Sold count per company YTD (property_transactions where company is seller, transaction_date in current year)
        const soldCountRows = await db
            .select({
                sellerId: propertyTransactions.sellerId,
                count: sql<number>`count(*)::int`,
            })
            .from(propertyTransactions)
            .where(
                and(
                    gte(propertyTransactions.transactionDate, ytdStartStr),
                    lte(propertyTransactions.transactionDate, todayStr)
                )
            )
            .groupBy(propertyTransactions.sellerId);
        const soldCountByCompanyId = new Map<string, number>();
        soldCountRows.forEach((row) => {
            if (row.sellerId) soldCountByCompanyId.set(row.sellerId, row.count);
        });

        // Calculate property count and propertiesSoldCount for each company
        const contactsWithCounts = contacts.map(contact => {
            const companyProperties = allProperties.filter(p => {
                return p.buyerId === contact.id
            });
            const propertyCount = companyProperties.length;
            const propertiesSoldCount = soldCountByCompanyId.get(contact.id) ?? 0;
            return {
                ...contact,
                propertyCount,
                propertiesSoldCount,
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
        
        // Get all properties in the specified county with company info (buyer or seller)
        const buyerCompanies = alias(companies, "buyer_companies");
        const sellerCompanies = alias(companies, "seller_companies");
        const allProperties = await db
            .select({
                buyerCompanyName: buyerCompanies.companyName,
                buyerContactName: buyerCompanies.contactName,
                sellerCompanyName: sellerCompanies.companyName,
                sellerContactName: sellerCompanies.contactName,
            })
            .from(properties)
            .leftJoin(buyerCompanies, eq(properties.buyerId, buyerCompanies.id))
            .leftJoin(sellerCompanies, eq(properties.sellerId, sellerCompanies.id))
            .leftJoin(addresses, eq(properties.id, addresses.propertyId))
            .where(
                or(
                    sql`LOWER(TRIM(${properties.county})) = ${normalizedCounty}`,
                    sql`LOWER(TRIM(${addresses.county})) = ${normalizedCounty}`
                ) as any
            ) as any;

        // Count each property for both buyer and seller companies (when they are companies)
        const companyCounts: Record<string, number> = {};
        const companyContactNames: Record<string, string | null> = {};
        type Prop = { buyerCompanyName: string | null; buyerContactName: string | null; sellerCompanyName: string | null; sellerContactName: string | null };
        allProperties.forEach((p: Prop) => {
            const addCompany = (name: string | null, contact: string | null) => {
                if (name) {
                    const companyName = name.trim();
                    companyCounts[companyName] = (companyCounts[companyName] || 0) + 1;
                    if (contact && !companyContactNames[companyName]) {
                        companyContactNames[companyName] = contact.trim();
                    } else if (!(companyName in companyContactNames)) {
                        companyContactNames[companyName] = null;
                    }
                }
            };
            addCompany(p.buyerCompanyName, p.buyerContactName);
            if (p.sellerCompanyName !== p.buyerCompanyName) {
                addCompany(p.sellerCompanyName, p.sellerContactName);
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

// Get a single company by ID (includes propertiesSoldCount from property_transactions)
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

        const result = contact[0];

        // YTD: Jan 1 of current year through today
        const now = new Date();
        const ytdStartStr = `${now.getFullYear()}-01-01`;
        const todayStr = now.toISOString().slice(0, 10);

        // Count properties sold YTD where this company is the seller in property_transactions
        const [sellerCountResult] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(propertyTransactions)
            .where(
                and(
                    eq(propertyTransactions.sellerId, id),
                    gte(propertyTransactions.transactionDate, ytdStartStr),
                    lte(propertyTransactions.transactionDate, todayStr)
                )
            );

        const propertiesSoldCount = sellerCountResult?.count ?? 0;

        // 90-day acquisition activity: properties where company is buyer_id in last 90 days
        const ninetyDaysAgo = new Date(now);
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const ninetyDaysAgoStr = ninetyDaysAgo.toISOString().slice(0, 10);

        const acquisitions90Day = await db
            .select({ transactionDate: propertyTransactions.transactionDate })
            .from(propertyTransactions)
            .where(
                and(
                    eq(propertyTransactions.buyerId, id),
                    eq(propertyTransactions.transactionType, "acquisition"),
                    gte(propertyTransactions.transactionDate, ninetyDaysAgoStr),
                    lte(propertyTransactions.transactionDate, todayStr)
                )
            );

        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const months: { key: string; count: number }[] = [];
        for (let i = 2; i >= 0; i--) {
            const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
            months.push({ key: monthNames[monthDate.getMonth()], count: 0 });
        }

        acquisitions90Day.forEach((row) => {
            const dateStr = row.transactionDate;
            if (typeof dateStr === "string") {
                const [y, m] = dateStr.split("-").map(Number);
                const monthKey = monthNames[m - 1];
                const existing = months.find((m) => m.key === monthKey);
                if (existing) existing.count++;
            }
        });

        const acquisition90DayTotal = acquisitions90Day.length;
        const acquisition90DayByMonth = months;

        res.json({
            ...result,
            propertiesSoldCount,
            acquisition90DayTotal,
            acquisition90DayByMonth,
        });

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