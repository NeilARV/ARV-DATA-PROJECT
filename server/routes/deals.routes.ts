import { Router } from "express";
import { db } from "server/storage";
import { deals } from "@database/schemas/deals.schema";
import { properties, addresses, structures, lastSales, propertyTransactions } from "@database/schemas/properties.schema";
import { users, userRoles, roles } from "@database/schemas/users.schema";
import { msas } from "@database/schemas/msas.schema";
import { batchLookup } from "server/jobs/data_v2/processes/batch-lookup";
import { getTransactions } from "server/jobs/data_v2/processes/get-transactions";
import { cleanTransactions } from "server/jobs/data_v2/processes/clean-transactions";
import { insertCompanies } from "server/jobs/data_v2/processes/insert-companies";
import { resolvePropertyIds } from "server/jobs/data_v2/processes/resolve-ids";
import { resolveStatuses } from "server/jobs/data_v2/processes/resolve-status";
import { cleanBeforeInsert } from "server/jobs/data_v2/processes/clean-before-insert";
import { insertProperties } from "server/jobs/data_v2/processes/insert-properties";
import { eq, desc, and, ilike, inArray } from "drizzle-orm";
import { requireRole } from "server/middleware/requireRole";
import dotenv from "dotenv";

dotenv.config();

const router = Router();

// GET /api/deals — fetch all deals, newest first, with property address and poster info
// Optional ?userId=<uuid> to return only deals posted by that user
router.get("/", async (req, res) => {
    try {
        const filterUserId = typeof req.query.userId === "string" ? req.query.userId : undefined;
        const filterMsaName = typeof req.query.msaName === "string" ? req.query.msaName : undefined;

        // Resolve msaId from name so we filter on deals.msaId (primary table column)
        let filterMsaId: number | undefined;
        if (filterMsaName) {
            const [msaRow] = await db
                .select({ id: msas.id })
                .from(msas)
                .where(eq(msas.name, filterMsaName))
                .limit(1);
            if (!msaRow) {
                console.log(`[GET /api/deals] MSA not found: "${filterMsaName}" — returning empty`);
                return res.json([]);
            }
            filterMsaId = msaRow.id;
        }

        const whereClause = filterUserId && filterMsaId !== undefined
            ? and(eq(deals.userId, filterUserId), eq(deals.msaId, filterMsaId))
            : filterUserId
            ? eq(deals.userId, filterUserId)
            : filterMsaId !== undefined
            ? eq(deals.msaId, filterMsaId)
            : undefined;

        const results = await db
            .select({
                id:        deals.id,
                createdAt: deals.createdAt,
                // Property info
                propertyId:    deals.propertyId,
                address:       addresses.formattedStreetAddress,
                city:          addresses.city,
                state:         addresses.state,
                zipCode:       addresses.zipCode,
                propertyType:  properties.propertyType,
                listingStatus: properties.listingStatus,
                // Structure info
                bedrooms:   structures.bedsCount,
                bathrooms:  structures.baths,
                squareFeet: structures.livingAreaSqft,
                yearBuilt:  structures.yearBuilt,
                // Last sale
                price:    lastSales.price,
                // MSA info
                msaId:   deals.msaId,
                msaName: msas.name,
                // Poster info
                userId:        deals.userId,
                userEmail:     users.email,
            })
            .from(deals)
            .leftJoin(properties, eq(deals.propertyId, properties.id))
            .leftJoin(addresses, eq(deals.propertyId, addresses.propertyId))
            .leftJoin(structures, eq(deals.propertyId, structures.propertyId))
            .leftJoin(lastSales, eq(deals.propertyId, lastSales.propertyId))
            .leftJoin(msas, eq(deals.msaId, msas.id))
            .leftJoin(users, eq(deals.userId, users.id))
            .where(whereClause)
            .orderBy(desc(deals.id));

        console.log(`[GET /api/deals] ${results.length} deals returned${filterUserId ? ` (userId=${filterUserId})` : ""}${filterMsaName ? ` (msaName=${filterMsaName})` : ""}`);

        res.json(results);
    } catch (error) {
        console.error("[GET /api/deals]", error);
        res.status(500).json({ message: "Error fetching deals" });
    }
});

