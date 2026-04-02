import { Router } from "express";
import { db } from "server/storage";
import { deals } from "@database/schemas/deals.schema";
import { properties } from "@database/schemas/properties.schema";
import { users, userRoles, roles } from "@database/schemas/users.schema";
import { msas, userMsaSubscriptions } from "@database/schemas/msas.schema";
import { batchLookup } from "server/jobs/data_v2/processes/batch-lookup";
import { resolveMsaId } from "server/utils/resolveMsa";
import { eq, desc, and, inArray } from "drizzle-orm";
import { requireRole } from "server/middleware/requireRole";
import { sendTemplateToUsers } from "server/services/postmark/email.services";
import dotenv from "dotenv";

dotenv.config();

const router = Router();

// GET /api/deals — fetch all deals newest first; fields are stored directly on deals
// Optional ?userId=<uuid> to return only deals posted by that user
// Optional ?msaName=<name> to filter by MSA (also includes deals with no msa_id)
router.get("/", async (req, res) => {
    try {
        const filterUserId = typeof req.query.userId === "string" ? req.query.userId : undefined;
        const filterMsaName = typeof req.query.msaName === "string" ? req.query.msaName : undefined;

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

        const msaCondition = filterMsaId !== undefined ? eq(deals.msaId, filterMsaId) : undefined;

        const whereClause = filterUserId && msaCondition
            ? and(eq(deals.userId, filterUserId), msaCondition)
            : filterUserId
            ? eq(deals.userId, filterUserId)
            : msaCondition;

        const results = await db
            .select({
                id:           deals.id,
                createdAt:    deals.createdAt,
                propertyId:   deals.propertyId,
                address:      deals.address,
                city:         deals.city,
                state:        deals.state,
                zipCode:      deals.zipCode,
                price:        deals.price,
                beds:         deals.beds,
                baths:        deals.baths,
                sqft:         deals.sqft,
                propertyType: deals.propertyType,
                msaId:        deals.msaId,
                msaName:      msas.name,
                type:         deals.type,
                userId:       deals.userId,
                userEmail:    users.email,
            })
            .from(deals)
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

// POST /api/deals — post a deal directly; no pipeline processing
// When a full address is provided, SFR is queried for property details (beds/baths/sqft/propertyType).
// When only city/state is provided, those details must be supplied manually.
router.post("/", requireRole(["pro", "relationship-manager", "admin", "owner"]), async (req, res) => {
    try {
        const {
            address, city, state, zipCode,
            userId, dealType, price,
            beds, baths, sqft, propertyType,
        } = req.body;

        const label = "[POST /api/deals]";

        // ── Basic validation ──────────────────────────────────────────────────
        const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!city || !state || !zipCode || !userId || price == null) {
            return res.status(400).json({
                message: "Missing required fields",
                errors: [{ path: [], message: "city, state, zipCode, userId, and price are required" }],
            });
        }
        if (!UUID_REGEX.test(userId)) {
            return res.status(400).json({ message: "Invalid userId — must be a valid UUID" });
        }
        if (Number(price) <= 0) {
            return res.status(400).json({ message: "Price must be greater than 0" });
        }

        const hasAddress = typeof address === "string" && address.trim().length > 0;

        // ── If no street address, manual property details are required ────────
        if (!hasAddress) {
            const missing: string[] = [];
            if (beds == null)        missing.push("beds");
            if (baths == null)       missing.push("baths");
            if (sqft == null)        missing.push("sqft");
            if (!propertyType)       missing.push("propertyType");
            if (missing.length > 0) {
                return res.status(400).json({
                    message: "beds, baths, sqft, and propertyType are required when no street address is provided",
                    errors: missing.map((f) => ({ path: [f], message: "Required" })),
                });
            }
        }

        const validDealTypes = ["wholesale", "agent", "sold"];
        const resolvedDealType = validDealTypes.includes(dealType) ? dealType : "agent";

        // ── Resolve MSA (always required) ────────────────────────────────────
        const msaId = await resolveMsaId(city, state, zipCode);
        if (!msaId) {
            return res.status(422).json({
                message: `Could not determine MSA for ${city}, ${state}${zipCode ? ` ${zipCode}` : ""}. ` +
                    `Ensure the location is within one of the tracked markets.`,
            });
        }

        // ── Resolve property details from SFR when a full address is provided ─
        let resolvedBeds:         number | null = beds != null ? Number(beds) : null;
        let resolvedBaths:        number | null = baths != null ? Number(baths) : null;
        let resolvedSqft:         number | null = sqft != null ? Number(sqft) : null;
        let resolvedPropertyType: string | null = propertyType ?? null;

        if (hasAddress) {
            const API_KEY = process.env.SFR_API_KEY;
            const API_URL = process.env.SFR_API_URL;

            if (!API_KEY || !API_URL) {
                console.warn(`${label} SFR API not configured — skipping property detail lookup`);
            } else {
                try {
                    console.log(`${label} Looking up property details: ${address}, ${city}, ${state} ${zipCode ?? ""}`);
                    const mergedProperties = await batchLookup({
                        records: [{ address, city, state, zipCode }],
                        API_KEY,
                        API_URL,
                        cityCode: "DEAL",
                    });

                    if (mergedProperties.length > 0 && !mergedProperties[0].error && mergedProperties[0].property) {
                        const p = mergedProperties[0].property as Record<string, unknown>;
                        const struct = (p.structure as Record<string, unknown> | undefined) ?? {};

                        resolvedBeds         = Number(struct.beds_count ?? 0) || null;
                        resolvedBaths        = Number(struct.baths ?? 0) || null;
                        resolvedSqft         = Number(struct.living_area_sqft ?? 0) || null;
                        resolvedPropertyType = (p.property_type as string | undefined) ?? null;
                    } else {
                        console.warn(`${label} SFR lookup returned no results — using manual values if provided`);
                    }
                } catch (lookupErr) {
                    console.warn(`${label} SFR lookup failed — proceeding without property details:`, lookupErr);
                }
            }
        }

        // ── Insert the deal ───────────────────────────────────────────────────
        const [deal] = await db
            .insert(deals)
            .values({
                userId,
                msaId,
                type:         resolvedDealType,
                address:      hasAddress ? (address as string).trim() : null,
                city:         (city as string).trim(),
                state:        (state as string).toUpperCase().trim(),
                zipCode:      String(zipCode).trim(),
                price:        String(price),
                beds:         resolvedBeds,
                baths:        resolvedBaths != null ? String(resolvedBaths) : null,
                sqft:         resolvedSqft,
                propertyType: resolvedPropertyType,
            })
            .returning();

        console.log(`${label} Deal posted: id=${deal.id}, city=${city}, state=${state}, msaId=${msaId}`);
        res.status(201).json({ message: "Deal posted successfully", deal });

        // ── Send new-deal notification emails in the background ────────────
        // isEmailOn is intentionally false — infrastructure is wired but disabled
        // until we're ready to enable notifications.
        ;(async () => {
            try {
                const subscribedUsers = await db
                    .select({ id: users.id, email: users.email })
                    .from(users)
                    .innerJoin(userMsaSubscriptions, eq(users.id, userMsaSubscriptions.userId))
                    .where(
                        and(
                            eq(userMsaSubscriptions.msaId, msaId),
                            eq(users.notifications, true),
                        )
                    );

                    if (subscribedUsers.length === 0) {
                        console.log(`${label} No MSA subscribers to notify`);
                        return;
                    }

                    const seen = new Set<string>([userId]);
                    const uniqueUsers = subscribedUsers.filter((u) => {
                        if (seen.has(u.id)) return false;
                        seen.add(u.id);
                        return true;
                    });

                    const template = process.env.POSTMARK_DEAL_TEMPLATE_ALIAS;
                    const isEmailOn = false;

                    if (template && isEmailOn) {
                        // Get county for email template
                        let county = "Unknown";
                        if (deal.propertyId) {
                            const [propRow] = await db
                                .select({ county: properties.county })
                                .from(properties)
                                .where(eq(properties.id, deal.propertyId))
                                .limit(1);
                            county = propRow?.county?.trim() || "Unknown";
                        }

                        const { sent, failed } = await sendTemplateToUsers({
                            recipients: uniqueUsers.map((u) => ({ email: u.email, userId: u.id })),
                            templateAlias: template,
                            templateModelForRecipient: () => ({
                                cta_url: "https://data.arvfinance.com/",
                                county: `${county} County`,
                            }),
                            logPrefix: label,
                        });

                        console.log(`${label} New-deal emails sent: ${sent}/${uniqueUsers.length}${failed.length > 0 ? ` (failed: ${failed.join(", ")})` : ""}`);
                    }
                } catch (err) {
                    console.error(`${label} Error sending new-deal notification emails:`, err);
                }
            })();
    } catch (error) {
        console.error("[POST /api/deals]", error);
        res.status(500).json({
            message: "Error posting deal",
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
});

// PATCH /api/deals/:id — only the user who created the deal may edit it (no role check)
router.patch("/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (isNaN(id)) return res.status(400).json({ message: "Invalid deal id" });

        const callerId = req.session?.userId;
        if (!callerId) return res.status(401).json({ message: "Not authenticated" });

        // Fetch existing deal and verify ownership
        const [existing] = await db
            .select({ id: deals.id, userId: deals.userId })
            .from(deals)
            .where(eq(deals.id, id))
            .limit(1);

        if (!existing) return res.status(404).json({ message: "Deal not found" });
        if (existing.userId !== callerId) {
            return res.status(403).json({ message: "You can only edit your own deals" });
        }

        const {
            address, city, state, zipCode,
            dealType, price,
            beds, baths, sqft, propertyType,
        } = req.body;

        const validDealTypes = ["wholesale", "agent", "sold"] as const;

        // Fetch current values so we can re-resolve MSA with merged location
        const [current] = await db
            .select({ city: deals.city, state: deals.state, zipCode: deals.zipCode })
            .from(deals)
            .where(eq(deals.id, id))
            .limit(1);

        const mergedCity  = (city    !== undefined ? String(city).trim()                : current.city)  ?? "";
        const mergedState = (state   !== undefined ? String(state).toUpperCase().trim() : current.state) ?? "";
        const mergedZip   = (zipCode !== undefined ? String(zipCode).trim()             : current.zipCode) ?? "";

        const newMsaId = await resolveMsaId(mergedCity, mergedState, mergedZip);
        if (!newMsaId) {
            return res.status(422).json({
                message: `Could not determine MSA for ${mergedCity}, ${mergedState} ${mergedZip}. ` +
                    `Ensure the location is within one of the tracked markets.`,
            });
        }

        // ── If a full address is being set, fetch property details from SFR ──
        let resolvedBeds:         number | null = beds  != null ? Number(beds)  : null;
        let resolvedBaths:        number | null = baths != null ? Number(baths) : null;
        let resolvedSqft:         number | null = sqft  != null ? Number(sqft)  : null;
        let resolvedPropertyType: string | null = propertyType ?? null;

        const incomingAddress = address !== undefined ? String(address).trim() : null;
        if (incomingAddress) {
            const API_KEY = process.env.SFR_API_KEY;
            const API_URL = process.env.SFR_API_URL;

            if (!API_KEY || !API_URL) {
                console.warn(`[PATCH /api/deals] SFR API not configured — skipping property detail lookup`);
            } else {
                try {
                    console.log(`[PATCH /api/deals] Looking up property details: ${incomingAddress}, ${mergedCity}, ${mergedState} ${mergedZip}`);
                    const mergedProperties = await batchLookup({
                        records: [{ address: incomingAddress, city: mergedCity, state: mergedState, zipCode: mergedZip }],
                        API_KEY,
                        API_URL,
                        cityCode: "DEAL",
                    });

                    if (mergedProperties.length > 0 && !mergedProperties[0].error && mergedProperties[0].property) {
                        const p = mergedProperties[0].property as Record<string, unknown>;
                        const struct = (p.structure as Record<string, unknown> | undefined) ?? {};

                        resolvedBeds         = Number(struct.beds_count ?? 0) || null;
                        resolvedBaths        = Number(struct.baths ?? 0) || null;
                        resolvedSqft         = Number(struct.living_area_sqft ?? 0) || null;
                        resolvedPropertyType = (p.property_type as string | undefined) ?? null;
                    } else {
                        console.warn(`[PATCH /api/deals] SFR lookup returned no results — keeping existing/manual values`);
                    }
                } catch (lookupErr) {
                    console.warn(`[PATCH /api/deals] SFR lookup failed — keeping existing/manual values:`, lookupErr);
                }
            }
        }

        const [updated] = await db
            .update(deals)
            .set({
                updatedAt:    new Date(),
                msaId:        newMsaId,
                address:      address      !== undefined ? (incomingAddress || null) : undefined,
                city:         city         !== undefined ? mergedCity   : undefined,
                state:        state        !== undefined ? mergedState  : undefined,
                zipCode:      zipCode      !== undefined ? mergedZip    : undefined,
                price:        price        !== undefined ? String(price) : undefined,
                type:         dealType     !== undefined && validDealTypes.includes(dealType) ? dealType : undefined,
                beds:         incomingAddress ? resolvedBeds  : (beds  !== undefined ? (beds  != null ? Number(beds)  : null) : undefined),
                baths:        incomingAddress ? (resolvedBaths  != null ? String(resolvedBaths)  : null) : (baths !== undefined ? (baths != null ? String(baths) : null) : undefined),
                sqft:         incomingAddress ? resolvedSqft : (sqft  !== undefined ? (sqft  != null ? Number(sqft)  : null) : undefined),
                propertyType: incomingAddress ? resolvedPropertyType : (propertyType !== undefined ? (propertyType ?? null) : undefined),
            })
            .where(eq(deals.id, id))
            .returning();

        res.json({ message: "Deal updated successfully", deal: updated });
    } catch (error) {
        console.error("[PATCH /api/deals]", error);
        res.status(500).json({ message: "Error updating deal" });
    }
});

// DELETE /api/deals/:id — pro can delete their own deals; admin/owner/relationship-manager can delete any
router.delete("/:id", requireRole(["pro", "relationship-manager", "admin", "owner"]), async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ message: "Invalid deal id" });
        }

        const [deal] = await db
            .select({ id: deals.id, userId: deals.userId })
            .from(deals)
            .where(eq(deals.id, id))
            .limit(1);

        if (!deal) {
            return res.status(404).json({ message: "Deal not found" });
        }

        const callerIsPrivileged = await db
            .select({ roleName: roles.name })
            .from(userRoles)
            .innerJoin(roles, eq(userRoles.roleId, roles.id))
            .where(
                and(
                    eq(userRoles.userId, req.session.userId!),
                    inArray(roles.name, ["admin", "owner", "relationship-manager"])
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
