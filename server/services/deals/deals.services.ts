import { db } from "server/storage";
import { deals, dealLinks } from "@database/schemas/deals.schema";
import { users, userRoles, roles, userNotificationPreferences } from "@database/schemas/users.schema";
import { msas, userMsaSubscriptions } from "@database/schemas/msas.schema";
import { resolveMsaId } from "server/utils/resolveMsa";
import { resolveCountyFromZip } from "server/utils/resolveCounty";
import { normalizePropertyType } from "server/utils/normalization";
import {
    sendPlainEmail,
    getDefaultFromEmail,
    getConfirmedSenders,
    getRmEmailsByUserIds,
    resolveFromAddress,
    sendTemplateToUsers,
    getWhitelistRecipientsForMsa,
} from "server/services/postmark/email.services";
import { eq, desc, and, inArray, gte, isNotNull, ilike, SQL } from "drizzle-orm";
import { companies, companyContacts } from "@database/schemas/companies.schema";
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

function isValidUrl(url: string): boolean {
    try { new URL(url); return true; } catch { return false; }
}

function extractDomain(url: string): string {
    try {
        const hostname = new URL(url).hostname;             // e.g. "www.redfin.com" or "maps.google.com"
        const parts = hostname.replace(/^www\./, "").split(".");
        // Take the segment just before the TLD: ["redfin","com"] → "redfin", ["google","com"] → "google"
        return parts.length >= 2 ? parts[parts.length - 2] : parts[0];
    } catch {
        return url;
    }
}

function filterValidLinks(links: string[] | undefined): { url: string; domain: string }[] {
    return (links ?? [])
        .filter((u) => typeof u === "string" && isValidUrl(u.trim()))
        .map((u) => ({ url: u.trim(), domain: extractDomain(u.trim()) }))
        .slice(0, 3);
}

async function getTopBuyersByZipCode(zipCode: string): Promise<TopBuyer[]> {
    const label = "[dealsService.getTopBuyersByZipCode]";
    if (!zipCode) return [];

    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const cutoff = threeMonthsAgo.toISOString().split("T")[0];

    const rows = await db
        .selectDistinctOn([propertyTransactions.buyerId], {
            buyerId:   propertyTransactions.buyerId,
            buyerName: propertyTransactions.buyerName,
        })
        .from(propertyTransactions)
        .innerJoin(properties, eq(propertyTransactions.propertyId, properties.id))
        .innerJoin(addresses,  eq(properties.id, addresses.propertyId))
        .where(and(
            eq(addresses.zipCode, zipCode),
            eq(propertyTransactions.transactionType, "Arms Length"),
            gte(propertyTransactions.recordingDate, cutoff),
            isNotNull(propertyTransactions.buyerId),
        ))
        .limit(3);

    console.log(`${label} ${rows.length} top buyers for zip=${zipCode}`);

    const buyerIds = rows.map((r) => r.buyerId).filter(Boolean) as string[];
    const contactRows = buyerIds.length > 0
        ? await db
            .select()
            .from(companyContacts)
            .where(inArray(companyContacts.companyId, buyerIds))
            .orderBy(companyContacts.companyId, companyContacts.sortOrder, companyContacts.id)
        : [];
    const primaryContactMap = new Map<string, typeof companyContacts.$inferSelect>();
    for (const c of contactRows) {
        if (!primaryContactMap.has(c.companyId)) primaryContactMap.set(c.companyId, c);
    }

    return rows.map((row) => {
        const primary = row.buyerId ? primaryContactMap.get(row.buyerId) ?? null : null;
        const contactName = primary
            ? [primary.firstName, primary.lastName].filter(Boolean).join(" ") || null
            : null;
        return {
            companyId:   row.buyerId  ?? null,
            companyName: normalizeToTitleCase(row.buyerName ?? "") ?? (row.buyerName ?? "Unknown"),
            contactName,
        };
    });
}

// ── GET deals ──────────────────────────────────────────────────────────────────
type GetDealsFilters = {
    id?: number;
    userId?: string;
    msaName?: string;
    county?: string;
    city?: string;
    state?: string;
    zipCode?: string;
}

