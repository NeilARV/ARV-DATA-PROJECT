import { db } from "server/storage";
import { deals } from "@database/schemas/deals.schema";
import { users, userRoles, roles } from "@database/schemas/users.schema";
import { msas, userMsaSubscriptions } from "@database/schemas/msas.schema";
import { resolveMsaId } from "server/utils/resolveMsa";
import { normalizePropertyType } from "server/utils/normalization";
import { sendTemplateToUsers } from "server/services/postmark/email.services";
import { eq, desc, and, inArray, gte, isNotNull } from "drizzle-orm";
import { companies, companyMsas } from "@database/schemas/companies.schema";
import { properties, propertyTransactions, addresses } from "@database/schemas/properties.schema";
import { getStreetviewImage } from "server/services/properties/streetview.services";
import { normalizeToTitleCase } from "server/utils/normalization";

export class DealServiceError extends Error {
    constructor(public statusCode: number, message: string) {
        super(message);
        this.name = "DealServiceError";
    }
}

// ── Deal type display helpers ──────────────────────────────────────────────────
function getDealTypeMeta(type: "wholesale" | "agent" | "sold"): { label: string; color: string } {
    switch (type) {
        case "wholesale": return { label: "Wholesale", color: "#9333EA" };
        case "sold":      return { label: "Sold",      color: "#FF0000" };
        default:          return { label: "Agent",     color: "#F97316" };
    }
}

// ── Shared: build a relative streetview URL for a deal ────────────────────────
function buildDealStreetViewUrl(
    address: string | null,
    city: string | null,
    state: string | null,
    sfrPropertyId: number | null,
): string | null {
    if (!address || !city || !state) return null;
    const params = new URLSearchParams({ address, city, state, size: "200x200" });
    if (sfrPropertyId != null) params.set("sfrPropertyId", String(sfrPropertyId));
    return `/api/properties/streetview?${params}`;
}

// ── Shared: resolve property details from SFR for a single address ─────────────
async function resolvePropertyDetails(
    address: string,
    city: string,
    state: string,
    zipCode: string,
    label: string,
): Promise<{ sfrPropertyId: number | null; beds: number | null; baths: number | null; sqft: number | null; propertyType: string | null }> {
    const API_KEY = process.env.SFR_API_KEY;
    const API_URL = process.env.SFR_API_URL;

    if (!API_KEY || !API_URL) {
        console.warn(`${label} SFR API not configured — skipping property detail lookup`);
        return { sfrPropertyId: null, beds: null, baths: null, sqft: null, propertyType: null };
    }

    const fullAddress = zipCode
        ? `${address}, ${city}, ${state} ${zipCode}`
        : `${address}, ${city}, ${state}`;

    console.log(`${label} Looking up property details: ${fullAddress}`);

    const params = new URLSearchParams({ address: fullAddress });
    const response = await fetch(`${API_URL}/properties/by-address?${params}`, {
        method: "GET",
        headers: {
            "X-API-TOKEN": API_KEY,
            "Accept": "application/json",
            "User-Agent": "PostmanRuntime/7.41.0",
        },
    });

    if (!response.ok) {
        throw new DealServiceError(
            502,
            `Property lookup failed (${response.status}): unable to retrieve details for "${fullAddress}"`,
        );
    }

    const property = (await response.json()) as Record<string, unknown>;

    if (!property || property.error) {
        throw new DealServiceError(
            404,
            `No property found for "${fullAddress}". Please verify the address and try again.`,
        );
    }

    const struct = (property.structure as Record<string, unknown> | undefined) ?? {};
    return {
        sfrPropertyId: Number(property.property_id ?? 0) || null,
        beds:          Number(struct.beds_count  ?? 0) || null,
        baths:         (Number(struct.baths ?? 0) + Number(struct.partial_baths_count ?? 0) * 0.5) || null,
        sqft:          Number(struct.living_area_sqft ?? 0) || null,
        propertyType:  (property.property_type as string | undefined) ?? null,
    };
}

// ── Address helpers ────────────────────────────────────────────────────────────
// Returns true only when the address begins with a house/building number (e.g. "123 Main St").
// A street-name-only value like "Main St" returns false and is treated as a partial address.
function isFullStreetAddress(address: string): boolean {
    return /^\d+[a-zA-Z]?\s+/i.test(address.trim());
}

