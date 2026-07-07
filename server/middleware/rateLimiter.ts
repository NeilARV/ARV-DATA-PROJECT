import type { Request, Response, NextFunction } from 'express';
import { normalizeEmail } from 'server/utils/normalizeEmail';

// Reusable in-memory limiter factory, generalized from forgotPasswordRateLimit.ts. Guards
// against email bombing and repeat-lockout. Single-instance only (state is per-process and
// resets on restart) — acceptable for this app's threat model.

interface RateLimiterOptions {
    windowMs: number;
    maxPerIp: number;
    // When set, also enforces a per-email cooldown keyed off req.body.email.
    cooldownMs?: number;
}

const SWEEP_EVERY = 200;

export function createRateLimiter({ windowMs, maxPerIp, cooldownMs }: RateLimiterOptions) {
    const ipHits = new Map<string, number[]>();
    const emailLastRequest = new Map<string, number>();
    let requestsSinceSweep = 0;

    // Drops expired entries so the maps can't grow unbounded under IP/email rotation.
    function sweepExpired(now: number): void {
        ipHits.forEach((hits, ip) => {
            const fresh = hits.filter((t) => now - t < windowMs);
            if (fresh.length === 0) ipHits.delete(ip);
            else ipHits.set(ip, fresh);
        });
        if (cooldownMs) {
            emailLastRequest.forEach((t, email) => {
                if (now - t >= cooldownMs) emailLastRequest.delete(email);
            });
        }
    }

    return function rateLimiterMiddleware(req: Request, res: Response, next: NextFunction): void {
        // Tests run many requests from one address; limiters are exercised manually, not here.
        if (process.env.NODE_ENV === 'test') {
            next();
            return;
        }

        const now = Date.now();
        const ip = req.ip ?? 'unknown';

        if (++requestsSinceSweep >= SWEEP_EVERY) {
            requestsSinceSweep = 0;
            sweepExpired(now);
        }

        const recentHits = (ipHits.get(ip) ?? []).filter((t) => now - t < windowMs);
        if (recentHits.length >= maxPerIp) {
            res.status(429).json({
                message: 'Too many requests. Please try again in a few minutes.',
            });
            return;
        }
        recentHits.push(now);
        ipHits.set(ip, recentHits);

        if (cooldownMs) {
            const email =
                typeof req.body?.email === 'string' ? normalizeEmail(req.body.email) : null;
            if (email) {
                const last = emailLastRequest.get(email);
                if (last && now - last < cooldownMs) {
                    res.status(429).json({
                        message: 'A request was made recently. Please wait a moment and try again.',
                    });
                    return;
                }
                emailLastRequest.set(email, now);
            }
        }

        next();
    };
}
