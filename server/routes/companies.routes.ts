import { Router } from "express";
import { db } from "server/storage";
import { companies } from "@database/schemas/companies.schema";
import { properties, addresses, propertyTransactions } from "@database/schemas/properties.schema";
import { updateCompanySchema } from "@database/updates/companies.update";
import { requireRole } from "server/middleware/requireRole";
import { sql, eq, or, and, gte, lte, inArray } from "drizzle-orm";
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

const CONTACTS_PAGE_SIZE = 50;
const CONTACTS_SORT_OPTIONS = [
    "alphabetical",
    "most-properties",
    "fewest-properties",
    "most-sold-properties",
    "most-sold-properties-all-time",
    "new-buyers",
] as const;
type ContactsSortOption = (typeof CONTACTS_SORT_OPTIONS)[number];

// Get all companies with property counts (paginated, sortable, searchable)
router.get("/contacts", async (req, res) => {
    try {
        const { county, page = "1", limit = String(CONTACTS_PAGE_SIZE), sort = "most-properties", search } = req.query;
        const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10) || CONTACTS_PAGE_SIZE));
        const sortOption = (CONTACTS_SORT_OPTIONS as readonly string[]).includes(String(sort))
            ? (sort as ContactsSortOption)
            : "most-properties";
        const searchTerm = typeof search === "string" ? search.trim() : "";

        // Get all companies (filtered by county if provided, and by search if provided)
        const conditions: ReturnType<typeof sql>[] = [];
        if (county) {
            const normalizedCounty = county.toString().trim().toLowerCase();
            conditions.push(sql`LOWER(${companies.counties}::text) LIKE ${'%"' + normalizedCounty + '"%'}`);
        }
        if (searchTerm.length >= 2) {
            const searchPattern = `%${searchTerm.toLowerCase()}%`;
            conditions.push(
                or(
                    sql`LOWER(TRIM(${companies.companyName})) LIKE ${searchPattern}`,
                    sql`LOWER(TRIM(COALESCE(${companies.contactName}, ''))) LIKE ${searchPattern}`,
                    sql`LOWER(TRIM(COALESCE(${companies.contactEmail}, ''))) LIKE ${searchPattern}`
                ) as any
            );
        }
        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
        const contactsQuery = whereClause
            ? db.select().from(companies).where(whereClause as any)
            : db.select().from(companies);
        const contacts = await contactsQuery.orderBy(companies.companyName);

        // Property count per buyer (one aggregated query instead of loading all property rows)
        const normalizedCountyForProps = county ? (county as string).toString().trim().toLowerCase() : null;
        let propertyCountQuery = db
            .select({
                buyerId: properties.buyerId,
                count: sql<number>`count(*)::int`,
            })
            .from(properties)
            .leftJoin(addresses, eq(properties.id, addresses.propertyId));
        if (normalizedCountyForProps) {
            propertyCountQuery = propertyCountQuery.where(
                or(
                    sql`LOWER(TRIM(${properties.county})) = ${normalizedCountyForProps}`,
                    sql`LOWER(TRIM(${addresses.county})) = ${normalizedCountyForProps}`
                ) as any
            ) as any;
        }
        const propertyCountRows = await propertyCountQuery.groupBy(properties.buyerId);
        const propertyCountByBuyerId = new Map<string, number>();
        propertyCountRows.forEach((row) => {
            if (row.buyerId) propertyCountByBuyerId.set(row.buyerId, row.count);
        });

        // YTD: Jan 1 of current year through today
        const now = new Date();
        const ytdStartStr = `${now.getFullYear()}-01-01`;
        const todayStr = now.toISOString().slice(0, 10);

        const soldCountRows = await db
            .select({
                sellerId: propertyTransactions.sellerId,
                count: sql<number>`count(*)::int`,
            })
            .from(propertyTransactions)
            .where(
                and(
                    gte(propertyTransactions.recordingDate, ytdStartStr),
                    lte(propertyTransactions.recordingDate, todayStr)
                )
            )
            .groupBy(propertyTransactions.sellerId);
        const soldCountByCompanyId = new Map<string, number>();
        soldCountRows.forEach((row) => {
            if (row.sellerId) soldCountByCompanyId.set(row.sellerId, row.count);
        });

        const soldCountAllTimeRows = await db
            .select({
                sellerId: propertyTransactions.sellerId,
                count: sql<number>`count(*)::int`,
            })
            .from(propertyTransactions)
            .groupBy(propertyTransactions.sellerId);
        const soldCountAllTimeByCompanyId = new Map<string, number>();
        soldCountAllTimeRows.forEach((row) => {
            if (row.sellerId) soldCountAllTimeByCompanyId.set(row.sellerId, row.count);
        });

        const contactsWithCounts = contacts.map((contact) => {
            const propertyCount = propertyCountByBuyerId.get(contact.id) ?? 0;
            const propertiesSoldCount = soldCountByCompanyId.get(contact.id) ?? 0;
            const propertiesSoldCountAllTime = soldCountAllTimeByCompanyId.get(contact.id) ?? 0;
            return {
                ...contact,
                propertyCount,
                propertiesSoldCount,
                propertiesSoldCountAllTime,
            };
        });

        // Sort
        contactsWithCounts.sort((a, b) => {
            switch (sortOption) {
                case "alphabetical":
                    return (a.companyName ?? "").localeCompare(b.companyName ?? "");
                case "most-properties":
                    return b.propertyCount - a.propertyCount;
                case "fewest-properties":
                    return a.propertyCount - b.propertyCount;
                case "most-sold-properties":
                    return (b.propertiesSoldCount ?? 0) - (a.propertiesSoldCount ?? 0);
                case "most-sold-properties-all-time":
                    return (b.propertiesSoldCountAllTime ?? 0) - (a.propertiesSoldCountAllTime ?? 0);
                case "new-buyers":
                    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                    return bTime - aTime;
                default:
                    return 0;
            }
        });

        const total = contactsWithCounts.length;
        const offset = (pageNum - 1) * limitNum;
        const companiesPage = contactsWithCounts.slice(offset, offset + limitNum);

        console.log(`Companies (county: ${county || "all"}, page: ${pageNum}, sort: ${sortOption}):`, companiesPage.length, "/", total);
        res.json({
            companies: companiesPage,
            total,
            page: pageNum,
            limit: limitNum,
        });
    } catch (error) {
        console.error("Error fetching companies:", error);
        res.status(500).json({ message: "Error fetching companies" });
    }
});