// ── Top buyers by zip code ─────────────────────────────────────────────────────
export interface TopBuyer {
    companyId: string | null;
    companyName: string;
    contactName: string | null;
}

async function getTopBuyersByZipCode(zipCode: string): Promise<TopBuyer[]> {
    const label = "[dealsService.getTopBuyersByZipCode]";
    if (!zipCode) return [];

    // TODO: remove — temporary fake data for UI development
    return [
        { companyId: null, companyName: "Opendoor Labs Inc", contactName: "James Carter" },
        { companyId: null, companyName: "Invitation Homes", contactName: "Sarah Mitchell" },
        { companyId: null, companyName: "Progress Residential", contactName: null },
    ];

    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const cutoff = threeMonthsAgo.toISOString().split("T")[0];

    const rows = await db
        .selectDistinctOn([propertyTransactions.buyerId], {
            buyerId:     propertyTransactions.buyerId,
            buyerName:   propertyTransactions.buyerName,
            contactName: companies.contactName,
        })
        .from(propertyTransactions)
        .innerJoin(properties, eq(propertyTransactions.propertyId, properties.id))
        .innerJoin(addresses,  eq(properties.id, addresses.propertyId))
        .leftJoin(companies,   eq(propertyTransactions.buyerId, companies.id))
        .where(and(
            eq(addresses.zipCode, zipCode),
            eq(propertyTransactions.transactionType, "acquisition"),
            gte(propertyTransactions.recordingDate, cutoff),
            isNotNull(propertyTransactions.buyerId),
        ))
        .limit(3);

    console.log(`${label} ${rows.length} top buyers for zip=${zipCode}`);

    return rows.map((row) => ({
        companyId:   row.buyerId  ?? null,
        companyName: normalizeToTitleCase(row.buyerName ?? "") ?? (row.buyerName ?? "Unknown"),
        contactName: row.contactName ?? null,
    }));
}

// ── GET deals ──────────────────────────────────────────────────────────────────
export interface GetDealsFilters {
    userId?: string;
    msaName?: string;
}

