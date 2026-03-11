import { db } from "server/storage";
import { users, userRelationshipManagers, emailWhitelist } from "@database/schemas/users.schema";
import { msas, userMsaSubscriptions } from "@database/schemas/msas.schema";
import { properties, addresses, lastSales, structures } from "@database/schemas/properties.schema";
import { companies } from "@database/schemas/companies.schema";
import { emailSyncState } from "@database/schemas/sync.schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { StreetviewServices } from "server/services/properties";
import {
  listSenderSignatures,
  findSignatureByEmail,
  type PostmarkSenderSignature,
} from "server/services/postmark/senders.services";
import {
  sendEmailWithTemplate,
  getDefaultFromEmail,
} from "server/services/postmark/email.services";
import { formatAddress } from "@shared/utils/formatAddress";
import { formatCompanyName } from "@shared/utils/formatCompanyName";
import { formatPhoneNumber } from "@shared/utils/formatPhoneNumber";

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
  if (s === "wholesale") return [STATUS_TAG_STYLES.Wholesale, STATUS_TAG_STYLES.Renovating];
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

    // User subscriptions take priority over whitelist: only use email_whitelist for addresses that are NOT in the users table at all.
    // (If someone is both a user and on whitelist, we only send based on their user MSA subscriptions, never whitelist.)
    // Exclude in SQL so we don't rely on in-memory normalization; any email that exists in users is skipped for whitelist.
    const whitelistRows = await db
      .select({
        email: emailWhitelist.email,
        relationshipManagerId: emailWhitelist.relationshipManagerId,
      })
      .from(emailWhitelist)
      .innerJoin(msas, eq(emailWhitelist.msa, msas.id))
      .where(
        and(
          eq(msas.name, msaName),
          sql`NOT EXISTS (
            SELECT 1 FROM users
            WHERE LOWER(TRIM(users.email)) = LOWER(TRIM(${emailWhitelist.email}))
          )`
        )
      );

    const whitelistOnly = whitelistRows;

    // Unified recipient list: users first, then whitelist-only (no double-send)
    type Recipient = {
      email: string;
      firstName: string;
      source: "user";
      userId: string;
      relationshipManagerId?: string | null;
    } | {
      email: string;
      firstName: string;
      source: "whitelist";
      relationshipManagerId: string | null;
    };
    const recipients: Recipient[] = [
      ...uniqueUsers.map((u) => ({
        email: u.email,
        firstName: u.firstName ?? "there",
        source: "user" as const,
        userId: u.id,
        relationshipManagerId: undefined as string | null | undefined,
      })),
      ...whitelistOnly.map((w) => ({
        email: w.email ?? "",
        firstName: "there",
        source: "whitelist" as const,
        relationshipManagerId: w.relationshipManagerId ?? null,
      })),
    ];

    if (recipients.length === 0) {
      console.log(`[EMAIL ${msaName}]: No users or whitelist recipients for this MSA`);
      return;
    }

    const recipientUserIds = uniqueUsers.map((u) => u.id);

    // Each recipient can have 0 or 1 relationship manager. RM is a user; we need the RM's email to use as From.
    // user_relationship_managers: (user_id = recipient, relationship_manager_id = RM user id). Join users to get RM email.
    const relationshipManagerEmailByRecipientId = new Map<string, string>();
    if (recipientUserIds.length > 0) {
      const rmRows = await db
        .select({
          recipientUserId: userRelationshipManagers.userId,
          rmEmail: users.email,
        })
        .from(userRelationshipManagers)
        .innerJoin(users, eq(userRelationshipManagers.relationshipManagerId, users.id))
        .where(inArray(userRelationshipManagers.userId, recipientUserIds));
      for (const row of rmRows) {
        if (!relationshipManagerEmailByRecipientId.has(row.recipientUserId) && row.rmEmail) {
          relationshipManagerEmailByRecipientId.set(row.recipientUserId, row.rmEmail);
        }
      }
      console.log(`[EMAIL ${msaName}]: Found ${relationshipManagerEmailByRecipientId.size} recipient(s) with a relationship manager`);
    }

    // For whitelist-only recipients, RM is stored on email_whitelist.relationship_manager_id; look up RM email by that user id.
    const whitelistRmIds = Array.from(
      new Set(whitelistOnly.map((w) => w.relationshipManagerId).filter((id): id is string => Boolean(id)))
    );
    const relationshipManagerEmailByRmId = new Map<string, string>();
    if (whitelistRmIds.length > 0) {
      const rmUserRows = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(inArray(users.id, whitelistRmIds));
      for (const row of rmUserRows) {
        if (row.email) relationshipManagerEmailByRmId.set(row.id, row.email);
      }
    }

    // Postmark sender list: valid From = email in SenderSignatures with Confirmed === true. Fetch all pages.
    let confirmedSenders: PostmarkSenderSignature[] = [];
    try {
      if (process.env.POSTMARK_ACCOUNT_TOKEN) {
        const pageSize = 50;
        let offset = 0;
        let totalCount = 0;
        do {
          const res = await listSenderSignatures(pageSize, offset);
          const page = res.SenderSignatures ?? [];
          confirmedSenders = confirmedSenders.concat(page);
          totalCount = res.TotalCount ?? 0;
          offset += pageSize;
        } while (offset < totalCount);
      } else {
        console.warn(`[EMAIL ${msaName}]: POSTMARK_ACCOUNT_TOKEN not set; all emails will use default From`);
      }
    } catch (err) {
      console.warn(`[EMAIL ${msaName}]: Failed to fetch Postmark senders, using default From:`, err instanceof Error ? err.message : err);
    }
    console.log(`[EMAIL ${msaName}]: Postmark sender signatures loaded: ${confirmedSenders.length} (confirmed senders used for From)`);

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
        buyerContactName: buyerCompanies.contactName,
        buyerContactEmail: buyerCompanies.contactEmail,
        buyerPhone: buyerCompanies.phoneNumber,
        sellerCompanyName: sellerCompanies.companyName,
        sellerContactName: sellerCompanies.contactName,
        sellerContactEmail: sellerCompanies.contactEmail,
        sellerPhone: sellerCompanies.phoneNumber,
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
      buyer_company_name: string | null;
      buyer_contact_name: string | null;
      buyer_email: string | null;
      buyer_phone: string | null;
      seller_company_name: string | null;
      seller_contact_name: string | null;
      seller_email: string | null;
      seller_phone: string | null;
    }> = [];
    let firstPropertyIdSent: string | null = null;

    for (const p of candidateProperties) {
      if (propertiesForTemplate.length >= PROPERTY_COUNT_TARGET) break;

      const rawAddress = p.address ?? "Unknown";
      const rawCity = p.city ?? "Unknown";
      const state = p.state ?? "N/A";
      const image_url = await getStreetViewUrlIfAvailable(p.propertyId, rawAddress, rawCity, state);
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

    let sentCount = 0;
    const failedRecipients: string[] = [];

    
    for (const recipient of recipients) {

      let fromAddress = getDefaultFromEmail();
      const rmEmail =
        recipient.source === "user"
          ? relationshipManagerEmailByRecipientId.get(recipient.userId)
          : recipient.relationshipManagerId
            ? relationshipManagerEmailByRmId.get(recipient.relationshipManagerId)
            : undefined;
      if (rmEmail) {
        const signature = findSignatureByEmail(confirmedSenders, rmEmail);
        if (signature && signature.Confirmed === true) {
          fromAddress = signature.EmailAddress;
        }
      }

      const emailTemplate = {
        From: fromAddress,
        To: recipient.email,
        TemplateAlias: `${process.env.POSTMARK_TEMPLATE_ALIAS}`,
        TemplateModel: {
          name: recipient.firstName,
          city: city,
          state: state,
          property_count: propertiesForTemplate.length,
          cta_url: "https://data.arvfinance.com/",
          year: "2026",
          company_name: "ARV Finance Inc.",
          properties: propertiesForTemplate,
        },
      };

      try {
        await sendEmailWithTemplate(emailTemplate);
        sentCount++;
        console.log(`[EMAIL ${msaName}]: Sent to ${recipient.email} (${recipient.source})`);
      } catch (err) {
        failedRecipients.push(recipient.email);
        console.error(
          `[EMAIL ${msaName}]: Failed to send to ${recipient.email} (inactive/bounce/suppression) -`,
          err instanceof Error ? err.message : err
        );
      }
    }

    if (failedRecipients.length > 0) {
      console.warn(
        `[EMAIL ${msaName}]: ${failedRecipients.length} recipient(s) skipped (inactive): ${failedRecipients.join(", ")}`
      );
    }

    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    if (sentCount > 0) {
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
    }

    console.log(`[EMAIL ${msaName}]: Sent ${sentCount}/${recipients.length} email(s)${sentCount > 0 ? ", updated sync state" : ""}`);
  } catch (error) {
    console.error(`[EMAIL ${msaName}]: Error -`, error);
    throw error;
  }
}