// POST /api/deals — run full consumer pipeline for a single address, then post a deal
router.post("/", requireRole(["pro", "relationship-manager", "admin", "owner"]), async (req, res) => {
    try {
        const { address, city, state, zipCode, userId } = req.body;

        const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!address || !city || !state || !zipCode || !userId) {
            return res.status(400).json({
                message: "Missing required fields",
                errors: [{ path: [], message: "address, city, state, zipCode, and userId are required" }],
            });
        }
        
        if (!UUID_REGEX.test(userId)) {
            return res.status(400).json({ message: "Invalid userId — must be a valid UUID" });
        }

        const API_KEY = process.env.SFR_API_KEY;
        const API_URL = process.env.SFR_API_URL;

        if (!API_KEY || !API_URL) {
            return res.status(500).json({ message: "SFR API not configured" });
        }

        const label = "[POST /api/deals]";

        // Build a single-item BuyersMarketRecord for the pipeline
        const record = { address, city, state, zipCode };

        // ── Step 1: Batch lookup (single property via /properties/batch) ──────
        console.log(`${label} Batch lookup: ${address}, ${city}, ${state} ${zipCode}`);
        const mergedProperties = await batchLookup({
            records: [record],
            API_KEY,
            API_URL,
            cityCode: "DEAL",
        });

        if (mergedProperties.length === 0 || mergedProperties[0].error || !mergedProperties[0].property) {
            return res.status(404).json({ message: "Property not found or could not be looked up" });
        }

        const merged = mergedProperties[0];
        const propertyData = merged.property as Record<string, unknown>;
        const sfrPropertyId = Number(propertyData.property_id ?? 0);

        if (!sfrPropertyId) {
            return res.status(404).json({ message: "SFR property ID missing from API response" });
        }

        // ── Derive MSA from property data ─────────────────────────────────────
        const msaName = (propertyData.msa as string | undefined)?.trim() ?? null;
        if (!msaName) {
            return res.status(422).json({ message: "Could not determine MSA for this property" });
        }

        const [msaRow] = await db
            .select()
            .from(msas)
            .where(eq(msas.name, msaName))
            .limit(1);

        if (!msaRow) {
            return res.status(422).json({
                message: `MSA "${msaName}" is not tracked in this system`,
            });
        }

        // ── Check if property already exists — skip full pipeline if so ────────
        const [existingProperty] = await db
            .select({ id: properties.id })
            .from(properties)
            .where(eq(properties.sfrPropertyId, sfrPropertyId))
            .limit(1);

        let propertyId: string;

        if (existingProperty) {
            console.log(`${label} Property ${sfrPropertyId} already exists (id=${existingProperty.id}), skipping pipeline`);
            propertyId = existingProperty.id;
        } else {
            // ── Step 2: Get transactions ──────────────────────────────────────
            console.log(`${label} Fetching transactions for property ${sfrPropertyId}`);
            const propertiesWithTransactions = await getTransactions({
                properties: mergedProperties,
                API_KEY,
                API_URL,
                cityCode: "DEAL",
            });

            // ── Step 3: Clean transactions ────────────────────────────────────
            const transactionCompanies = cleanTransactions(propertiesWithTransactions, msaName);

            // ── Step 4: Insert/update companies ──────────────────────────────
            await insertCompanies({
                companyNames: transactionCompanies.companyNames,
                msa: msaName,
                cityCode: "DEAL",
                companyCounties: transactionCompanies.companyCounties,
            });

            // ── Step 5: Resolve buyer_id / seller_id ─────────────────────────
            const propertiesWithIds = await resolvePropertyIds({
                properties: propertiesWithTransactions,
                cityCode: "DEAL",
            });

            // ── Step 6: Determine property status ─────────────────────────────
            const propertiesWithStatus = resolveStatuses(propertiesWithIds, msaName);

            // ── Step 7: Final normalization ───────────────────────────────────
            const propertiesToInsert = cleanBeforeInsert(propertiesWithStatus);

            if (propertiesToInsert.length === 0) {
                return res.status(422).json({ message: "Property could not be processed (status unresolvable)" });
            }

            // ── Step 8: Upsert property + child tables + transactions ─────────
            console.log(`${label} Inserting property ${sfrPropertyId}`);
            await insertProperties({
                properties: propertiesToInsert,
                msa: msaName,
                cityCode: "DEAL",
            });

            // ── Resolve internal property UUID ────────────────────────────────
            const [newPropertyRow] = await db
                .select({ id: properties.id })
                .from(properties)
                .where(eq(properties.sfrPropertyId, sfrPropertyId))
                .limit(1);

            if (!newPropertyRow) {
                return res.status(500).json({ message: "Property was processed but could not be found in database" });
            }

            propertyId = newPropertyRow.id;
        }

        // ── Backfill lastSales from transactions if batch had no last_sale ─────
        // SFR's /properties/batch sometimes omits last_sale for recently sold or
        // individual-owner properties. When that happens insertProperties leaves
        // lastSales empty, but the arms-length transaction is still in
        // propertyTransactions. Use the most recent one to populate lastSales so
        // the deal card can display the price and date.
        const [existingLastSale] = await db
            .select({ id: lastSales.lastSalesId })
            .from(lastSales)
            .where(eq(lastSales.propertyId, propertyId))
            .limit(1);

        if (!existingLastSale) {
            const [recentTx] = await db
                .select()
                .from(propertyTransactions)
                .where(
                    and(
                        eq(propertyTransactions.propertyId, propertyId),
                        ilike(propertyTransactions.transactionType, "arms length")
                    )
                )
                .orderBy(desc(propertyTransactions.recordingDate))
                .limit(1);

            if (recentTx) {
                await db
                    .insert(lastSales)
                    .values({
                        propertyId,
                        saleDate: recentTx.saleDate,
                        recordingDate: recentTx.recordingDate,
                        price: recentTx.salePrice,
                    })
                    .onConflictDoNothing();
                console.log(`${label} Backfilled lastSales from most recent arms-length transaction for property ${propertyId}`);
            }
        }

        // ── Step 9: Insert the deal ───────────────────────────────────────────
        const [deal] = await db
            .insert(deals)
            .values({
                propertyId,
                userId,
                msaId: msaRow.id,
            })
            .returning();

        console.log(`${label} Deal posted: id=${deal.id}, property=${propertyId}, msa=${msaName}`);
        res.status(201).json({ message: "Deal posted successfully", deal });
    } catch (error) {
        console.error("[POST /api/deals]", error);
        res.status(500).json({
            message: "Error posting deal",
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
});

// DELETE /api/deals/:id — pro can delete their own deals; admin/owner can delete any deal
router.delete("/:id", requireRole(["pro", "admin", "owner"]), async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ message: "Invalid deal id" });
        }

        // Fetch the deal first so we can check ownership
        const [deal] = await db
            .select({ id: deals.id, userId: deals.userId })
            .from(deals)
            .where(eq(deals.id, id))
            .limit(1);

        if (!deal) {
            return res.status(404).json({ message: "Deal not found" });
        }

        // Check if the caller is admin or owner — if not, enforce ownership
        const callerIsPrivileged = await db
            .select({ roleName: roles.name })
            .from(userRoles)
            .innerJoin(roles, eq(userRoles.roleId, roles.id))
            .where(
                and(
                    eq(userRoles.userId, req.session.userId!),
                    inArray(roles.name, ["admin", "owner"])
                )
            )
            .limit(1);

        if (callerIsPrivileged.length === 0 && deal.userId !== req.session.userId) {
            return res.status(403).json({ message: "You can only delete your own deals" });
        }

        await db.delete(deals).where(eq(deals.id, id));

        res.json({ message: "Deal deleted successfully", id: deal.id });
    } catch (error) {
        console.error("[DELETE /api/deals]", error);
        res.status(500).json({ message: "Error deleting deal" });
    }
});

export default router;
