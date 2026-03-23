import { Router } from "express";
import { db } from "server/storage";
import { deals } from "@database/schemas/deals.schema";
import { properties, addresses } from "@database/schemas/properties.schema";
import { users } from "@database/schemas/users.schema";
import { msas } from "@database/schemas/msas.schema";
import { batchLookup } from "server/jobs/data_v2/processes/batch-lookup";
import { getTransactions } from "server/jobs/data_v2/processes/get-transactions";
import { cleanTransactions } from "server/jobs/data_v2/processes/clean-transactions";
import { insertCompanies } from "server/jobs/data_v2/processes/insert-companies";
import { resolvePropertyIds } from "server/jobs/data_v2/processes/resolve-ids";
import { resolveStatuses } from "server/jobs/data_v2/processes/resolve-status";
import { cleanBeforeInsert } from "server/jobs/data_v2/processes/clean-before-insert";
import { insertProperties } from "server/jobs/data_v2/processes/insert-properties";
import { eq, desc } from "drizzle-orm";
import dotenv from "dotenv";

dotenv.config();

const router = Router();

// GET /api/deals — fetch all deals, newest first, with property address and poster info
router.get("/", async (req, res) => {
    try {
        const results = await db
            .select({
                id:        deals.id,
                createdAt: deals.createdAt,
                // Property info
                propertyId: deals.propertyId,
                address:    addresses.formattedStreetAddress,
                city:       addresses.city,
                state:      addresses.state,
                zipCode:    addresses.zipCode,
                // MSA info
                msaId:   deals.msaId,
                msaName: msas.name,
                // Poster info
                userId:        deals.userId,
                userEmail:     users.email,
                userFirstName: users.firstName,
                userLastName:  users.lastName,
            })
            .from(deals)
            .leftJoin(properties, eq(deals.propertyId, properties.id))
            .leftJoin(addresses, eq(deals.propertyId, addresses.propertyId))
            .leftJoin(msas, eq(deals.msaId, msas.id))
            .leftJoin(users, eq(deals.userId, users.id))
            .orderBy(desc(deals.id));

        res.json(results);
    } catch (error) {
        console.error("[GET /api/deals]", error);
        res.status(500).json({ message: "Error fetching deals" });
    }
});

// POST /api/deals — run full consumer pipeline for a single address, then post a deal
router.post("/", async (req, res) => {
    try {
        const { address, city, state, zipCode, userId } = req.body;

        if (!address || !city || !state || !zipCode || !userId) {
            return res.status(400).json({
                message: "Missing required fields",
                errors: [{ path: [], message: "address, city, state, zipCode, and userId are required" }],
            });
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

// DELETE /api/deals/:id — remove a deal by id
router.delete("/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ message: "Invalid deal id" });
        }

        const deleted = await db.delete(deals).where(eq(deals.id, id)).returning();

        if (deleted.length === 0) {
            return res.status(404).json({ message: "Deal not found" });
        }

        res.json({ message: "Deal deleted successfully", id: deleted[0].id });
    } catch (error) {
        console.error("[DELETE /api/deals]", error);
        res.status(500).json({ message: "Error deleting deal" });
    }
});

export default router;