export async function getDeals(filters: GetDealsFilters) {
    const { userId: filterUserId, msaName: filterMsaName } = filters;

    let filterMsaId: number | undefined;
    if (filterMsaName) {
        const [msaRow] = await db
            .select({ id: msas.id })
            .from(msas)
            .where(eq(msas.name, filterMsaName))
            .limit(1);

        if (!msaRow) {
            console.log(`[dealsService.getDeals] MSA not found: "${filterMsaName}" — returning empty`);
            return [];
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
            id:             deals.id,
            createdAt:      deals.createdAt,
            sfrPropertyId:  deals.sfrPropertyId,
            address:        deals.address,
            city:         deals.city,
            state:        deals.state,
            zipCode:      deals.zipCode,
            price:        deals.price,
            potentialARV: deals.potentialARV,
            beds:         deals.beds,
            baths:        deals.baths,
            sqft:         deals.sqft,
            propertyType: deals.propertyType,
            notes:        deals.notes,
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

    console.log(
        `[dealsService.getDeals] ${results.length} deals returned` +
        `${filterUserId ? ` (userId=${filterUserId})` : ""}` +
        `${filterMsaName ? ` (msaName=${filterMsaName})` : ""}`
    );

    // Batch-fetch top buyers for each unique zip code
    const uniqueZips = Array.from(new Set(results.map((d) => d.zipCode).filter((z): z is string => Boolean(z))));
    const topBuyersByZip = new Map<string, TopBuyer[]>();
    await Promise.all(
        uniqueZips.map(async (zip) => {
            try {
                topBuyersByZip.set(zip, await getTopBuyersByZipCode(zip));
            } catch (err) {
                console.error(`[dealsService.getDeals] Failed top buyers for zip=${zip}:`, err);
                topBuyersByZip.set(zip, []);
            }
        })
    );

    return Promise.all(
        results.map(async (deal) => {
            const topBuyers = topBuyersByZip.get(deal.zipCode ?? "") ?? [];
            const url = buildDealStreetViewUrl(deal.address, deal.city, deal.state, deal.sfrPropertyId);
            if (!url) return { ...deal, streetViewUrl: null, topBuyers };

            try {
                const result = await getStreetviewImage({
                    address: deal.address!,
                    city:    deal.city    ?? "",
                    state:   deal.state   ?? "",
                    size:    "200x200",
                    sfrPropertyId: deal.sfrPropertyId ?? undefined,
                });
                return { ...deal, streetViewUrl: "imageData" in result ? url : null, topBuyers };
            } catch {
                return { ...deal, streetViewUrl: null, topBuyers };
            }
        })
    );
}

// ── POST deal ──────────────────────────────────────────────────────────────────
export interface CreateDealInput {
    address?: unknown;
    city: string;
    state: string;
    zipCode: string;
    userId: string;
    dealType?: string;
    price: number | string;
    potentialARV?: number | string;
    beds?: unknown;
    baths?: unknown;
    sqft?: unknown;
    propertyType?: string;
    notes?: string;
    sendNotifications?: boolean;
}

export async function createDeal(input: CreateDealInput) {
    const label = "[dealsService.createDeal]";
    const { address, city, state, zipCode, userId, dealType, price, potentialARV, beds, baths, sqft, propertyType, notes } = input;

    const addressStr     = typeof address === "string" ? address.trim() : "";
    const hasAddress     = addressStr.length > 0;
    const hasFullAddress = hasAddress && isFullStreetAddress(addressStr);

    // Business rule: manual property details required when no full street address
    if (!hasFullAddress) {
        const missing: string[] = [];
        if (beds == null)    missing.push("beds");
        if (baths == null)   missing.push("baths");
        if (sqft == null)    missing.push("sqft");
        if (!propertyType)   missing.push("propertyType");
        if (missing.length > 0) {
            throw new DealServiceError(
                400,
                `beds, baths, sqft, and propertyType are required when a full street address (with house number) is not provided`,
            );
        }
    }

    const validDealTypes = ["wholesale", "agent", "sold"] as const;
    const resolvedDealType = (validDealTypes as readonly string[]).includes(dealType ?? "")
        ? (dealType as "wholesale" | "agent" | "sold")
        : "agent" as const;

    const msaId = await resolveMsaId(city, state, zipCode);
    if (!msaId) {
        throw new DealServiceError(
            422,
            `Could not determine MSA for ${city}, ${state}${zipCode ? ` ${zipCode}` : ""}. ` +
            `Ensure the location is within one of the tracked markets.`,
        );
    }

    let resolvedSfrPropertyId: number | null = null;
    let resolvedBeds:          number | null = beds  != null ? Number(beds)  : null;
    let resolvedBaths:         number | null = baths != null ? Number(baths) : null;
    let resolvedSqft:          number | null = sqft  != null ? Number(sqft)  : null;
    let resolvedPropertyType:  string | null = propertyType ?? null;

    if (hasFullAddress) {
        const sfr = await resolvePropertyDetails(
            addressStr, city, state, zipCode, label
        );
        if (sfr.beds !== null || sfr.baths !== null) {
            resolvedSfrPropertyId = sfr.sfrPropertyId;
            resolvedBeds          = sfr.beds;
            resolvedBaths         = sfr.baths;
            resolvedSqft          = sfr.sqft;
            resolvedPropertyType  = sfr.propertyType;
        }
    }

    const [deal] = await db
        .insert(deals)
        .values({
            userId,
            msaId,
            type:          resolvedDealType,
            sfrPropertyId: resolvedSfrPropertyId,
            address:       hasAddress ? (address as string).trim() : null,
            city:          city.trim(),
            state:         state.toUpperCase().trim(),
            zipCode:       String(zipCode).trim(),
            price:         String(price),
            potentialARV:           potentialARV != null ? String(potentialARV) : null,
            beds:          resolvedBeds,
            baths:         resolvedBaths != null ? String(resolvedBaths) : null,
            sqft:          resolvedSqft,
            propertyType:  normalizePropertyType(resolvedPropertyType),
            notes:         notes ?? null,
        })
        .returning();

    console.log(`${label} Deal posted: id=${deal.id}, city=${city}, state=${state}, msaId=${msaId}`);

    return { deal, msaId };
}

// ── POST deal — background notification (fire and forget) ──────────────────────
export interface DealNotificationData {
    createdAt: Date;
    address: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
    beds: number | null;
    baths: string | null;
    sqft: number | null;
    price: string | null;
    potentialARV: string | null;
    propertyType: string | null;
    type: "wholesale" | "agent" | "sold";
    sfrPropertyId: number | null;
    notes: string | null;
}

export async function sendDealNotification(
    deal: DealNotificationData,
    msaId: number,
    posterUserId: string,
    sendNotifications: boolean,
): Promise<void> {
    const label = "[dealsService.sendDealNotification]";
    try {
        const subscribedUsers = await db
            .select({ id: users.id, email: users.email })
            .from(users)
            .innerJoin(userMsaSubscriptions, eq(users.id, userMsaSubscriptions.userId))
            .where(and(
                eq(userMsaSubscriptions.msaId, msaId),
                eq(users.notifications, true),
            ));

        if (subscribedUsers.length === 0) {
            console.log(`${label} No MSA subscribers to notify`);
            return;
        }

        const seen = new Set<string>([posterUserId]);
        const uniqueUsers = subscribedUsers.filter((u) => {
            if (seen.has(u.id)) return false;
            seen.add(u.id);
            return true;
        });

        const template = process.env.POSTMARK_DEAL_TEMPLATE_ALIAS;
        // TEMP OVERRIDE — notifications disabled until ready to enable
        const shouldNotify = sendNotifications === true && !!template

        if (template && shouldNotify) {
            // Look up MSA name for the county field
            const [msaRow] = await db
                .select({ name: msas.name })
                .from(msas)
                .where(eq(msas.id, msaId))
                .limit(1);
            const county = deal.city ?? msaRow?.name ?? "your area";

            const { label: dealTypeLabel, color: dealTypeColor } = getDealTypeMeta(deal.type);

            const beds         = deal.beds         != null ? deal.beds                                  : null;
            const baths        = deal.baths        != null ? parseFloat(deal.baths)                    : null;
            const sqft         = deal.sqft         != null ? deal.sqft.toLocaleString("en-US")         : null;
            const price        = deal.price        ? Number(deal.price).toLocaleString("en-US")        : null;
            const potentialARV = deal.potentialARV ? Number(deal.potentialARV).toLocaleString("en-US") : null;

            const specsParts: string[] = [];
            if (beds  != null) specsParts.push(`${beds} bd`);
            if (baths != null) specsParts.push(`${baths} ba`);
            if (sqft  != null) specsParts.push(`${sqft} sqft`);
            const specsLine = specsParts.length > 0 ? specsParts.join("  ·  ") : null;
            const postedAt = new Date(deal.createdAt).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
                timeZone: "America/Los_Angeles",
            });

            // Resolve absolute street view URL (email clients cannot follow relative paths)
            let streetViewUrl: string | null = null;
            if (deal.address && deal.city && deal.state) {
                const APP_BASE_URL = process.env.APP_URL || "https://data.arvfinance.com";
                const params = new URLSearchParams({
                    address: deal.address,
                    city:    deal.city,
                    state:   deal.state,
                    size:    "200x200",
                });
                if (deal.sfrPropertyId != null) params.set("sfrPropertyId", String(deal.sfrPropertyId));
                try {
                    const result = await getStreetviewImage({
                        address:       deal.address,
                        city:          deal.city,
                        state:         deal.state,
                        size:          "200x200",
                        sfrPropertyId: deal.sfrPropertyId ?? undefined,
                    });
                    if ("imageData" in result) {
                        streetViewUrl = `${APP_BASE_URL}/api/properties/streetview?${params}`;
                    }
                } catch {
                    // No image available — placeholder will render via {{#no_image}}
                }
            }

            const { sent, failed } = await sendTemplateToUsers({
                recipients: uniqueUsers.map((u) => ({ email: u.email, userId: u.id })),
                templateAlias: template,
                templateModelForRecipient: () => ({
                    // Each block is an object so badge vars are in direct context (no scope chain needed)
                    image_block:    streetViewUrl ? { url: streetViewUrl, deal_type_label: dealTypeLabel, deal_type_color: dealTypeColor } : null,
                    no_image_block: !streetViewUrl ? { deal_type_label: dealTypeLabel, deal_type_color: dealTypeColor } : null,
                    address:          deal.address || "Undisclosed Address",
                    city:             deal.city    ?? "",
                    state:            deal.state   ?? "",
                    zipcode:          deal.zipCode ?? "",
                    specs_line:       specsLine,
                    price:            price,
                    potential_arv:    potentialARV,
                    property_type:    deal.propertyType ?? null,
                    posted_at:        postedAt,
                    notes:            deal.notes ?? null,
                    county:           county,
                    cta_url:          "https://data.arvfinance.com/",
                    year:             new Date().getFullYear(),
                    company_name:     "ARV Finance",
                }),
                logPrefix: label,
            });

            console.log(
                `${label} New-deal emails sent: ${sent}/${uniqueUsers.length}` +
                `${failed.length > 0 ? ` (failed: ${failed.join(", ")})` : ""}`
            );
        }
    } catch (err) {
        console.error(`${label} Error sending new-deal notification emails:`, err);
    }
}

