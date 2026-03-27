import { Router } from "express";
import { contactMessageSchema } from "@database/validation/contactMessages.validation";
import {
  sendPlainEmail,
  getDefaultFromEmail,
  getConfirmedSenders,
  getRmEmailsByUserIds,
  resolveFromAddress,
} from "server/services/postmark/email.services";

const DEFAULT_CONTACT = process.env.DEFAULT_CONTACT_RECIPIENT || "justin@arvfinance.com";

const router = Router();

// POST /api/contact — Submit a contact message. Emails the user's RM (or default contact).
router.post("/", async (req, res) => {
  try {
    const validation = contactMessageSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        message: "Invalid form data",
        errors: validation.error.errors,
      });
    }

    const { firstName, lastName, email, subject, message } = validation.data;
    const userId: string | null = req.session.userId ?? null;

    // Determine recipient: user's RM if logged in and has one, otherwise default
    let recipientEmail = DEFAULT_CONTACT;
    let fromAddress = getDefaultFromEmail();

    if (userId) {
      const rmMap = await getRmEmailsByUserIds([userId]);
      const rmEmail = rmMap.get(userId);
      if (rmEmail) {
        recipientEmail = rmEmail;
        const senders = await getConfirmedSenders();
        fromAddress = resolveFromAddress(senders, rmEmail);
      }
    }

    const htmlBody = `
<p><strong>From:</strong> ${firstName} ${lastName} | ${email}</p>
<p><strong>Subject:</strong> ${subject}</p>
<hr />
<p>${message.replace(/\n/g, "<br />")}</p>
    `.trim();

    const textBody = `New Contact Message\n\nFrom: ${firstName} ${lastName} (${email})\nSubject: ${subject}\n\n${message}`;

    await sendPlainEmail({
      From: fromAddress,
      To: recipientEmail,
      Subject: `[Contact] ${subject} — ${firstName} ${lastName}`,
      HtmlBody: htmlBody,
      TextBody: textBody,
      ReplyTo: email,
    });

    return res.status(200).json({ message: "Contact message sent" });
  } catch (error) {
    console.error("[POST /api/contact] Error:", error);
    res.status(500).json({ message: "Error sending contact message" });
  }
});

export default router;
