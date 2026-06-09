import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IncomingMessage } from 'http';
import type { Store, SessionData } from 'express-session';
import { sign } from 'cookie-signature';

vi.mock('server/middleware/requireMastermind', () => ({
    isMastermindEligible: vi.fn(),
}));

import { isMastermindEligible } from 'server/middleware/requireMastermind';
import { authenticateUpgrade } from 'server/websocket/auth';

const SECRET = 'test-secret'; // matches vitest.config.ts env.SESSION_SECRET

function reqWithCookie(cookie?: string): IncomingMessage {
    return { headers: cookie ? { cookie } : {} } as IncomingMessage;
}

function signedCookie(sid: string): string {
    return `connect.sid=${encodeURIComponent('s:' + sign(sid, SECRET))}`;
}

function storeReturning(session: Partial<SessionData> | null): Store {
    return {
        get: (_sid: string, cb: (err: unknown, session?: SessionData | null) => void) =>
            cb(null, session as SessionData | null),
    } as unknown as Store;
}

beforeEach(() => {
    vi.mocked(isMastermindEligible).mockReset();
});

describe('authenticateUpgrade', () => {
    it('returns the userId for a valid, eligible session', async () => {
        vi.mocked(isMastermindEligible).mockResolvedValue(true);
        const result = await authenticateUpgrade(
            reqWithCookie(signedCookie('sid-1')),
            storeReturning({ userId: 'user-1' }),
        );
        expect(result).toBe('user-1');
    });

    it('returns null when there is no cookie', async () => {
        const result = await authenticateUpgrade(reqWithCookie(), storeReturning({ userId: 'x' }));
        expect(result).toBeNull();
    });

    it('returns null when the cookie signature is invalid', async () => {
        const tampered = 'connect.sid=' + encodeURIComponent('s:sid-1.not-a-real-signature');
        const result = await authenticateUpgrade(
            reqWithCookie(tampered),
            storeReturning({ userId: 'user-1' }),
        );
        expect(result).toBeNull();
    });

    it('returns null when the session is not found', async () => {
        const result = await authenticateUpgrade(
            reqWithCookie(signedCookie('sid-1')),
            storeReturning(null),
        );
        expect(result).toBeNull();
    });

    it('returns null when the session has no userId', async () => {
        const result = await authenticateUpgrade(
            reqWithCookie(signedCookie('sid-1')),
            storeReturning({}),
        );
        expect(result).toBeNull();
    });

    it('returns null when the user is not Mastermind-eligible', async () => {
        vi.mocked(isMastermindEligible).mockResolvedValue(false);
        const result = await authenticateUpgrade(
            reqWithCookie(signedCookie('sid-1')),
            storeReturning({ userId: 'user-1' }),
        );
        expect(result).toBeNull();
    });
});
