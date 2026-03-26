import { Router } from "express";
import { db } from "server/storage";
import { deals } from "@database/schemas/deals.schema";
import { addresses } from "@database/schemas/properties.schema";
import { users } from "@database/schemas/users.schema";
import { eq } from "drizzle-orm";
import {
  sendTemplateToUser,
  getRmEmailsByUserIds,
} from "server/services/postmark/email.services";
import { formatAddress } from "@shared/utils/formatAddress";

const DEFAULT_CONTACT_RECIPIENT = "justin@arvfinance.com";

const router = Router();

// POST /api/contact — Request contact info for a deal. Sends an email to the deal poster's relationship manager.
router.post("/", async (req, res) => {
  try {
    const { dealId } = req.body as { dealId?: number };
    if (!dealId || typeof dealId !== "number") {
      return res.status(400).json({ message: "dealId is required" });
    }

    // Get the requesting user's info from the session
    const [requestingUser] = await db
      .select({
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, req.session.userId!))
      .limit(1);

    if (!requestingUser) {
      return res.status(401).json({ message: "You must be logged in to request contact info" });
    }

    // Get the deal, the deal poster's info, and the property address
    const [deal] = await db
      .select({
        userId: deals.userId,
        propertyId: deals.propertyId,
      })
      .from(deals)
      .where(eq(deals.id, dealId))
      .limit(1);

    if (!deal) {
      return res.status(404).json({ message: "Deal not found" });
    }

    // Get the property address
    const [addr] = await db
      .select({
        address: addresses.formattedStreetAddress,
        city: addresses.city,
        state: addresses.state,
        zipCode: addresses.zipCode,
      })
      .from(addresses)
      .where(eq(addresses.propertyId, deal.propertyId))
      .limit(1);

    const fullAddress = [
      formatAddress(addr?.address) ?? "Unknown",
      formatAddress(addr?.city),
      addr?.state,
      addr?.zipCode,
    ]
      .filter(Boolean)
      .join(", ");

    // Resolve the deal poster's RM email as the recipient
    const rmMap = await getRmEmailsByUserIds([deal.userId]);
    const rmEmail = rmMap.get(deal.userId) ?? DEFAULT_CONTACT_RECIPIENT;

    // Send the email via Postmark (From is default, To is the RM)
    await sendTemplateToUser({
      toEmail: rmEmail,
      templateAlias: "request-contact-v1",
      templateModel: {
        firstName: requestingUser.firstName,
        lastName: requestingUser.lastName,
        address: fullAddress,
        email: requestingUser.email,
      },
    });

    return res.status(200).json({ message: "Contact request sent" });
  } catch (error) {
    console.error("[POST /api/contact] Error:", error);
    res.status(500).json({ message: "Error sending contact request" });
  }
});

export default router;
