/**
 * One-off manual password reset.
 *
 * Emergency account-recovery tool. Sets a known temp password for a single user,
 * flags the account for forced reset, then emails the temp password via Postmark
 * so they can log in immediately and choose a new password.
 *
 * SECURITY NOTE: this emails a plaintext password and is intentionally crude.
 * Use only for emergency account recovery — the user is forced to change it on login.
 *
 * Usage:
 *   1. Set TARGET_EMAIL and TEMP_PASSWORD below.
 *   2. npm run reset:one-user
 */

import 'dotenv/config';
import { UserServices } from 'server/services/auth';
import { sendTempPasswordEmail } from 'server/services/postmark/passwordReset.services';

// ─── Config ─────────────────────────────────────────────────────────────────

const TARGET_EMAIL: string = '';
const TEMP_PASSWORD: string = '';

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

    await sendTempPasswordEmail(email, TEMP_PASSWORD);

    console.log(`[reset-one-user] Notification email sent to ${email}.`);
}

main()
    .catch((err) => {
        console.error('[reset-one-user] Fatal error:', err);
        process.exit(1);
    })
    .finally(() => process.exit(0));
