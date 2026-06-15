import type { Request, Response, NextFunction } from 'express';

// Lightweight in-memory limiter for the public forgot-password endpoint. Guards against
// email bombing and repeat-lockout. Single-instance only (state is per-process and resets
// on restart) — acceptable for this app's threat model.

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_IP = 5;
const EMAIL_COOLDOWN_MS = 60 * 1000;

const ipHits = new Map<string, number[]>();
const emailLastRequest = new Map<string, number>();

const SWEEP_EVERY = 200;
let requestsSinceSweep = 0;

// Drops expired entries so the maps can't grow unbounded under IP/email rotation.
function sweepExpired(now: number): void {
    ipHits.forEach((hits, ip) => {
        const fresh = hits.filter((t) => now - t < WINDOW_MS);
        if (fresh.length === 0) ipHits.delete(ip);
        else ipHits.set(ip, fresh);
    });
    emailLastRequest.forEach((t, email) => {
        if (now - t >= EMAIL_COOLDOWN_MS) emailLastRequest.delete(email);
    });
}

export function forgotPasswordRateLimit(req: Request, res: Response, next: NextFunction): void {
    // Tests run many requests from one address; the limiter is exercised manually, not here.
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

    const recentHits = (ipHits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
    if (recentHits.length >= MAX_PER_IP) {
        res.status(429).json({ message: 'Too many requests. Please try again in a few minutes.' });
        return;
    }
    recentHits.push(now);
    ipHits.set(ip, recentHits);

    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : null;
    if (email) {
        const last = emailLastRequest.get(email);
        if (last && now - last < EMAIL_COOLDOWN_MS) {
            res.status(429).json({
                message: 'A reset was requested recently. Please wait a moment and try again.',
            });
            return;
        }
        emailLastRequest.set(email, now);
    }

    next();
}
