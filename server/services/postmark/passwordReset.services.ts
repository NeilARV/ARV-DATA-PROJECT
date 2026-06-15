import { getDefaultFromEmail, sendPlainEmail } from './email.services.js';

const LOGIN_URL = 'https://data.arvfinance.com/login';

function buildHtml(tempPassword: string): string {
    return `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; line-height: 1.6;">
      <h2 style="margin: 0 0 16px;">Your ARV Finance password has been reset</h2>
      <p>Your ARV Finance account password has been reset to:</p>
      <p style="font-size: 18px; font-weight: bold; padding: 12px 16px; background: #f4f4f5; border-radius: 6px; display: inline-block; font-family: monospace;">
        ${tempPassword}
      </p>
      <p>Log in with this temporary password. You'll be asked to choose a new password right away.</p>
      <p style="margin: 24px 0;">
        <a href="${LOGIN_URL}" style="display: inline-block; padding: 12px 24px; background: #1a1a1a; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold;">
          Log In
        </a>
      </p>
      <p style="color: #6b7280; font-size: 13px;">If you did not request this, please contact us right away.</p>
    </div>
  `.trim();
}

function buildText(tempPassword: string): string {
    return [
        'Your ARV Finance account password has been reset to:',
        '',
        tempPassword,
        '',
        "Log in with this temporary password. You'll be asked to choose a new password right away.",
        '',
        `Log in: ${LOGIN_URL}`,
        '',
        'If you did not request this, please contact us right away.',
    ].join('\n');
}

// Emails a user their temporary password after a reset. The plaintext password is
// intentionally included; the account is flagged so the user must change it on next login.
export async function sendTempPasswordEmail(email: string, tempPassword: string): Promise<void> {
    await sendPlainEmail({
        From: getDefaultFromEmail(),
        To: email,
        Subject: 'Your ARV Finance password has been reset',
        HtmlBody: buildHtml(tempPassword),
        TextBody: buildText(tempPassword),
    });
}
