/**
 * One-off manual password reset.
 *
 * Temporary stopgap until self-serve password reset/change ships. Sets a known
 * temp password for a single user, then emails it to them via Postmark so they
 * can log in immediately.
 *
 * SECURITY NOTE: this emails a plaintext password and is intentionally crude.
 * Use only for emergency account recovery, then have the user change it ASAP.
 *
 * Usage:
 *   1. Set TARGET_EMAIL and TEMP_PASSWORD below.
 *   2. npm run reset:one-user
 */

import 'dotenv/config';
import { UserServices } from 'server/services/auth';
import { getDefaultFromEmail, sendPlainEmail } from 'server/services/postmark/email.services';

// ─── Config ─────────────────────────────────────────────────────────────────

const TARGET_EMAIL: string = '';
const TEMP_PASSWORD: string = '';

// ─── Email template ───────────────────────────────────────────────────────────

function buildHtml(tempPassword: string): string {
    return `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; line-height: 1.6;">
      <h2 style="margin: 0 0 16px;">Your ARV Finance password has been reset</h2>
      <p>Your ARV Finance account password has been reset to:</p>
      <p style="font-size: 18px; font-weight: bold; padding: 12px 16px; background: #f4f4f5; border-radius: 6px; display: inline-block; font-family: monospace;">
        ${tempPassword}
      </p>
      <p>Please log in with this temporary password. We recommend updating it as soon as password changes are available.</p>
      <p style="margin: 24px 0;">
        <a href="https://data.arvfinance.com/" style="display: inline-block; padding: 12px 24px; background: #1a1a1a; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold;">
          Log In
        </a>
      </p>
    </div>
  `.trim();
}

function buildText(tempPassword: string): string {
    return [
        'Your ARV Finance account password has been reset to:',
        '',
        tempPassword,
        '',
        'Please log in with this temporary password. We recommend updating it as soon as password changes are available.',
        '',
        'Visit ARV Data: https://data.arvfinance.com/',
        '',
        'If you did not request this, please contact us right away.',
    ].join('\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    if (!TARGET_EMAIL || !TEMP_PASSWORD) {
        console.error('[reset-one-user] Set TARGET_EMAIL and TEMP_PASSWORD before running.');
        process.exit(1);
    }

    const email = TARGET_EMAIL.toLowerCase().trim();

    console.log(`[reset-one-user] Resetting password for ${email}...`);

    const updatedUser = await UserServices.resetUserPassword(email, TEMP_PASSWORD);

    if (!updatedUser) {
        console.error(`[reset-one-user] No user found with email ${email}. Nothing changed.`);
        process.exit(1);
    }

    console.log(`[reset-one-user] Password updated for user ${updatedUser.id}.`);

    await sendPlainEmail({
        From: getDefaultFromEmail(),
        To: email,
        Subject: 'Your ARV Finance password has been reset',
        HtmlBody: buildHtml(TEMP_PASSWORD),
        TextBody: buildText(TEMP_PASSWORD),
    });

    console.log(`[reset-one-user] Notification email sent to ${email}.`);
}

main()
    .catch((err) => {
        console.error('[reset-one-user] Fatal error:', err);
        process.exit(1);
    })
    .finally(() => process.exit(0));