// ── PATCH deal ─────────────────────────────────────────────────────────────────
export interface UpdateDealInput {
    address?: unknown;
    city?: string;
    state?: string;
    zipCode?: string;
    dealType?: string;
    price?: number | string;
    potentialARV?: number | string;
    beds?: unknown;
    baths?: unknown;
    sqft?: unknown;
    propertyType?: string;
    notes?: string;
}

export async function updateDeal(id: number, callerId: string, input: UpdateDealInput) {
    const label = "[dealsService.updateDeal]";

    const [existing] = await db
        .select({ id: deals.id, userId: deals.userId })
        .from(deals)
        .where(eq(deals.id, id))
        .limit(1);

    if (!existing) throw new DealServiceError(404, "Deal not found");
    if (existing.userId !== callerId) throw new DealServiceError(403, "You can only edit your own deals");

    const [current] = await db
        .select({ city: deals.city, state: deals.state, zipCode: deals.zipCode })
        .from(deals)
        .where(eq(deals.id, id))
        .limit(1);

    const { address, city, state, zipCode, dealType, price, potentialARV, beds, baths, sqft, propertyType, notes } = input;

    const mergedCity  = (city    !== undefined ? String(city).trim()                : current.city)    ?? "";
    const mergedState = (state   !== undefined ? String(state).toUpperCase().trim() : current.state)   ?? "";
    const mergedZip   = (zipCode !== undefined ? String(zipCode).trim()             : current.zipCode) ?? "";

    const newMsaId = await resolveMsaId(mergedCity, mergedState, mergedZip);
    if (!newMsaId) {
        throw new DealServiceError(
            422,
            `Could not determine MSA for ${mergedCity}, ${mergedState} ${mergedZip}. ` +
            `Ensure the location is within one of the tracked markets.`,
        );
    }

    const incomingAddress    = (address !== undefined && address !== null) ? String(address).trim() : null;
    const incomingFullAddress = incomingAddress ? isFullStreetAddress(incomingAddress) : false;

    let resolvedBeds:         number | null = beds  != null ? Number(beds)  : null;
    let resolvedBaths:        number | null = baths != null ? Number(baths) : null;
    let resolvedSqft:         number | null = sqft  != null ? Number(sqft)  : null;
    let resolvedPropertyType: string | null = propertyType ?? null;

    if (incomingFullAddress) {
        const sfr = await resolvePropertyDetails(incomingAddress!, mergedCity, mergedState, mergedZip, label);
        if (sfr.beds !== null || sfr.baths !== null) {
            resolvedBeds         = sfr.beds;
            resolvedBaths        = sfr.baths;
            resolvedSqft         = sfr.sqft;
            resolvedPropertyType = sfr.propertyType;
        }
    }

    const validDealTypes = ["wholesale", "agent", "sold"] as const;

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
            potentialARV:          potentialARV          !== undefined ? (potentialARV != null ? String(potentialARV) : null) : undefined,
            type:         dealType     !== undefined && validDealTypes.includes(dealType as typeof validDealTypes[number]) ? dealType as typeof validDealTypes[number] : undefined,
            beds:         incomingFullAddress ? resolvedBeds  : (beds  !== undefined ? (beds  != null ? Number(beds)  : null) : undefined),
            baths:        incomingFullAddress ? (resolvedBaths != null ? String(resolvedBaths) : null) : (baths !== undefined ? (baths != null ? String(baths) : null) : undefined),
            sqft:         incomingFullAddress ? resolvedSqft : (sqft  !== undefined ? (sqft  != null ? Number(sqft)  : null) : undefined),
            propertyType: incomingFullAddress
                ? normalizePropertyType(resolvedPropertyType)
                : (propertyType !== undefined ? normalizePropertyType(propertyType ?? null) : undefined),
            notes:        notes !== undefined ? (notes ?? null) : undefined,
        })
        .where(eq(deals.id, id))
        .returning();

    console.log(`${label} Deal updated: id=${id}`);
    return updated;
}