// Get top 3 wholesalers (companies with most properties where status = 'wholesale', counted by seller_id)
// Optional query: county (e.g. "San Diego") - filters by properties.county or addresses.county
router.get("/wholesale-leaderboard", async (req, res) => {
    try {
        const countyParam = req.query.county?.toString()?.trim();
        const normalizedCounty = countyParam ? countyParam.toLowerCase() : null;

        const countRows = await db
            .select({
                sellerId: properties.sellerId,
                count: sql<number>`count(*)::int`,
            })
            .from(properties)
            .leftJoin(addresses, eq(properties.id, addresses.propertyId))
            .where(
                normalizedCounty
                    ? and(
                          eq(properties.status, "wholesale"),
                          or(
                              sql`LOWER(TRIM(${properties.county})) = ${normalizedCounty}`,
                              sql`LOWER(TRIM(${addresses.county})) = ${normalizedCounty}`
                          )
                      )
                    : eq(properties.status, "wholesale")
            )
            .groupBy(properties.sellerId)
            .orderBy(sql`count(*) desc`)
            .limit(3);

        if (countRows.length === 0) {
            return res.json([]);
        }

        const sellerIds = countRows.map((r) => r.sellerId).filter(Boolean) as string[];
        const companyRows = await db
            .select({
                id: companies.id,
                companyName: companies.companyName,
            })
            .from(companies)
            .where(inArray(companies.id, sellerIds));

        const companyById = new Map(companyRows.map((c) => [c.id, c]));
        const result = countRows
            .map((row, index) => {
                const company = row.sellerId ? companyById.get(row.sellerId) : null;
                if (!company) return null;
                return {
                    rank: index + 1,
                    companyId: company.id,
                    companyName: company.companyName,
                    wholesaleCount: row.count,
                };
            })
            .filter(Boolean);

        res.json(result);
    } catch (error) {
        console.error("Error fetching wholesale leaderboard:", error);
        res.status(500).json({ message: "Error fetching wholesale leaderboard" });
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
                    gte(propertyTransactions.recordingDate, ytdStartStr),
                    lte(propertyTransactions.recordingDate, todayStr)
                )
            );

        const propertiesSoldCount = sellerCountResult?.count ?? 0;

        // Count properties sold all-time (no date filter)
        const [sellerCountAllTimeResult] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(propertyTransactions)
            .where(eq(propertyTransactions.sellerId, id));

        const propertiesSoldCountAllTime = sellerCountAllTimeResult?.count ?? 0;

        // Count properties where this company is the buyer (for directory card)
        const [propertyCountResult] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(properties)
            .where(eq(properties.buyerId, id));
        const propertyCount = propertyCountResult?.count ?? 0;

        // 90-day acquisition: all property_transactions where this company is buyer_id in the last 90 days
        const ninetyDaysAgo = new Date(now);
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const ninetyDaysAgoStr = ninetyDaysAgo.toISOString().slice(0, 10);

        const acquisitions90Day = await db
            .select({ recordingDate: propertyTransactions.recordingDate })
            .from(propertyTransactions)
            .where(
                and(
                    eq(propertyTransactions.buyerId, id),
                    gte(propertyTransactions.recordingDate, ninetyDaysAgoStr),
                    lte(propertyTransactions.recordingDate, todayStr)
                )
            );

        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        // Month buckets for the full 90-day window (may span 3–4 calendar months)
        const months: { key: string; count: number }[] = [];
        const cursor = new Date(ninetyDaysAgo.getFullYear(), ninetyDaysAgo.getMonth(), 1);
        const endMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        while (cursor <= endMonth) {
            months.push({ key: monthNames[cursor.getMonth()], count: 0 });
            cursor.setMonth(cursor.getMonth() + 1);
        }

        acquisitions90Day.forEach((row) => {
            const raw = row.recordingDate as string | Date | null;
            const dateStr = typeof raw === "string" ? raw : raw instanceof Date ? raw.toISOString().slice(0, 10) : null;
            if (dateStr) {
                const [, m] = dateStr.split("-").map(Number);
                const monthKey = monthNames[m - 1];
                const existing = months.find((mo) => mo.key === monthKey);
                if (existing) existing.count++;
            }
        });

        const acquisition90DayTotal = acquisitions90Day.length;
        const acquisition90DayByMonth = months;

        res.json({
            ...result,
            propertyCount,
            propertiesSoldCount,
            propertiesSoldCountAllTime,
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
router.patch("/:id", requireRole(["admin", "owner"]), async (req, res) => {
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