import { Router } from "express";
import { db } from "server/storage";
import { deals } from "@database/schemas/deals.schema";
import { addresses } from "@database/schemas/properties.schema";
import { users, userRelationshipManagers } from "@database/schemas/users.schema";
import { eq } from "drizzle-orm";
import {
  sendEmailWithTemplate,
  getDefaultFromEmail,
} from "server/services/postmark/email.services";
import { formatAddress } from "@shared/utils/formatAddress";

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

    // Get the relationship manager of the deal poster
    const [rmRow] = await db
      .select({ rmId: userRelationshipManagers.relationshipManagerId })
      .from(userRelationshipManagers)
      .where(eq(userRelationshipManagers.userId, deal.userId))
      .limit(1);

    let rmEmail = "justin@arvfinance.com";
    if (rmRow) {
      const [rmUser] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, rmRow.rmId))
        .limit(1);
      if (rmUser?.email) {
        rmEmail = rmUser.email;
      }
    }

    // Send the email via Postmark
    await sendEmailWithTemplate({
      From: getDefaultFromEmail(),
      To: rmEmail,
      TemplateAlias: "request-contact-v1",
      TemplateModel: {
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
