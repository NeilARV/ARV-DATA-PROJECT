import { Request, Response } from 'express';
import { verifyEmailSchema } from '@database/validation/authTokens.validation';
import { EmailVerificationServices, UserServices } from 'server/services/auth';

// Public: redeems a verification link. The raw token is the proof of inbox control, so no
// session is required. Idempotent for an already-verified user with a still-valid token.
export async function verifyEmail(req: Request, res: Response): Promise<void> {
    try {
        const validation = verifyEmailSchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({
                message: 'Invalid verification request',
                errors: validation.error.errors,
            });
            return;
        }

        const result = await EmailVerificationServices.verifyEmailToken(validation.data.token);
        if (result === 'invalid') {
            res.status(400).json({ message: 'This verification link is invalid or has expired.' });
            return;
        }

        res.json({ success: true });
    } catch (error) {
        console.error('verifyEmail error:', error);
        res.status(500).json({ message: 'Error verifying email' });
    }
}

// Authenticated + rate-limited: re-sends the verification link to the current user.
// Already-verified is a no-op success so the client can call it safely.
export async function resendVerification(req: Request, res: Response): Promise<void> {
    try {
        if (!req.session.userId) {
            res.status(401).json({ message: 'Unauthorized' });
            return;
        }

        const [user] = await UserServices.getUserById(req.session.userId);
        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        if (user.emailVerifiedAt) {
            res.json({ success: true, alreadyVerified: true });
            return;
        }

        await EmailVerificationServices.issueVerificationEmail(user.id, user.email);
        res.json({ success: true });
    } catch (error) {
        console.error('resendVerification error:', error);
        res.status(500).json({ message: 'Error sending verification email' });
    }
}
