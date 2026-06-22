import { createToken, consumeToken, invalidateActiveTokens } from './tokens.services.js';
import { markEmailVerified } from './user.services.js';
import { sendLinkEmail } from '../postmark/linkEmail.services.js';

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const VERIFY_EMAIL_URL = 'https://data.arvfinance.com/verify-email';

// Invalidates any prior live verification token, mints a fresh one, and emails the link.
// Called on signup and on resend.
export async function issueVerificationEmail(userId: string, email: string): Promise<void> {
    await invalidateActiveTokens({ type: 'email_verification', userId });

    const rawToken = await createToken({
        type: 'email_verification',
        userId,
        ttlMs: VERIFICATION_TTL_MS,
    });

    const url = `${VERIFY_EMAIL_URL}?token=${encodeURIComponent(rawToken)}`;

    await sendLinkEmail({
        to: email,
        subject: 'Verify your ARV Finance email',
        heading: 'Confirm your email address',
        bodyLines: [
            'Welcome to ARV Finance! Confirm your email address so we can keep your account secure and make sure important updates reach your inbox.',
            'This link expires in 24 hours.',
        ],
        ctaLabel: 'Verify Email',
        url,
        footerNote: "If you didn't create an ARV Finance account, you can safely ignore this email.",
    });
}

type VerifyEmailResult = 'verified' | 'invalid';

// Consumes the token (atomic single-use) and stamps the user verified. A consumed/expired/
// unknown token yields 'invalid'. Stamping is idempotent for an already-verified user.
export async function verifyEmailToken(rawToken: string): Promise<VerifyEmailResult> {
    const token = await consumeToken({ type: 'email_verification', rawToken });
    if (!token || !token.userId) return 'invalid';

    await markEmailVerified(token.userId);
    return 'verified';
}