export async function getDeals(filters: GetDealsFilters) {
    const { id: filterId, userId: filterUserId, msaName: filterMsaName, county: filterCounty, city: filterCity, state: filterState, zipCode: filterZipCode } = filters;

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

    const conditions: SQL[] = [];
    if (filterId !== undefined)    conditions.push(eq(deals.id, filterId));
    if (filterUserId)              conditions.push(eq(deals.userId, filterUserId));
    if (filterMsaId !== undefined) conditions.push(eq(deals.msaId, filterMsaId));
    if (filterCounty)              conditions.push(ilike(deals.county, filterCounty));
    if (filterCity)                conditions.push(ilike(deals.city, filterCity));
    if (filterState)               conditions.push(eq(deals.state, filterState.toUpperCase()));
    if (filterZipCode)             conditions.push(eq(deals.zipCode, filterZipCode));
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const results = await db
        .select({
            id:             deals.id,
            createdAt:      deals.createdAt,
            sfrPropertyId:  deals.sfrPropertyId,
            address:        deals.address,
            city:         deals.city,
            state:        deals.state,
            zipCode:      deals.zipCode,
            price:         deals.price,
            potentialARV:  deals.potentialARV,
            closeOfEscrow:   deals.closeOfEscrow,
            estimatedBudget: deals.estimatedBudget,
            beds:            deals.beds,
            baths:        deals.baths,
            sqft:         deals.sqft,
            propertyType: deals.propertyType,
            notes:        deals.notes,
            adminNotes:   deals.adminNotes,
            photosUrl:    deals.photosUrl,
            msaId:        deals.msaId,
            msaName:      msas.name,
            county:       deals.county,
            dealType:     deals.type,
            userId:       deals.userId,
            userEmail:    users.email,
            userFirstName: users.firstName,
            userLastName:  users.lastName,
            userPhone:     users.phone,
        })
        .from(deals)
        .leftJoin(msas, eq(deals.msaId, msas.id))
        .leftJoin(users, eq(deals.userId, users.id))
        .where(whereClause)
        .orderBy(desc(deals.id));

    console.log(
        `[dealsService.getDeals] ${results.length} deals returned` +
        `${filterUserId  ? ` (userId=${filterUserId})`   : ""}` +
        `${filterMsaName ? ` (msaName=${filterMsaName})` : ""}` +
        `${filterCity    ? ` (city=${filterCity})`       : ""}` +
        `${filterZipCode ? ` (zipCode=${filterZipCode})` : ""}`
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

    // Batch-fetch links for all deals
    const dealIds = results.map((d) => d.id);
    const allLinks = dealIds.length > 0
        ? await db
            .select({ dealId: dealLinks.dealId, url: dealLinks.url, domain: dealLinks.domain })
            .from(dealLinks)
            .where(inArray(dealLinks.dealId, dealIds))
            .orderBy(dealLinks.dealId, dealLinks.sortOrder)
        : [];
    const linksByDealId = new Map<number, { url: string; domain: string }[]>();
    for (const row of allLinks) {
        const arr = linksByDealId.get(row.dealId) ?? [];
        arr.push({ url: row.url, domain: row.domain });
        linksByDealId.set(row.dealId, arr);
    }

    return Promise.all(
        results.map(async (deal) => {
            const topBuyers = topBuyersByZip.get(deal.zipCode ?? "") ?? [];
            const links = linksByDealId.get(deal.id) ?? [];
            const url = buildDealStreetViewUrl(deal.address, deal.city, deal.state, deal.sfrPropertyId);
            if (!url) return { ...deal, streetViewUrl: null, topBuyers, links };

            try {
                const result = await getStreetviewImage({
                    address: deal.address!,
                    city:    deal.city    ?? "",
                    state:   deal.state   ?? "",
                    size:    "200x200",
                    sfrPropertyId: deal.sfrPropertyId ?? undefined,
                });
                return { ...deal, streetViewUrl: "imageData" in result ? url : null, topBuyers, links };
            } catch {
                return { ...deal, streetViewUrl: null, topBuyers, links };
            }
        })
    );
}

// ── GET single deal by id ──────────────────────────────────────────────────────
export async function getDealById(id: number) {
    const results = await getDeals({ id });
    return results[0] ?? null;
}

// ── POST deal ──────────────────────────────────────────────────────────────────
export async function createDeal(input: CreateDealInput) {
    const label = "[dealsService.createDeal]";
    const { address, city, state, zipCode, userId, dealType, price, potentialARV, closeOfEscrow, estimatedBudget, beds, baths, sqft, propertyType, notes, adminNotes, photosUrl, links } = input;

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

    const county = await resolveCountyFromZip(zipCode, city, state);

    let resolvedSfrPropertyId: number | null = null;
    let resolvedBeds:          number | null = beds  != null ? Number(beds)  : null;
    let resolvedBaths:         number | null = baths != null ? Number(baths) : null;
    let resolvedSqft:          number | null = sqft  != null ? Number(sqft)  : null;
    let resolvedPropertyType:  string | null = propertyType ?? null;

    if (hasFullAddress) {
        try {
            const sfr = await resolvePropertyDetails(addressStr, city, state, zipCode, label);
            if (sfr.beds !== null || sfr.baths !== null) {
                resolvedSfrPropertyId = sfr.sfrPropertyId;
                resolvedBeds          = sfr.beds;
                resolvedBaths         = sfr.baths;
                resolvedSqft          = sfr.sqft;
                resolvedPropertyType  = sfr.propertyType;
            }
        } catch (err) {
            console.warn(`${label} SFR lookup failed, continuing with user-provided values:`, err instanceof Error ? err.message : err);
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
            county:        county,
            price:         price != null ? String(price) : null,
            potentialARV:  potentialARV  != null ? String(potentialARV)  : null,
            closeOfEscrow:   closeOfEscrow != null ? String(closeOfEscrow) : null,
            estimatedBudget: estimatedBudget != null ? Number(estimatedBudget) : null,
            beds:            resolvedBeds,
            baths:         resolvedBaths != null ? String(resolvedBaths) : null,
            sqft:          resolvedSqft,
            propertyType:  normalizePropertyType(resolvedPropertyType),
            notes:         notes ?? null,
            adminNotes:    adminNotes ?? null,
            photosUrl:     photosUrl ?? null,
        })
        .returning();

    console.log(`${label} Deal posted: id=${deal.id}, city=${city}, state=${state}, msaId=${msaId}`);

    const validLinks = filterValidLinks(links);
    if (validLinks.length > 0) {
        await db.insert(dealLinks).values(
            validLinks.map((link, i) => ({ dealId: deal.id, sortOrder: i + 1, url: link.url, domain: link.domain }))
        );
    }

    return { deal, msaId, links: validLinks };
}

// ── POST deal — background notification (fire and forget) ──────────────────────
type DealNotificationData = {
    id: number;
    createdAt: Date;
    address: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
    county: string | null;
    beds: number | null;
    baths: string | null;
    sqft: number | null;
    price: string | null;
    potentialARV: string | null;
    closeOfEscrow:   string | null;
    estimatedBudget: number | null;
    propertyType: string | null;
    type: DealType;
    sfrPropertyId: number | null;
    notes: string | null;
}

export async function sendDealNotification(
    deal: DealNotificationData,
    msaId: number,
    posterUserId: string,
    sendNotifications: boolean,
    notificationType: "new" | "sold" | "price_update" = "new",
    previousPrice?: string | null,
): Promise<void> {
    const label = "[dealsService.sendDealNotification]";
    try {
        const subscribedUsers = await db
            .select({
                id: users.id,
                email: users.email,
                dealTypeFilter: userNotificationPreferences.dealTypeFilter,
            })
            .from(users)
            .innerJoin(userMsaSubscriptions, eq(users.id, userMsaSubscriptions.userId))
            .innerJoin(userNotificationPreferences, eq(users.id, userNotificationPreferences.userId))
            .where(and(
                eq(userMsaSubscriptions.msaId, msaId),
                eq(users.notifications, true),
                eq(userNotificationPreferences.dealNotificationsEnabled, true),
            ));

        if (subscribedUsers.length === 0) {
            console.log(`${label} No MSA subscribers to notify`);
            return;
        }

        const seen = new Set<string>([posterUserId]);
        const uniqueUsers = subscribedUsers.filter((u) => {
            if (seen.has(u.id)) return false;
            seen.add(u.id);
            // Deal type filter: empty = all types; non-empty = must include this deal's type
            const typeFilter = (u.dealTypeFilter ?? []) as string[];
            if (typeFilter.length > 0 && !typeFilter.includes(deal.type)) return false;
            return true;
        });

        const template = notificationType === "sold"
            ? process.env.POSTMARK_DEAL_SOLD_TEMPLATE_ALIAS
            : notificationType === "price_update"
            ? process.env.POSTMARK_DEAL_UPDATED_TEMPLATE_ALIAS
            : process.env.POSTMARK_DEAL_TEMPLATE_ALIAS;
        // TEMP OVERRIDE — notifications disabled until ready to enable
        const shouldNotify = sendNotifications === true && !!template

        if (template && shouldNotify) {
            // Look up MSA name for the county field
            const [msaRow] = await db
                .select({ name: msas.name })
                .from(msas)
                .where(eq(msas.id, msaId))
                .limit(1);
            const county = deal.county ?? msaRow?.name ?? "your area";

            const { label: dealTypeLabel, color: dealTypeColor } = getDealTypeMeta(deal.type);

            const beds         = deal.beds         != null ? deal.beds                                  : null;
            const baths        = deal.baths        != null ? parseFloat(deal.baths)                    : null;
            const sqft         = deal.sqft         != null ? deal.sqft.toLocaleString("en-US")         : null;
            const price          = deal.price          ? Number(deal.price).toLocaleString("en-US")          : null;
            const potentialARV   = deal.potentialARV   ? Number(deal.potentialARV).toLocaleString("en-US")   : null;
            const closeOfEscrow  = deal.closeOfEscrow
                ? (() => { const [y, m, d] = deal.closeOfEscrow!.split("-"); return `${m}/${d}/${y}`; })()
                : null;
            const estimatedBudget = deal.estimatedBudget != null ? deal.estimatedBudget.toLocaleString("en-US") : null;

            const specsParts: string[] = [];
            if (beds  != null) specsParts.push(`${beds} bd`);
            if (baths != null) specsParts.push(`${baths} ba`);
            if (sqft  != null) specsParts.push(`${sqft} sqft`);
            const specsLine = specsParts.length > 0 ? specsParts.join("  ·  ") : null;

            // Resolve absolute street view URL (email clients cannot follow relative paths)
            let streetViewUrl: string | null = null;
            if (deal.address && deal.city && deal.state) {
                const APP_BASE_URL = (() => { const u = process.env.APP_URL || "https://data.arvfinance.com"; return /^https?:\/\//i.test(u) ? u : `http://${u}`; })();
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

            // ── Whitelist recipients ──────────────────────────────────────────────
            const whitelistRecipients = await getWhitelistRecipientsForMsa(msaId);
            // ─────────────────────────────────────────────────────────────────────

            const APP_BASE_URL_DEALS = (() => { const u = process.env.APP_URL || "https://data.arvfinance.com"; return /^https?:\/\//i.test(u) ? u : `http://${u}`; })();
            const dealUrlParams = new URLSearchParams({ dealId: String(deal.id) });
            if (deal.county && deal.state) {
                dealUrlParams.set("filterType", "county");
                dealUrlParams.set("filterValue", deal.county);
                dealUrlParams.set("filterState", deal.state);
            } else if (msaRow?.name) {
                dealUrlParams.set("filterType", "msa");
                dealUrlParams.set("filterValue", msaRow.name);
            }
            const dealUrl = `${APP_BASE_URL_DEALS}/deals?${dealUrlParams.toString()}`;

            const { sent, failed } = await sendTemplateToUsers({
                recipients: [
                    ...uniqueUsers.map((u) => ({ email: u.email, userId: u.id })),
                    ...whitelistRecipients,
                ],
                templateAlias: template,
                templateModelForRecipient: () => ({
                    // Each block is an object so badge vars are in direct context (no scope chain needed)
                    image_block:      streetViewUrl ? { url: streetViewUrl, deal_type_label: dealTypeLabel, deal_type_color: dealTypeColor } : null,
                    no_image_block:   !streetViewUrl ? { deal_type_label: dealTypeLabel, deal_type_color: dealTypeColor } : null,
                    address:          deal.address || "Undisclosed Address",
                    city:             deal.city    ?? "",
                    state:            deal.state   ?? "",
                    zipcode:          deal.zipCode ?? "",
                    specs_line:       specsLine,
                    price:            price,
                    previous_price:   previousPrice ? Number(previousPrice).toLocaleString("en-US") : null,
                    potential_arv:    potentialARV,
                    close_of_escrow:  closeOfEscrow,
                    estimated_budget: estimatedBudget,
                    property_type:    deal.propertyType ?? null,
                    notes:            deal.notes ?? null,
                    county:           county,
                    deal_url:         dealUrl,
                    cta_url:          `${APP_BASE_URL_DEALS}/deals`,
                    year:             new Date().getFullYear(),
                    company_name:     "ARV Finance",
                }),
                logPrefix: label,
            });

            console.log(
                `${label} New-deal emails sent: ${sent}/${uniqueUsers.length + whitelistRecipients.length}` +
                `${failed.length > 0 ? ` (failed: ${failed.join(", ")})` : ""}`
            );
        }
    } catch (err) {
        console.error(`${label} Error sending new-deal notification emails:`, err);
    }
}

// ── PATCH deal ─────────────────────────────────────────────────────────────────
export async function updateDeal(id: number, callerId: string, input: UpdateDealInput) {
    const label = "[dealsService.updateDeal]";

    const [existing] = await db
        .select({ id: deals.id, userId: deals.userId })
        .from(deals)
        .where(eq(deals.id, id))
        .limit(1);

    if (!existing) throw new DealServiceError(404, "Deal not found");

    if (existing.userId !== callerId) {
        const callerIsPrivileged = await db
            .select({ roleName: roles.name })
            .from(userRoles)
            .innerJoin(roles, eq(userRoles.roleId, roles.id))
            .where(and(
                eq(userRoles.userId, callerId),
                inArray(roles.name, ["admin", "owner"]),
            ))
            .limit(1);

        if (callerIsPrivileged.length === 0) {
            throw new DealServiceError(403, "You can only edit your own deals");
        }
    }

    const [current] = await db
        .select({ city: deals.city, state: deals.state, zipCode: deals.zipCode, type: deals.type, price: deals.price })
        .from(deals)
        .where(eq(deals.id, id))
        .limit(1);

    const { address, city, state, zipCode, dealType, price, potentialARV, closeOfEscrow, estimatedBudget, beds, baths, sqft, propertyType, notes, adminNotes, photosUrl, links } = input;

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

    const updatedCounty = await resolveCountyFromZip(mergedZip, mergedCity, mergedState);

    const incomingAddress    = (address !== undefined && address !== null) ? String(address).trim() : null;
    const incomingFullAddress = incomingAddress ? isFullStreetAddress(incomingAddress) : false;

    let resolvedBeds:         number | null = beds  != null ? Number(beds)  : null;
    let resolvedBaths:        number | null = baths != null ? Number(baths) : null;
    let resolvedSqft:         number | null = sqft  != null ? Number(sqft)  : null;
    let resolvedPropertyType: string | null = propertyType ?? null;

    if (incomingFullAddress) {
        try {
            const sfr = await resolvePropertyDetails(incomingAddress!, mergedCity, mergedState, mergedZip, label);
            if (sfr.beds !== null || sfr.baths !== null) {
                resolvedBeds         = sfr.beds;
                resolvedBaths        = sfr.baths;
                resolvedSqft         = sfr.sqft;
                resolvedPropertyType = sfr.propertyType;
            }
        } catch (err) {
            console.warn(`${label} SFR lookup failed, continuing with user-provided values:`, err instanceof Error ? err.message : err);
        }
    }

    const validDealTypes = ["wholesale", "agent", "sold"] as const;

    const [updated] = await db
        .update(deals)
        .set({
            updatedAt:    new Date(),
            msaId:        newMsaId,
            county:       updatedCounty,
            address:      address      !== undefined ? (incomingAddress || null) : undefined,
            city:         city         !== undefined ? mergedCity   : undefined,
            state:        state        !== undefined ? mergedState  : undefined,
            zipCode:      zipCode      !== undefined ? mergedZip    : undefined,
            price:        price        !== undefined ? (price != null ? String(price) : null) : undefined,
            potentialARV:  potentialARV  !== undefined ? (potentialARV  != null ? String(potentialARV)  : null) : undefined,
            closeOfEscrow:   closeOfEscrow   !== undefined ? (closeOfEscrow   != null ? String(closeOfEscrow)          : null) : undefined,
            estimatedBudget: estimatedBudget !== undefined ? (estimatedBudget != null ? Number(estimatedBudget)         : null) : undefined,
            type:         dealType     !== undefined && validDealTypes.includes(dealType as typeof validDealTypes[number]) ? dealType as typeof validDealTypes[number] : undefined,
            beds:         incomingFullAddress ? resolvedBeds  : (beds  !== undefined ? (beds  != null ? Number(beds)  : null) : undefined),
            baths:        incomingFullAddress ? (resolvedBaths != null ? String(resolvedBaths) : null) : (baths !== undefined ? (baths != null ? String(baths) : null) : undefined),
            sqft:         incomingFullAddress ? resolvedSqft : (sqft  !== undefined ? (sqft  != null ? Number(sqft)  : null) : undefined),
            propertyType: incomingFullAddress
                ? normalizePropertyType(resolvedPropertyType)
                : (propertyType !== undefined ? normalizePropertyType(propertyType ?? null) : undefined),
            notes:        notes      !== undefined ? (notes      ?? null) : undefined,
            adminNotes:   adminNotes !== undefined ? (adminNotes ?? null) : undefined,
            photosUrl:    photosUrl  !== undefined ? (photosUrl  ?? null) : undefined,
        })
        .where(eq(deals.id, id))
        .returning();

    // Replace all links (delete + re-insert)
    await db.delete(dealLinks).where(eq(dealLinks.dealId, id));
    const validLinks = filterValidLinks(links);
    if (validLinks.length > 0) {
        await db.insert(dealLinks).values(
            validLinks.map((link, i) => ({ dealId: id, sortOrder: i + 1, url: link.url, domain: link.domain }))
        );
    }

    console.log(`${label} Deal updated: id=${id}`);
    return { ...updated, links: validLinks, previousType: current.type, previousPrice: current.price };
}

// ── REQUEST deal info — single-click email to RM ──────────────────────────────
type RequestInfoOverrides = {
    firstName?: string;
    lastName?:  string;
    email?:     string;
    phone?:     string;
    message?:   string;
};

export async function requestDealInfo(dealId: number, requesterId: string, overrides?: RequestInfoOverrides): Promise<void> {
    const label = "[dealsService.requestDealInfo]";

    const [dealRow] = await db
        .select({
            id:              deals.id,
            address:         deals.address,
            city:            deals.city,
            state:           deals.state,
            zipCode:         deals.zipCode,
            type:            deals.type,
            price:           deals.price,
            potentialARV:    deals.potentialARV,
            closeOfEscrow:   deals.closeOfEscrow,
            estimatedBudget: deals.estimatedBudget,
            beds:            deals.beds,
            baths:           deals.baths,
            sqft:            deals.sqft,
            propertyType:    deals.propertyType,
            notes:           deals.notes,
            adminNotes:      deals.adminNotes,
            photosUrl:       deals.photosUrl,
            county:          deals.county,
            posterEmail:     users.email,
            posterFirstName: users.firstName,
            posterLastName:  users.lastName,
            posterPhone:     users.phone,
        })
        .from(deals)
        .leftJoin(users, eq(deals.userId, users.id))
        .where(eq(deals.id, dealId))
        .limit(1);

    if (!dealRow) throw new DealServiceError(404, "Deal not found");

    const [requester] = await db
        .select({ email: users.email, firstName: users.firstName, lastName: users.lastName, phone: users.phone })
        .from(users)
        .where(eq(users.id, requesterId))
        .limit(1);

    if (!requester) throw new DealServiceError(401, "Requester not found");

    if (!dealRow.posterEmail) {
        console.warn(`${label} Poster has no email — skipping notification: dealId=${dealId}`);
        return;
    }

    const DEFAULT_CONTACT = process.env.DEFAULT_CONTACT_RECIPIENT || "justin@arvfinance.com";
    let fromAddress = getDefaultFromEmail();

    const rmMap = await getRmEmailsByUserIds([requesterId]);
    const rmEmail = rmMap.get(requesterId);
    if (rmEmail) {
        const senders = await getConfirmedSenders();
        fromAddress = resolveFromAddress(senders, rmEmail);
    }

    const ccAddress = rmEmail ?? DEFAULT_CONTACT;

    const displayFirstName = overrides?.firstName?.trim() || requester.firstName;
    const displayLastName  = overrides?.lastName?.trim()  || requester.lastName;
    const displayEmail     = overrides?.email?.trim()     || requester.email;
    const displayPhone     = overrides?.phone?.trim()     || requester.phone || null;
    const displayMessage   = overrides?.message?.trim()   || null;

    const requesterName = [displayFirstName, displayLastName].filter(Boolean).join(" ");

    // ── HTML helpers ───────────────────────────────────────────────────────────
    const row = (lbl: string, val: string | number | null | undefined): string =>
        val != null && val !== ""
            ? `<tr><td style="padding:3px 16px 3px 0;color:#666;white-space:nowrap;vertical-align:top"><strong>${lbl}</strong></td><td style="padding:3px 0;color:#111">${val}</td></tr>`
            : "";
    const section = (title: string, rows: string): string =>
        rows.trim()
            ? `<h3 style="margin:20px 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#888;border-bottom:1px solid #eee;padding-bottom:4px">${title}</h3><table style="border-collapse:collapse;font-size:14px;width:100%">${rows}</table>`
            : "";

    const addressLabel = dealRow.address
        ? `${dealRow.address}, ${[dealRow.city, dealRow.state].filter(Boolean).join(", ")}`
        : [dealRow.city, dealRow.state].filter(Boolean).join(", ");

    const APP_BASE_URL = (() => { const u = process.env.APP_URL || "https://data.arvfinance.com"; return /^https?:\/\//i.test(u) ? u : `http://${u}`; })();
    const dealUrlParams = new URLSearchParams({ dealId: String(dealRow.id) });
    if (dealRow.county && dealRow.state) {
        dealUrlParams.set("filterType", "county");
        dealUrlParams.set("filterValue", dealRow.county);
        dealUrlParams.set("filterState", dealRow.state);
    }
    const dealUrl = `${APP_BASE_URL}/deals?${dealUrlParams.toString()}`;

    const posterHtmlBody = [
        `<p style="margin:0 0 16px;font-size:14px"><strong>${requesterName || displayEmail}</strong> has requested more information about your deal at <strong>${addressLabel}</strong>.</p>`,
        `<hr style="border:none;border-top:1px solid #eee;margin:0 0 4px" />`,
        section("Requester Contact", [
            row("Name",  requesterName || null),
            row("Email", displayEmail),
            row("Phone", displayPhone),
        ].join("")),
        ...(displayMessage ? [section("Message", displayMessage.replace(/\n/g, "<br />"))] : []),
        `<hr style="border:none;border-top:1px solid #eee;margin:16px 0 12px" />`,
        `<p style="margin:0"><a href="${dealUrl}" style="color:#5BC8DC;text-decoration:none;font-size:15px;font-weight:600">View Deal →</a></p>`,
    ].join("\n");

    const posterTextLines = [
        `${requesterName || displayEmail} has requested more information about your deal at ${addressLabel}.`,
        "",
        "REQUESTER CONTACT",
        requesterName  || null,
        displayEmail,
        displayPhone   || null,
        displayMessage ? `\nMESSAGE\n${displayMessage}` : null,
        `\nView Deal: ${dealUrl}`,
    ].filter((l): l is string => l != null).join("\n");

    const cc = ccAddress !== dealRow.posterEmail ? ccAddress : undefined;

    await sendPlainEmail({
        From:     fromAddress,
        To:       dealRow.posterEmail,
        Subject:  `[Deal Interest] ${addressLabel} — ${requesterName}`,
        HtmlBody: posterHtmlBody,
        TextBody: posterTextLines,
        ReplyTo:  displayEmail,
        Cc:       cc,
    });

    console.log(`${label} Sent to poster: dealId=${dealId}, poster=${dealRow.posterEmail}${cc ? `, cc=${cc}` : ""}`);
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
