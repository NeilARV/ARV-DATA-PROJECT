import {
    getEmailRecipientsByUserIds,
    getDefaultFromEmail,
    sendEmailWithTemplate,
} from 'server/services/postmark/email.services';
import { POSTMARK_TEMPLATES } from 'server/services/postmark/templates';
import { htmlToPlainText } from 'server/utils/sanitizeHtml';
import type { CreatedNotification } from 'server/services/notifications/notifications.services';

const MESSAGE_TEXT_MAX_LENGTH = 500;
const EMAIL_COMPANY_NAME = 'ARV Finance Inc.';

function normalizeBaseUrl(raw: string | undefined): string {
    const url = raw || 'https://data.arvfinance.com';
    return /^https?:\/\//i.test(url) ? url : `http://${url}`;
}

function toMessageText(html: string): string {
    const text = htmlToPlainText(html);
    if (text.length <= MESSAGE_TEXT_MAX_LENGTH) return text;
    return `${text.slice(0, MESSAGE_TEXT_MAX_LENGTH).trimEnd()}…`;
}

// Only direct @user mentions and @announcement broadcasts trigger an email; @channel stays
// in-app only (it would blast the whole community on every send).
function isEmailableType(type: CreatedNotification['type']): boolean {
    return type === 'mention' || type === 'announcement';
}

// Fans out the new Mastermind notification email for a freshly created message. Consumes the
// already-scoped fan-out from createMentionNotifications (admin-only channels narrowed, actor
// excluded, deduped) so the audience is never re-derived here. Fire-and-forget from the caller:
// failures are logged and never affect the delivered message.
export async function sendMastermindMentionEmails({
    created,
    messageHtml,
}: {
    created: CreatedNotification[];
    messageHtml: string;
}): Promise<void> {
    const emailable = created.filter((n) => isEmailableType(n.type));
    if (emailable.length === 0) return;

    const recipients = await getEmailRecipientsByUserIds(emailable.map((n) => n.recipientUserId));
    if (recipients.length === 0) return;

    // Every row shares one actor/channel/message — derive the shared template fields once.
    const context = emailable[0];
    const senderName =
        `${context.actorFirstName ?? ''} ${context.actorLastName ?? ''}`.trim() || 'A member';
    const baseUrl = normalizeBaseUrl(process.env.APP_URL);
    const messageUrl =
        context.channelName && context.messageId
            ? `${baseUrl}/mastermind/${encodeURIComponent(context.channelName)}?m=${context.messageId}`
            : `${baseUrl}/mastermind`;
    const messageText = toMessageText(messageHtml);
    const year = String(new Date().getFullYear());
    const fromAddress = getDefaultFromEmail();

    // Each recipient's framing follows their own notification type, so a message that both
    // @mentions a user and @announces gets the right headline per email. Relies on
    // createMentionNotifications emitting exactly one row per user (it dedups by recipient).
    const typeByUserId = new Map(emailable.map((n) => [n.recipientUserId, n.type]));

    for (const recipient of recipients) {
        const isAnnouncement = typeByUserId.get(recipient.userId) === 'announcement';
        try {
            await sendEmailWithTemplate({
                From: fromAddress,
                To: recipient.email,
                TemplateAlias: POSTMARK_TEMPLATES.MASTERMIND_MENTION,
                TemplateModel: {
                    name: senderName,
                    // The "#" is baked into the value, not the template — Postmark's Mustache
                    // engine mis-parses a "#" glued directly to "{{ }}" and drops the variable.
                    channel_name: context.channelName ? `#${context.channelName}` : 'a channel',
                    message_text: messageText,
                    message_url: messageUrl,
                    is_announcement: isAnnouncement,
                    year,
                    company_name: EMAIL_COMPANY_NAME,
                },
            });
        } catch (err) {
            console.error(
                `[MASTERMIND EMAIL] Failed to send to ${recipient.email}:`,
                err instanceof Error ? err.message : err,
            );
        }
    }
}