// ── GET best buyers ────────────────────────────────────────────────────────────
export interface BestBuyer {
    name: string;
    formattedName: string;
    matchScore: number;
    matchReasons: string[];
    totalAcquisitions: number;
    purchasesWithinQuarterMile: number;
    purchasesWithinOneMile: number;
    recentPurchasesCount: number;
    companyId: string | null;
    contactName: string | null;
}

export interface GetBestBuyersInput {
    address: string;
    city: string;
    state: string;
    zipCode: string;
}

export async function getBestBuyers({ address, city, state, zipCode }: GetBestBuyersInput): Promise<BestBuyer[]> {
    const label = "[dealsService.getBestBuyers]";
    const API_KEY = process.env.SFR_API_KEY;
    const API_URL = process.env.SFR_API_URL;

    if (!API_KEY || !API_URL) {
        throw new DealServiceError(503, "Best buyers lookup is not available — SFR API not configured");
    }

    const fullAddress = [address, city, state, zipCode].filter(Boolean).join(", ");

    const params = new URLSearchParams({ address: fullAddress });
    const response = await fetch(`${API_URL}/buyers/best-buyers?${params}`, {
        method: "GET",
        headers: {
            "X-API-TOKEN": API_KEY,
            "Accept": "application/json",
            "User-Agent": "PostmanRuntime/7.41.0",
        },
    });

    if (!response.ok) {
        throw new DealServiceError(
            502,
            `Best buyers lookup failed (${response.status}) for "${fullAddress}"`,
        );
    }

    const data = (await response.json()) as { buyers?: unknown[] };
    type SfrBuyer = Omit<BestBuyer, "companyId" | "contactName">;
    const rawBuyers = Array.isArray(data.buyers) ? (data.buyers as SfrBuyer[]) : [];
    const topBuyers = rawBuyers.slice(0, 3);

    console.log(`${label} ${rawBuyers.length} buyers returned for "${fullAddress}"`);

    // Look up matching companies within the MSA (case-insensitive, using raw SFR names before normalization)
    const companyLookup = new Map<string, { id: string; contactName: string | null }>();
    const msaId = await resolveMsaId(city, state, zipCode);
    if (msaId) {
        const msaCompanies = await db
            .select({ id: companies.id, companyName: companies.companyName, contactName: companies.contactName })
            .from(companies)
            .innerJoin(companyMsas, eq(companies.id, companyMsas.companyId))
            .where(eq(companyMsas.msaId, msaId));

        for (const c of msaCompanies) {
            companyLookup.set(c.companyName.toLowerCase(), { id: c.id, contactName: c.contactName ?? null });
        }
    }

    return topBuyers.map((b) => {
        const match = companyLookup.get(b.name.toLowerCase());
        return {
            ...b,
            name: normalizeToTitleCase(b.name) ?? b.name,
            companyId: match?.id ?? null,
            contactName: match?.contactName ?? null,
        };
    });
}

// ── DELETE deal ────────────────────────────────────────────────────────────────
export async function deleteDeal(id: number, callerId: string) {
    const label = "[dealsService.deleteDeal]";

    const [deal] = await db
        .select({ id: deals.id, userId: deals.userId })
        .from(deals)
        .where(eq(deals.id, id))
        .limit(1);

    if (!deal) throw new DealServiceError(404, "Deal not found");

    const callerIsPrivileged = await db
        .select({ roleName: roles.name })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(and(
            eq(userRoles.userId, callerId),
            inArray(roles.name, ["admin", "owner", "relationship-manager"]),
        ))
        .limit(1);

    if (callerIsPrivileged.length === 0 && deal.userId !== callerId) {
        throw new DealServiceError(403, "You can only delete your own deals");
    }

    await db.delete(deals).where(eq(deals.id, id));

    console.log(`${label} Deal deleted: id=${id}`);
    return { id: deal.id };
}
