import { formatPhoneNumber } from '@shared/utils/formatPhoneNumber';
import {
    sendPlainEmail,
    getDefaultFromEmail,
    getConfirmedSenders,
    getRmEmailsByUserIds,
    resolveFromAddress,
} from 'server/services/postmark/email.services';
import { escapeHtml } from 'server/utils/escapeHtml';
import type { ContactMessageFormData } from '@database/validation/contactMessages.validation';

// Recipient when the submitter is anonymous or has no relationship manager.
const DEFAULT_CONTACT_RECIPIENT = process.env.DEFAULT_CONTACT_RECIPIENT ?? 'justin@arvfinance.com';

/**
 * Email a contact-form submission to the appropriate recipient.
 *
 * A logged-in submitter who has a relationship manager routes to that RM, and the RM
 * is used as the From address when they are a confirmed Postmark sender; everyone else
 * routes to the default contact address from the default From address.
 * @param submission validated contact-form fields
 * @param userId the submitter's session user id, or null when anonymous
 * Side effect: sends one transactional email via Postmark.
 */
export async function sendContactMessage(
    submission: ContactMessageFormData,
    userId: string | null,
): Promise<void> {
    const { firstName, lastName, email, phone, subject, message } = submission;
    const formattedPhone = formatPhoneNumber(phone);

    // Default recipient/sender; overridden below when the submitter has an RM.
    let recipientEmail = DEFAULT_CONTACT_RECIPIENT;
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

    // Escape every interpolated field before it enters the HTML body. Escape the
    // message first, then convert newlines to <br /> so the breaks survive escaping.
    const htmlBody = `
<p><strong>From:</strong> ${escapeHtml(firstName)} ${escapeHtml(lastName)} | ${escapeHtml(email)} | ${escapeHtml(formattedPhone)}</p>
<p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
<hr />
<p>${escapeHtml(message).replace(/\n/g, '<br />')}</p>
    `.trim();

    const textBody = `New Contact Message\n\nFrom: ${firstName} ${lastName}\nEmail: ${email}\nPhone: ${formattedPhone}\nSubject: ${subject}\n\n${message}`;

    await sendPlainEmail({
        From: fromAddress,
        To: recipientEmail,
        Subject: `[Contact] ${subject} — ${firstName} ${lastName}`,
        HtmlBody: htmlBody,
        TextBody: textBody,
        ReplyTo: email,
    });
}
