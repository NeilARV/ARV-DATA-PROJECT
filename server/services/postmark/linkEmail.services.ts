import { getDefaultFromEmail, sendPlainEmail } from './email.services.js';

interface SendLinkEmailParams {
    to: string;
    // Auth/system emails default to the platform sender (not the recipient's RM).
    from?: string;
    subject: string;
    heading: string;
    bodyLines: string[];
    ctaLabel: string;
    url: string;
    footerNote?: string;
}

// Escape before interpolating into HTML — callers (e.g. invites) may pass user-controlled
// text/URLs, so this builder must never emit them raw.
function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function buildHtml({ heading, bodyLines, ctaLabel, url, footerNote }: SendLinkEmailParams): string {
    const paragraphs = bodyLines.map((line) => `<p>${escapeHtml(line)}</p>`).join('\n      ');
    const footer = footerNote
        ? `<p style="color: #6b7280; font-size: 13px;">${escapeHtml(footerNote)}</p>`
        : '';

    return `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; line-height: 1.6;">
      <h2 style="margin: 0 0 16px;">${escapeHtml(heading)}</h2>
      ${paragraphs}
      <p style="margin: 24px 0;">
        <a href="${escapeHtml(url)}" style="display: inline-block; padding: 12px 24px; background: #1a1a1a; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold;">
          ${escapeHtml(ctaLabel)}
        </a>
      </p>
      ${footer}
    </div>
  `.trim();
}

function buildText({ heading, bodyLines, ctaLabel, url, footerNote }: SendLinkEmailParams): string {
    const lines = [heading, '', ...bodyLines, '', `${ctaLabel}: ${url}`];
    if (footerNote) lines.push('', footerNote);
    return lines.join('\n');
}

// One builder/sender for every link email (verification, reset, invite).
export async function sendLinkEmail(params: SendLinkEmailParams): Promise<void> {
    await sendPlainEmail({
        From: params.from ?? getDefaultFromEmail(),
        To: params.to,
        Subject: params.subject,
        HtmlBody: buildHtml(params),
        TextBody: buildText(params),
    });
}
