import { db } from "server/storage";
import { deals } from "@database/schemas/deals.schema";
import { users, userRoles, roles } from "@database/schemas/users.schema";
import { msas, userMsaSubscriptions } from "@database/schemas/msas.schema";
import { resolveMsaId } from "server/utils/resolveMsa";
import { normalizePropertyType } from "server/utils/normalization";
import { sendTemplateToUsers } from "server/services/postmark/email.services";
import { eq, desc, and, inArray } from "drizzle-orm";
import { getStreetviewImage } from "server/services/properties/streetview.services";

export class DealServiceError extends Error {
    constructor(public statusCode: number, message: string) {
        super(message);
        this.name = "DealServiceError";
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

    console.log(
        `[dealsService.getDeals] ${results.length} deals returned` +
        `${filterUserId ? ` (userId=${filterUserId})` : ""}` +
        `${filterMsaName ? ` (msaName=${filterMsaName})` : ""}`
    );

    return Promise.all(
        results.map(async (deal) => {
            const url = buildDealStreetViewUrl(deal.address, deal.city, deal.state, deal.sfrPropertyId);
            if (!url) return { ...deal, streetViewUrl: null };

            try {
                const result = await getStreetviewImage({
                    address: deal.address!,
                    city:    deal.city    ?? "",
                    state:   deal.state   ?? "",
                    size:    "200x200",
                    sfrPropertyId: deal.sfrPropertyId ?? undefined,
                });
                return { ...deal, streetViewUrl: "imageData" in result ? url : null };
            } catch {
                return { ...deal, streetViewUrl: null };
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
    beds?: unknown;
    baths?: unknown;
    sqft?: unknown;
    propertyType?: string;
    sendNotifications?: boolean;
}

export async function createDeal(input: CreateDealInput) {
    const label = "[dealsService.createDeal]";
    const { address, city, state, zipCode, userId, dealType, price, beds, baths, sqft, propertyType } = input;

    const hasAddress = typeof address === "string" && address.trim().length > 0;

    // Business rule: manual property details required when no address
    if (!hasAddress) {
        const missing: string[] = [];
        if (beds == null)    missing.push("beds");
        if (baths == null)   missing.push("baths");
        if (sqft == null)    missing.push("sqft");
        if (!propertyType)   missing.push("propertyType");
        if (missing.length > 0) {
            throw new DealServiceError(
                400,
                `beds, baths, sqft, and propertyType are required when no street address is provided`,
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

    if (hasAddress) {
        const sfr = await resolvePropertyDetails(
            (address as string).trim(), city, state, zipCode, label
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
            beds:          resolvedBeds,
            baths:         resolvedBaths != null ? String(resolvedBaths) : null,
            sqft:          resolvedSqft,
            propertyType:  normalizePropertyType(resolvedPropertyType),
        })
        .returning();

    console.log(`${label} Deal posted: id=${deal.id}, city=${city}, state=${state}, msaId=${msaId}`);

    return { deal, msaId };
}

// ── POST deal — background notification (fire and forget) ──────────────────────
export async function sendDealNotification(
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
        const shouldNotify = false; // sendNotifications === true && !!template

        if (template && shouldNotify) {
            const { sent, failed } = await sendTemplateToUsers({
                recipients: uniqueUsers.map((u) => ({ email: u.email, userId: u.id })),
                templateAlias: template,
                templateModelForRecipient: () => ({
                    cta_url: "https://data.arvfinance.com/",
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
    beds?: unknown;
    baths?: unknown;
    sqft?: unknown;
    propertyType?: string;
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

    const { address, city, state, zipCode, dealType, price, beds, baths, sqft, propertyType } = input;

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

    const incomingAddress = (address !== undefined && address !== null)
        ? String(address).trim()
        : null;

    let resolvedBeds:         number | null = beds  != null ? Number(beds)  : null;
    let resolvedBaths:        number | null = baths != null ? Number(baths) : null;
    let resolvedSqft:         number | null = sqft  != null ? Number(sqft)  : null;
    let resolvedPropertyType: string | null = propertyType ?? null;

    if (incomingAddress) {
        const sfr = await resolvePropertyDetails(incomingAddress, mergedCity, mergedState, mergedZip, label);
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
            type:         dealType     !== undefined && validDealTypes.includes(dealType as typeof validDealTypes[number]) ? dealType as typeof validDealTypes[number] : undefined,
            beds:         incomingAddress ? resolvedBeds  : (beds  !== undefined ? (beds  != null ? Number(beds)  : null) : undefined),
            baths:        incomingAddress ? (resolvedBaths != null ? String(resolvedBaths) : null) : (baths !== undefined ? (baths != null ? String(baths) : null) : undefined),
            sqft:         incomingAddress ? resolvedSqft : (sqft  !== undefined ? (sqft  != null ? Number(sqft)  : null) : undefined),
            propertyType: incomingAddress
                ? normalizePropertyType(resolvedPropertyType)
                : (propertyType !== undefined ? normalizePropertyType(propertyType ?? null) : undefined),
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
}

export async function getBestBuyers(address: string): Promise<BestBuyer[]> {
    const label = "[dealsService.getBestBuyers]";
    const API_KEY = process.env.SFR_API_KEY;
    const API_URL = process.env.SFR_API_URL;

    if (!API_KEY || !API_URL) {
        throw new DealServiceError(503, "Best buyers lookup is not available — SFR API not configured");
    }

    const params = new URLSearchParams({ address });
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
            `Best buyers lookup failed (${response.status}) for "${address}"`,
        );
    }

    const data = (await response.json()) as { buyers?: unknown[] };
    const buyers = Array.isArray(data.buyers) ? (data.buyers as BestBuyer[]) : [];

    console.log(`${label} ${buyers.length} buyers returned for "${address}"`);

    return buyers.slice(0, 3);
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
