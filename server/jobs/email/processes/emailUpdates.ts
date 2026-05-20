import { db } from "server/storage";
import { users } from "@database/schemas/users.schema";
import { userNotificationPreferences } from "@database/schemas/users.schema";
import { msas, userMsaSubscriptions } from "@database/schemas/msas.schema";
import { properties, addresses, structures } from "@database/schemas/properties.schema";
import { sentPropertyIds as sentPropertyIdsTable } from "@database/schemas/sync.schema";
import { eq, and, sql, or, isNull } from "drizzle-orm";
import { StreetviewServices } from "server/services/properties";
import {
    sendTemplateToUsers,
    getWhitelistRecipientsForMsa,
} from "server/services/postmark/email.services";
import { formatAddress } from "@shared/utils/formatAddress";
import { formatCompanyName } from "@shared/utils/formatCompanyName";
import { formatPhoneNumber } from "@shared/utils/formatPhoneNumber";

const PROPERTY_COUNT_TARGET = 3;
/** Fetch this many recent properties and take the first 3 per user that have Street View images. */
const CANDIDATE_POOL_SIZE = 30;

const STREETVIEW_SIZE = "600x400";
const APP_BASE_URL = process.env.APP_URL || "https://data.arvfinance.com";

// Status tag styles — match PropertyCard.tsx (and PropertyMap map ping colors)
const STATUS_TAG_STYLES: Record<string, { label: string; bg: string; text: string }> = {
    Renovating: { label: "Renovating", bg: "#69C9E1", text: "#fff" },
    Sold: { label: "Sold", bg: "#FF0000", text: "#fff" },
    "On Market": { label: "On Market", bg: "#22C55E", text: "#fff" },
    Wholesale: { label: "Wholesale", bg: "#9333EA", text: "#fff" },
};

function getStatusTags(statuses: string[]): { label: string; bg: string; text: string }[] {
    const tags: { label: string; bg: string; text: string }[] = [];
    for (const status of statuses) {
        const s = (status || "").toLowerCase().trim();
        if (s === "in-renovation") tags.push(STATUS_TAG_STYLES.Renovating);
        else if (s === "sold") tags.push(STATUS_TAG_STYLES.Sold);
        else if (s === "on-market") tags.push(STATUS_TAG_STYLES["On Market"]);
        else if (s === "wholesale") tags.push(STATUS_TAG_STYLES.Wholesale);
    }
    return tags.length > 0 ? tags : [STATUS_TAG_STYLES.Renovating];
}

