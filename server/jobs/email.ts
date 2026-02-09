import { ServerClient } from "postmark";
import { db } from "server/storage";
import { users } from "../../database/schemas/users.schema";
import { properties, addresses, lastSales } from "../../database/schemas/properties.schema";
import { eq, desc } from "drizzle-orm";
import { StreetviewServices } from "server/services/properties";

// Fallback image URLs when Street View is not available for a property
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

/**
 * Gets a Street View image URL for a property. Pre-fetches to warm cache and verify availability.
 * Falls back to mock image if Street View is not available.
 */
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
    console.warn(`[EMAIL]: Street View lookup failed for ${addr}, ${c}, ${s}:`, err);
  }

  return mockFallback;
}

export async function EmailUsers() {
  const SERVER_KEY = process.env.POSTMARK_SERVER_API_KEY;

  if (!SERVER_KEY) throw new Error("[EMAIL]: Failed to load `SERVER_KEY`");

  const client = new ServerClient(SERVER_KEY);

  try {
    // Get users with notifications enabled
    const usersToEmail = await db
      .select({
        firstName: users.firstName,
        email: users.email,
      })
      .from(users)
      .where(eq(users.notifications, true));

    if (usersToEmail.length === 0) {
      console.log("[EMAIL]: No users with notifications enabled");
      return;
    }

    // Get 3 most recent properties with address, city, state, price
    const recentProperties = await db
      .select({
        address: addresses.formattedStreetAddress,
        city: addresses.city,
        state: addresses.state,
        price: lastSales.price,
        propertyId: properties.id,
        msa: properties.msa,
      })
      .from(properties)
      .innerJoin(addresses, eq(properties.id, addresses.propertyId))
      .leftJoin(lastSales, eq(properties.id, lastSales.propertyId))
      .orderBy(desc(properties.createdAt))
      .limit(3);

    // Skip sending if no properties in database
    if (recentProperties.length === 0) {
      console.log("[EMAIL]: No properties in database, skipping send");
      return;
    }

    // Build property objects for template - fetch Street View images, fallback to mock if unavailable
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

    // Send email to each user
    for (const user of usersToEmail) {
      const emailTemplate = {
        From: "justin@arvfinance.com",
        To: user.email,
        TemplateAlias: "test-template-1",
        TemplateModel: {
          name: user.firstName,
          city: "San Diego",
          state: "CA",
          property_count: propertiesForTemplate.length,
          cta_url: "https://data.arvfinance.com/",
          year: "2026",
          company_name: "ARV Finance Inc.",
          properties: propertiesForTemplate,
        },
      };

      await client.sendEmailWithTemplate(emailTemplate);
      console.log(`[EMAIL]: Sent to ${user.email}`);
    }

    console.log(`[EMAIL]: Successfully sent ${usersToEmail.length} email(s)`);
  } catch (error) {
    console.error(`[EMAIL]: Error sending email -`, error);
  }
}