import { Session, Registration, Avatar, EmailVerification } from '../controllers/auth/index.js';
import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from 'server/middleware/requireAuth.js';
import { forgotPasswordRateLimit } from 'server/middleware/forgotPasswordRateLimit.js';
import { createRateLimiter } from 'server/middleware/rateLimiter.js';

const router = Router();

// Resend caps abuse of the verification-email send. Per-IP window only — the authenticated
// request carries no body.email for the factory's email cooldown.
const resendVerificationRateLimit = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    maxPerIp: 5,
});

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
            cb(null, true);
        } else {
            cb(new Error('Only JPEG and PNG files are allowed'));
        }
    },
});

// Login
router.post('/login', Session.login);

// User logout
router.post('/logout', Session.logout);

// Get current user
router.get('/me', Session.me);

// Update current user profile
router.patch('/me', Session.updateProfile);

// Update current user notification preferences
router.patch('/me/notifications', Session.updateNotifications);

// Voluntary password change (authenticated; requires current password)
router.patch('/me/password', requireAuth, Session.changePassword);

// Complete a forced reset (authenticated; only valid when must_reset_password is set)
router.post('/me/complete-reset', requireAuth, Session.completeReset);

// Request a temporary password by email (public, rate-limited)
router.post('/forgot-password', forgotPasswordRateLimit, Session.forgotPassword);

// User signup
router.post('/signup', Registration.signup);

// Email verification: redeem a link (public) and resend (authenticated, rate-limited)
router.post('/verify-email', EmailVerification.verifyEmail);
router.post(
    '/resend-verification',
    requireAuth,
    resendVerificationRateLimit,
    EmailVerification.resendVerification,
);

// Avatar upload / removal (authenticated users only)
router.post('/me/avatar', requireAuth, upload.single('image'), Avatar.uploadAvatar);
router.delete('/me/avatar', requireAuth, Avatar.removeAvatar);

export default router;