function formatPrice(price: string | null | undefined): string {
    if (price == null) return "N/A";
    const num = parseFloat(price);
    if (isNaN(num)) return "N/A";
    return num.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function formatDateSold(saleDate: Date | string | null | undefined): string {
    if (saleDate == null) return "—";
    const d = typeof saleDate === "string" ? new Date(saleDate) : saleDate;
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function buildStreetviewUrl(sfrPropertyId: number, address: string, city: string, state: string): string {
    const params = new URLSearchParams({
        sfrPropertyId: String(sfrPropertyId),
        address,
        city,
        state,
        size: STREETVIEW_SIZE,
    });
    return `${APP_BASE_URL}/api/properties/streetview?${params.toString()}`;
}

async function getStreetViewUrlIfAvailable(
    sfrPropertyId: number,
    address: string,
    city: string,
    state: string
): Promise<string | null> {
    const addr = address || "Unknown";
    const c = city || "";
    const s = state || "";

    try {
        const result = await StreetviewServices.getStreetviewImage({
            address: addr,
            city: c,
            state: s,
            size: STREETVIEW_SIZE,
            sfrPropertyId,
        });

        if ("imageData" in result) {
            return buildStreetviewUrl(sfrPropertyId, addr, c, s);
        }
    } catch (err) {
        console.warn(`[EMAIL] Street View lookup failed for ${addr}, ${c}, ${s}:`, err);
    }

    return null;
}

type PropertyRow = {
    address: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
    price: string | null;
    saleDate: string | null;
    recordingDate: string | null;
    propertyId: string;
    sfrPropertyId: number;
    statuses: string[];
    propertyType: string | null;
    bedsCount: number | null;
    baths: string | null;
    livingAreaSqft: number | null;
    buyerCompanyName: string | null;
    buyerContactName: string | null;
    buyerContactEmail: string | null;
    buyerPhone: string | null;
    sellerCompanyName: string | null;
    sellerContactName: string | null;
    sellerContactEmail: string | null;
    sellerPhone: string | null;
    isARVFunded: boolean;
};

type PropertyForTemplate = {
    address: string;
    city: string;
    state: string;
    zipcode: string;
    price: string;
    date_sold: string;
    bedrooms: string;
    bathrooms: string;
    sqft: string;
    property_type: string;
    image_url: string;
    status_tags: { label: string; bg: string; text: string }[];
    buyer_company_name: string | null;
    buyer_contact_name: string | null;
    buyer_email: string | null;
    buyer_phone: string | null;
    seller_company_name: string | null;
    seller_contact_name: string | null;
    seller_email: string | null;
    seller_phone: string | null;
    is_arv_funded: boolean;
};

function buildPropertyForTemplate(p: PropertyRow, image_url: string): PropertyForTemplate {
    const rawAddress = p.address ?? "Unknown";
    const rawCity = p.city ?? "Unknown";
    const state = p.state ?? "N/A";

    return {
        address: formatAddress(p.address) ?? rawAddress,
        city: formatAddress(p.city) ?? rawCity,
        state,
        zipcode: (p.zipCode ?? "").trim() || "—",
        price: formatPrice(p.price?.toString()),
        date_sold: formatDateSold(p.recordingDate ?? p.saleDate ?? null),
        bedrooms: p.bedsCount != null ? String(p.bedsCount) : "—",
        bathrooms: p.baths != null ? p.baths : "—",
        sqft: p.livingAreaSqft != null ? p.livingAreaSqft.toLocaleString("en-US") : "—",
        property_type: (p.propertyType ?? "").trim() || "—",
        image_url,
        status_tags: getStatusTags(p.statuses ?? []).map((tag) => ({
            label: tag.label,
            bg: tag.bg,
            text: tag.text,
        })),
        buyer_company_name: formatCompanyName(p.buyerCompanyName),
        buyer_contact_name: (p.buyerContactName ?? "").trim() || null,
        buyer_email: (p.buyerContactEmail ?? "").trim() || null,
        buyer_phone: formatPhoneNumber((p.buyerPhone ?? "").trim() || undefined),
        seller_company_name: formatCompanyName(p.sellerCompanyName),
        seller_contact_name: (p.sellerContactName ?? "").trim() || null,
        seller_email: (p.sellerContactEmail ?? "").trim() || null,
        seller_phone: formatPhoneNumber((p.sellerPhone ?? "").trim() || undefined),
        is_arv_funded: !!p.isARVFunded,
    };
}

/** Returns true if the property's statuses satisfy the user's filter. Empty filter = all statuses pass. */
function matchesStatusFilter(statuses: string[], filter: string[]): boolean {
    if (filter.length === 0) return true;
    const normalized = statuses.map((s) => s.toLowerCase().trim());
    return filter.some((f) => normalized.includes(f));
}

/** Picks the first up to `count` entries from `candidates` whose Street View URL is in the cache. */
function pickPropertiesFromCache(
    candidates: PropertyRow[],
    cache: Map<string, string | null>,
    statusFilter: string[],
    count: number
): PropertyForTemplate[] {
    const result: PropertyForTemplate[] = [];
    for (const p of candidates) {
        if (result.length >= count) break;
        if (!matchesStatusFilter(p.statuses ?? [], statusFilter)) continue;
        const url = cache.get(p.propertyId);
        if (!url) continue;
        result.push(buildPropertyForTemplate(p, url));
    }
    return result;
}

/**
 * Sends property-update emails to all users subscribed to this MSA who have Data App emails enabled.
 * Each user may receive a personalized property set based on their dataAppStatusFilter.
 */
export async function sendEmailUpdatesForMsa(msaName: string, city: string, state: string): Promise<void> {
    try {
        // Users subscribed to this MSA with master notifications on and Data App enabled
        // (LEFT JOIN preferences: users with no prefs row default to enabled)
        const usersToEmail = await db
            .select({
                id: users.id,
                firstName: users.firstName,
                email: users.email,
                dataAppStatusFilter: userNotificationPreferences.dataAppStatusFilter,
            })
            .from(users)
            .innerJoin(userMsaSubscriptions, eq(users.id, userMsaSubscriptions.userId))
            .innerJoin(msas, eq(userMsaSubscriptions.msaId, msas.id))
            .leftJoin(userNotificationPreferences, eq(users.id, userNotificationPreferences.userId))
            .where(
                and(
                    eq(msas.name, msaName),
                    eq(users.notifications, true),
                    or(
                        isNull(userNotificationPreferences.dataAppEnabled),
                        eq(userNotificationPreferences.dataAppEnabled, true),
                    ),
                )
            );

        // Dedupe by user id
        const seen = new Set<string>();
        const uniqueUsers = usersToEmail.filter((u) => {
            if (seen.has(u.id)) return false;
            seen.add(u.id);
            return true;
        });

        // Resolve MSA ID for whitelist lookup
        const [msaRow] = await db.select({ id: msas.id }).from(msas).where(eq(msas.name, msaName)).limit(1);

        const whitelistRecipients = msaRow
            ? await getWhitelistRecipientsForMsa(msaRow.id)
            : [];

        if (uniqueUsers.length === 0 && whitelistRecipients.length === 0) {
            console.log(`[EMAIL ${msaName}]: No users or whitelist recipients for this MSA`);
            return;
        }

        // Candidate pool — all statuses, no sold exclusion (per-user filter applied below)
        const candidateProperties = await db
            .select({
                address: addresses.formattedStreetAddress,
                city: addresses.city,
                state: addresses.state,
                zipCode: addresses.zipCode,
                price: sql<string | null>`(SELECT pt.sale_price FROM property_transactions pt WHERE pt.property_id = ${properties.id} AND LOWER(TRIM(pt.transaction_type)) = 'arms length' ORDER BY COALESCE(pt.sort_order, 999999) ASC LIMIT 1)`,
                saleDate: sql<string | null>`(SELECT pt.sale_date FROM property_transactions pt WHERE pt.property_id = ${properties.id} AND LOWER(TRIM(pt.transaction_type)) = 'arms length' ORDER BY COALESCE(pt.sort_order, 999999) ASC LIMIT 1)`,
                recordingDate: sql<string | null>`(SELECT pt.recording_date FROM property_transactions pt WHERE pt.property_id = ${properties.id} AND LOWER(TRIM(pt.transaction_type)) = 'arms length' ORDER BY COALESCE(pt.sort_order, 999999) ASC LIMIT 1)`,
                propertyId: properties.id,
                sfrPropertyId: properties.sfrPropertyId,
                statuses: sql<string[]>`COALESCE((SELECT array_agg(s.name) FROM property_statuses ps JOIN statuses s ON s.id = ps.status_id WHERE ps.property_id = ${properties.id}), ARRAY[]::text[])`,
                propertyType: properties.propertyType,
                bedsCount: structures.bedsCount,
                baths: structures.baths,
                livingAreaSqft: structures.livingAreaSqft,
                buyerCompanyName: sql<string | null>`(SELECT pt.buyer_name FROM property_transactions pt WHERE pt.property_id = ${properties.id} AND LOWER(TRIM(pt.transaction_type)) = 'arms length' ORDER BY COALESCE(pt.sort_order, 999999) ASC LIMIT 1)`,
                buyerContactName: sql<string | null>`(SELECT TRIM(cc.first_name || ' ' || COALESCE(cc.last_name, '')) FROM company_contacts cc WHERE cc.company_id = (SELECT pt.buyer_id FROM property_transactions pt WHERE pt.property_id = ${properties.id} AND LOWER(TRIM(pt.transaction_type)) = 'arms length' ORDER BY COALESCE(pt.sort_order, 999999) ASC LIMIT 1) ORDER BY cc.sort_order ASC, cc.id ASC LIMIT 1)`,
                buyerContactEmail: sql<string | null>`(SELECT cc.email FROM company_contacts cc WHERE cc.company_id = (SELECT pt.buyer_id FROM property_transactions pt WHERE pt.property_id = ${properties.id} AND LOWER(TRIM(pt.transaction_type)) = 'arms length' ORDER BY COALESCE(pt.sort_order, 999999) ASC LIMIT 1) ORDER BY cc.sort_order ASC, cc.id ASC LIMIT 1)`,
                buyerPhone: sql<string | null>`(SELECT cc.phone_number FROM company_contacts cc WHERE cc.company_id = (SELECT pt.buyer_id FROM property_transactions pt WHERE pt.property_id = ${properties.id} AND LOWER(TRIM(pt.transaction_type)) = 'arms length' ORDER BY COALESCE(pt.sort_order, 999999) ASC LIMIT 1) ORDER BY cc.sort_order ASC, cc.id ASC LIMIT 1)`,
                sellerCompanyName: sql<string | null>`(SELECT pt.seller_name FROM property_transactions pt WHERE pt.property_id = ${properties.id} AND LOWER(TRIM(pt.transaction_type)) = 'arms length' ORDER BY COALESCE(pt.sort_order, 999999) ASC LIMIT 1)`,
                sellerContactName: sql<string | null>`(SELECT TRIM(cc.first_name || ' ' || COALESCE(cc.last_name, '')) FROM company_contacts cc WHERE cc.company_id = (SELECT pt.seller_id FROM property_transactions pt WHERE pt.property_id = ${properties.id} AND LOWER(TRIM(pt.transaction_type)) = 'arms length' ORDER BY COALESCE(pt.sort_order, 999999) ASC LIMIT 1) ORDER BY cc.sort_order ASC, cc.id ASC LIMIT 1)`,
                sellerContactEmail: sql<string | null>`(SELECT cc.email FROM company_contacts cc WHERE cc.company_id = (SELECT pt.seller_id FROM property_transactions pt WHERE pt.property_id = ${properties.id} AND LOWER(TRIM(pt.transaction_type)) = 'arms length' ORDER BY COALESCE(pt.sort_order, 999999) ASC LIMIT 1) ORDER BY cc.sort_order ASC, cc.id ASC LIMIT 1)`,
                sellerPhone: sql<string | null>`(SELECT cc.phone_number FROM company_contacts cc WHERE cc.company_id = (SELECT pt.seller_id FROM property_transactions pt WHERE pt.property_id = ${properties.id} AND LOWER(TRIM(pt.transaction_type)) = 'arms length' ORDER BY COALESCE(pt.sort_order, 999999) ASC LIMIT 1) ORDER BY cc.sort_order ASC, cc.id ASC LIMIT 1)`,
                isARVFunded: sql<boolean>`EXISTS (
          SELECT 1 FROM property_transactions pt
          WHERE pt.property_id = ${properties.id}
          AND UPPER(TRIM(pt.first_mtg_lender_name)) = 'ARV FINANCE INC'
        )`,
            })
            .from(properties)
            .innerJoin(addresses, eq(properties.id, addresses.propertyId))
            .leftJoin(structures, eq(properties.id, structures.propertyId))
            .where(
                and(
                    eq(properties.msa, msaName),
                    sql`(${properties.propertyType} IS NULL OR ${properties.propertyType} <> 'Vacant Land')`,
                    sql`NOT EXISTS (SELECT 1 FROM sent_property_ids WHERE property_id = ${properties.id})`,
                )
            )
            .orderBy(
                sql`CASE WHEN (SELECT pt.recording_date FROM property_transactions pt WHERE pt.property_id = ${properties.id} AND LOWER(TRIM(pt.transaction_type)) = 'arms length' ORDER BY COALESCE(pt.sort_order, 999999) ASC LIMIT 1) IS NULL THEN 1 ELSE 0 END`,
                sql`CAST((SELECT pt.recording_date FROM property_transactions pt WHERE pt.property_id = ${properties.id} AND LOWER(TRIM(pt.transaction_type)) = 'arms length' ORDER BY COALESCE(pt.sort_order, 999999) ASC LIMIT 1) AS DATE) DESC`,
                properties.id,
            )
            .limit(CANDIDATE_POOL_SIZE);

        if (candidateProperties.length === 0) {
            console.log(`[EMAIL ${msaName}]: No new properties in database for this MSA, skipping send`);
            return;
        }

        // Pre-cache Street View availability for all candidates in one pass.
        // All evaluated property IDs are marked in sent_property_ids regardless of outcome.
        const streetViewCache = new Map<string, string | null>();
        for (const p of candidateProperties) {
            const rawAddress = p.address ?? "Unknown";
            const rawCity = p.city ?? "Unknown";
            const rawState = p.state ?? "N/A";
            const url = await getStreetViewUrlIfAvailable(p.sfrPropertyId, rawAddress, rawCity, rawState);
            streetViewCache.set(p.propertyId, url);
        }

        // Mark all candidates as processed (prevents re-evaluation on future runs)
        const allCandidateIds = candidateProperties.map((p) => p.propertyId);
        await db
            .insert(sentPropertyIdsTable)
            .values(allCandidateIds.map((id) => ({ propertyId: id })))
            .onConflictDoNothing();

        // Build per-user property sets
        const userPropertiesMap = new Map<string, PropertyForTemplate[]>(); // email → properties
        let emailsSent = 0;

        for (const u of uniqueUsers) {
            const filter = (u.dataAppStatusFilter ?? []) as string[];
            const userProperties = pickPropertiesFromCache(
                candidateProperties,
                streetViewCache,
                filter,
                PROPERTY_COUNT_TARGET,
            );

            if (userProperties.length === 0) {
                console.log(`[EMAIL ${msaName}]: Skipping ${u.email} — no properties match their status filter`);
                continue;
            }

            userPropertiesMap.set(u.email, userProperties);
            emailsSent++;
        }

        // Whitelist recipients get the unfiltered set (first 3 with Street View, any status)
        const defaultProperties = pickPropertiesFromCache(
            candidateProperties,
            streetViewCache,
            [],
            PROPERTY_COUNT_TARGET,
        );

        if (emailsSent === 0 && (whitelistRecipients.length === 0 || defaultProperties.length === 0)) {
            console.log(`[EMAIL ${msaName}]: No properties with Street View images found, skipping send`);
            return;
        }

        // Build recipient list — only include users who have a personalized property set
        const firstNameByEmail = new Map<string, string>();
        for (const u of uniqueUsers) {
            firstNameByEmail.set(u.email, u.firstName ?? "there");
        }

        const userRecipients = uniqueUsers
            .filter((u) => userPropertiesMap.has(u.email))
            .map((u) => ({ email: u.email, userId: u.id }));

        const emailRecipients = [
            ...userRecipients,
            ...whitelistRecipients,
        ];

        if (emailRecipients.length === 0) {
            console.log(`[EMAIL ${msaName}]: All recipients skipped, nothing to send`);
            return;
        }

        const { sent: sentCount, failed: failedRecipients } = await sendTemplateToUsers({
            recipients: emailRecipients,
            templateAlias: `${process.env.POSTMARK_TEMPLATE_ALIAS}`,
            templateModelForRecipient: (r) => {
                const props = userPropertiesMap.get(r.email) ?? defaultProperties;
                return {
                    name: firstNameByEmail.get(r.email) ?? "there",
                    city,
                    state,
                    property_count: props.length,
                    cta_url: "https://data.arvfinance.com/",
                    year: "2026",
                    company_name: "ARV Finance Inc.",
                    properties: props,
                };
            },
            logPrefix: `[EMAIL ${msaName}]`,
        });

        if (failedRecipients.length > 0) {
            console.warn(
                `[EMAIL ${msaName}]: ${failedRecipients.length} recipient(s) skipped (inactive): ${failedRecipients.join(", ")}`
            );
        }

        console.log(`[EMAIL ${msaName}]: Sent ${sentCount}/${emailRecipients.length} email(s)${sentCount > 0 ? ", updated sync state" : ""}`);
    } catch (error) {
        console.error(`[EMAIL ${msaName}]: Error -`, error);
        throw error;
    }
}
