import { db } from "server/storage";
import { users } from "@database/schemas/users.schema";
import { msas, userMsaSubscriptions } from "@database/schemas/msas.schema";
import { properties, addresses, structures } from "@database/schemas/properties.schema";
import { sentPropertyIds as sentPropertyIdsTable } from "@database/schemas/sync.schema";
import { eq, and, sql } from "drizzle-orm";
import { StreetviewServices } from "server/services/properties";
import {
  sendTemplateToUsers,
  getWhitelistRecipientsForMsa,
} from "server/services/postmark/email.services";
import { formatAddress } from "@shared/utils/formatAddress";
import { formatCompanyName } from "@shared/utils/formatCompanyName";
import { formatPhoneNumber } from "@shared/utils/formatPhoneNumber";

const PROPERTY_COUNT_TARGET = 3;
/** Fetch this many recent properties and take the first 3 that have Street View images. */
const CANDIDATE_POOL_SIZE = 20;

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

/**
 * Returns the Street View image URL if Google has an image for this property, null otherwise.
 * Used to skip properties without real images so we only send properties with Street View.
 */
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

/**
 * Sends property-update emails to all users who have the given MSA selected and notifications enabled.
 * Uses the 3 most recent properties in that MSA for the email content.
 */
export async function sendEmailUpdatesForMsa(msaName: string, city: string, state: string): Promise<void> {
  try {
    // Users who have this MSA subscribed and notifications enabled
    const usersToEmail = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        email: users.email,
      })
      .from(users)
      .innerJoin(userMsaSubscriptions, eq(users.id, userMsaSubscriptions.userId))
      .innerJoin(msas, eq(userMsaSubscriptions.msaId, msas.id))
      .where(and(eq(msas.name, msaName), eq(users.notifications, true)));

    // Dedupe by user id (same user could appear if schema allowed duplicate subscriptions)
    const seen = new Set<string>();
    const uniqueUsers = usersToEmail.filter((u) => {
      if (seen.has(u.id)) return false;
      seen.add(u.id);
      return true;
    });

    // Resolve MSA ID for whitelist lookup
    const [msaRow] = await db.select({ id: msas.id }).from(msas).where(eq(msas.name, msaName)).limit(1);

    // ── Whitelist recipients ──────────────────────────────────────────────
    const whitelistRecipients = msaRow
      ? await getWhitelistRecipientsForMsa(msaRow.id)
      : [];
    // ─────────────────────────────────────────────────────────────────────

    if (uniqueUsers.length === 0 && whitelistRecipients.length === 0) {
      console.log(`[EMAIL ${msaName}]: No users or whitelist recipients for this MSA`);
      return;
    }

    // Fetch a pool of recent properties (by recording date).
    // Excludes: sold, vacant land, and any property already in sent_property_ids (previously sent or skipped).
    // We'll keep only those with Street View images up to PROPERTY_COUNT_TARGET.
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
          sql`NOT EXISTS (SELECT 1 FROM property_statuses ps JOIN statuses s ON s.id = ps.status_id WHERE ps.property_id = ${properties.id} AND s.name = 'sold')`,
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

    // Build list of up to PROPERTY_COUNT_TARGET properties that have Street View images.
    // Track all property IDs we evaluate so they are recorded in sent_property_ids regardless
    // of outcome — preventing re-evaluation of no-image properties on future runs.
    const propertiesForTemplate: Array<{
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
    }> = [];
    const processedPropertyIds: string[] = [];

    for (const p of candidateProperties) {
      if (propertiesForTemplate.length >= PROPERTY_COUNT_TARGET) break;

      // Record this property as processed regardless of whether it passes Street View check
      processedPropertyIds.push(p.propertyId);

      const rawAddress = p.address ?? "Unknown";
      const rawCity = p.city ?? "Unknown";
      const state = p.state ?? "N/A";
      const image_url = await getStreetViewUrlIfAvailable(p.sfrPropertyId, rawAddress, rawCity, state);
      if (image_url === null) continue;

      const statusTags = getStatusTags(p.statuses ?? []).map((tag) => ({
        label: tag.label,
        bg: tag.bg,
        text: tag.text,
      }));
      const bedrooms = p.bedsCount != null ? String(p.bedsCount) : "—";
      const bathrooms = p.baths != null ? String(p.baths) : "—";
      const sqft = p.livingAreaSqft != null ? p.livingAreaSqft.toLocaleString("en-US") : "—";
      const address = formatAddress(p.address) ?? rawAddress;
      const city = formatAddress(p.city) ?? rawCity;
      const buyer_company_name = formatCompanyName(p.buyerCompanyName);
      const buyer_contact_name = (p.buyerContactName ?? "").trim() || null;
      const buyer_email = (p.buyerContactEmail ?? "").trim() || null;
      const buyer_phone = formatPhoneNumber((p.buyerPhone ?? "").trim() || undefined);
      const seller_company_name = formatCompanyName(p.sellerCompanyName);
      const seller_contact_name = (p.sellerContactName ?? "").trim() || null;
      const seller_email = (p.sellerContactEmail ?? "").trim() || null;
      const seller_phone = formatPhoneNumber((p.sellerPhone ?? "").trim() || undefined);

      propertiesForTemplate.push({
        address,
        city,
        state,
        zipcode: (p.zipCode ?? "").trim() || "—",
        price: formatPrice(p.price?.toString()),
        date_sold: formatDateSold(p.recordingDate ?? p.saleDate ?? null),
        bedrooms,
        bathrooms,
        sqft,
        property_type: (p.propertyType ?? "").trim() || "—",
        image_url,
        status_tags: statusTags,
        buyer_company_name,
        buyer_contact_name,
        buyer_email,
        buyer_phone,
        seller_company_name,
        seller_contact_name,
        seller_email,
        seller_phone,
        is_arv_funded: !!p.isARVFunded,
      });
    }

    // Persist all evaluated property IDs so they are excluded from future candidate pools.
    // This covers both successfully queued properties and those skipped due to no Street View image.
    if (processedPropertyIds.length > 0) {
      await db
        .insert(sentPropertyIdsTable)
        .values(processedPropertyIds.map((id) => ({ propertyId: id })))
        .onConflictDoNothing();
    }

    if (propertiesForTemplate.length === 0) {
      console.log(`[EMAIL ${msaName}]: No properties with Street View images found in pool of ${candidateProperties.length}, skipping send`);
      return;
    }

    // Build recipient list for sendTemplateToUsers
    const firstNameByEmail = new Map<string, string>();
    for (const u of uniqueUsers) {
      firstNameByEmail.set(u.email, u.firstName ?? "there");
    }

    const emailRecipients = [
      ...uniqueUsers.map((u) => ({ email: u.email, userId: u.id })),
      ...whitelistRecipients,
    ];

    const { sent: sentCount, failed: failedRecipients } = await sendTemplateToUsers({
      recipients: emailRecipients,
      templateAlias: `${process.env.POSTMARK_TEMPLATE_ALIAS}`,
      templateModelForRecipient: (r) => ({
        name: firstNameByEmail.get(r.email) ?? "there",
        city,
        state,
        property_count: propertiesForTemplate.length,
        cta_url: "https://data.arvfinance.com/",
        year: "2026",
        company_name: "ARV Finance Inc.",
        properties: propertiesForTemplate,
      }),
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
