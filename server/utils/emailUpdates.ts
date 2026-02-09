import { ServerClient } from "postmark";
import { db } from "server/storage";
import { users } from "../../database/schemas/users.schema";
import { msas, userMsaSubscriptions } from "../../database/schemas/msas.schema";
import { properties, addresses, lastSales } from "../../database/schemas/properties.schema";
import { eq, desc, and } from "drizzle-orm";
import { StreetviewServices } from "server/services/properties";

const PROPERTY_COUNT = 3;

const MOCK_IMAGE_URLS = [
  "https://images.unsplash.com/photo-1560184897-ae75f418493e",
  "https://images.unsplash.com/photo-1572120360610-d971b9d7767c",
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c",
];

const STREETVIEW_SIZE = "600x400";
const APP_BASE_URL = process.env.APP_URL || "https://data.arvfinance.com";

function formatPrice(price: string | null | undefined): string {
  if (price == null) return "N/A";
  const num = parseFloat(price);
  if (isNaN(num)) return "N/A";
  return num.toLocaleString("en-US", { maximumFractionDigits: 0 });
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

async function getPropertyImageUrl(
  propertyId: string,
  address: string,
  city: string,
  state: string,
  mockFallback: string
): Promise<string> {
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
    console.warn(`[EMAIL ${address}]: Street View lookup failed:`, err);
  }

  return mockFallback;
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

    // 3 most recent properties for this MSA
    const recentProperties = await db
      .select({
        address: addresses.formattedStreetAddress,
        city: addresses.city,
        state: addresses.state,
        price: lastSales.price,
        propertyId: properties.id,
      })
      .from(properties)
      .innerJoin(addresses, eq(properties.id, addresses.propertyId))
      .leftJoin(lastSales, eq(properties.id, lastSales.propertyId))
      .where(eq(properties.msa, msaName))
      .orderBy(desc(properties.createdAt))
      .limit(PROPERTY_COUNT);

    if (recentProperties.length === 0) {
      console.log(`[EMAIL ${msaName}]: No properties in database for this MSA, skipping send`);
      return;
    }

    const propertiesForTemplate = await Promise.all(
      recentProperties.map(async (p, i) => {
        const address = p.address ?? "Unknown";
        const city = p.city ?? "Unknown";
        const state = p.state ?? "N/A";
        const image_url = await getPropertyImageUrl(
          p.propertyId,
          address,
          city,
          state,
          MOCK_IMAGE_URLS[i % MOCK_IMAGE_URLS.length]
        );
        return {
          address,
          city,
          state,
          price: formatPrice(p.price?.toString()),
          image_url,
        };
      })
    );

    for (const user of uniqueUsers) {
      const emailTemplate = {
        From: "justin@arvfinance.com",
        To: user.email,
        TemplateAlias: "test-template-1",
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

    console.log(`[EMAIL ${msaName}]: Sent ${uniqueUsers.length} email(s)`);
  } catch (error) {
    console.error(`[EMAIL ${msaName}]: Error -`, error);
    throw error;
  }
}
