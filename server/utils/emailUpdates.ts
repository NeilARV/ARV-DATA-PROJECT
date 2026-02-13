import { ServerClient } from "postmark";
import { db } from "server/storage";
import { users } from "../../database/schemas/users.schema";
import { msas, userMsaSubscriptions } from "../../database/schemas/msas.schema";
import { properties, addresses, lastSales, structures } from "../../database/schemas/properties.schema";
import { companies } from "../../database/schemas/companies.schema";
import { emailSyncState } from "../../database/schemas/sync.schema";
import { eq, and, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { StreetviewServices } from "server/services/properties";

const buyerCompanies = alias(companies, "buyer_companies");
const sellerCompanies = alias(companies, "seller_companies");

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

function getStatusTags(status: string | null): { label: string; bg: string; text: string }[] {
  const s = (status || "").toLowerCase().trim();
  if (s === "in-renovation") return [STATUS_TAG_STYLES.Renovating];
  if (s === "sold") return [STATUS_TAG_STYLES.Sold];
  if (s === "on-market") return [STATUS_TAG_STYLES["On Market"]];
  if (s === "b2b") return [STATUS_TAG_STYLES.Wholesale, STATUS_TAG_STYLES.Renovating];
  return [STATUS_TAG_STYLES.Renovating];
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

function buildStreetviewUrl(propertyId: string, address: string, city: string, state: string): string {
  const params = new URLSearchParams({
    propertyId,
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
  propertyId: string,
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
      propertyId,
    });

    if ("imageData" in result) {
      return buildStreetviewUrl(propertyId, addr, c, s);
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
  const SERVER_KEY = process.env.POSTMARK_SERVER_API_KEY;
  if (!SERVER_KEY) throw new Error("[EMAIL]: Failed to load `POSTMARK_SERVER_API_KEY`");

  const client = new ServerClient(SERVER_KEY);

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

    if (uniqueUsers.length === 0) {
      console.log(`[EMAIL ${msaName}]: No users with this MSA selected and notifications on`);
      return;
    }

    // Fetch a pool of recent properties (by recording date); we'll keep only those with Street View images
    const candidateProperties = await db
      .select({
        address: addresses.formattedStreetAddress,
        city: addresses.city,
        state: addresses.state,
        zipCode: addresses.zipCode,
        price: lastSales.price,
        saleDate: lastSales.saleDate,
        recordingDate: lastSales.recordingDate,
        propertyId: properties.id,
        status: properties.status,
        propertyType: properties.propertyType,
        bedsCount: structures.bedsCount,
        baths: structures.baths,
        livingAreaSqft: structures.livingAreaSqft,
        buyerCompanyName: buyerCompanies.companyName,
        sellerCompanyName: sellerCompanies.companyName,
      })
      .from(properties)
      .innerJoin(addresses, eq(properties.id, addresses.propertyId))
      .leftJoin(lastSales, eq(properties.id, lastSales.propertyId))
      .leftJoin(structures, eq(properties.id, structures.propertyId))
      .leftJoin(buyerCompanies, eq(properties.buyerId, buyerCompanies.id))
      .leftJoin(sellerCompanies, eq(properties.sellerId, sellerCompanies.id))
      .where(
        and(
          eq(properties.msa, msaName),
          sql`LOWER(COALESCE(${properties.status}, '')) != 'sold'`
        )
      )
      .orderBy(
        sql`CASE WHEN ${lastSales.recordingDate} IS NULL THEN 1 ELSE 0 END`,
        sql`CAST(${lastSales.recordingDate} AS DATE) DESC`
      )
      .limit(CANDIDATE_POOL_SIZE);

    if (candidateProperties.length === 0) {
      console.log(`[EMAIL ${msaName}]: No properties in database for this MSA, skipping send`);
      return;
    }

    const [syncState] = await db
      .select()
      .from(emailSyncState)
      .where(eq(emailSyncState.msa, msaName))
      .limit(1);

    // Build list of up to PROPERTY_COUNT_TARGET properties that have Street View images (skip others)
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
      buyer_name: string | null;
      seller_name: string | null;
    }> = [];
    let firstPropertyIdSent: string | null = null;

    for (const p of candidateProperties) {
      if (propertiesForTemplate.length >= PROPERTY_COUNT_TARGET) break;

      const address = p.address ?? "Unknown";
      const city = p.city ?? "Unknown";
      const state = p.state ?? "N/A";
      const image_url = await getStreetViewUrlIfAvailable(p.propertyId, address, city, state);
      if (image_url === null) continue;

      if (propertiesForTemplate.length === 0) {
        firstPropertyIdSent = p.propertyId;
      }

      const statusTags = getStatusTags(p.status ?? null).map((tag) => ({
        label: tag.label,
        bg: tag.bg,
        text: tag.text,
      }));
      const bedrooms = p.bedsCount != null ? String(p.bedsCount) : "—";
      const bathrooms = p.baths != null ? String(p.baths) : "—";
      const sqft = p.livingAreaSqft != null ? p.livingAreaSqft.toLocaleString("en-US") : "—";
      // Coerce to string or null so Postmark/Mustachio receives a plain value (section context works correctly)
      const rawBuyer = p.buyerCompanyName;
      const rawSeller = p.sellerCompanyName;
      const buyer_name = rawBuyer != null && String(rawBuyer).trim() !== "" ? String(rawBuyer).trim() : null;
      const seller_name = rawSeller != null && String(rawSeller).trim() !== "" ? String(rawSeller).trim() : null;

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
        buyer_name,
        seller_name,
      });
    }

    if (propertiesForTemplate.length === 0) {
      console.log(`[EMAIL ${msaName}]: No properties with Street View images found in pool of ${candidateProperties.length}, skipping send`);
      return;
    }

    // Skip send if the most recent property we would send was already sent last time
    if (syncState?.lastPropertyId != null && firstPropertyIdSent != null && syncState.lastPropertyId === firstPropertyIdSent) {
      console.log(`[EMAIL ${msaName}]: No new properties (last sent property id still first with image), skipping send`);
      return;
    }

    for (const user of uniqueUsers) {
      const emailTemplate = {
        From: "neil@arvfinance.com",
        To: user.email,
        TemplateAlias: `${process.env.POSTMARK_TEMPLATE_ALIAS}`,
        TemplateModel: {
          name: user.firstName,
          city: city,
          state: state,
          property_count: propertiesForTemplate.length,
          cta_url: "https://data.arvfinance.com/",
          year: "2026",
          company_name: "ARV Finance Inc.",
          properties: propertiesForTemplate,
        },
      };

      await client.sendEmailWithTemplate(emailTemplate);
      console.log(`[EMAIL ${msaName}]: Sent to ${user.email}`);
    }

    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    if (syncState) {
      await db
        .update(emailSyncState)
        .set({
          lastPropertyId: firstPropertyIdSent,
          lastEmailSent: today,
          lastEmailAt: now,
          updatedAt: now,
        })
        .where(eq(emailSyncState.msa, msaName));
    } else {
      await db.insert(emailSyncState).values({
        msa: msaName,
        lastPropertyId: firstPropertyIdSent,
        lastEmailSent: today,
        lastEmailAt: now,
        updatedAt: now,
      });
    }

    console.log(`[EMAIL ${msaName}]: Sent ${uniqueUsers.length} email(s), updated sync state`);
  } catch (error) {
    console.error(`[EMAIL ${msaName}]: Error -`, error);
    throw error;
  }
}
