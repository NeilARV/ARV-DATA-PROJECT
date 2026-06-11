import type { IncomingMessage } from 'http';
import type { Store, SessionData } from 'express-session';
import { parse as parseCookie } from 'cookie';
import { unsign } from 'cookie-signature';
import { isMastermindEligible } from 'server/middleware/requireMastermind';

// express-session's default cookie name; the app does not override it (see server/app.ts).
const SESSION_COOKIE_NAME = 'connect.sid';

// Recovers the raw session id from the signed `connect.sid` cookie, the same way
// express-session does on a normal request.
function getSessionId(req: IncomingMessage, secret: string): string | null {
    const header = req.headers.cookie;
    if (!header) return null;

    const raw = parseCookie(header)[SESSION_COOKIE_NAME];
    if (!raw || !raw.startsWith('s:')) return null;

    const unsigned = unsign(raw.slice(2), secret);
    return unsigned === false ? null : unsigned;
}

function loadSession(store: Store, sid: string): Promise<SessionData | null> {
    return new Promise((resolve) => {
        store.get(sid, (err, session) => {
            if (err || !session) return resolve(null);
            resolve(session as SessionData);
        });
    });
}

// Authenticates a WebSocket upgrade by reusing the existing session + eligibility rules.
// Returns the userId on success, or null to reject the upgrade.
export async function authenticateUpgrade(
    req: IncomingMessage,
    store: Store,
): Promise<string | null> {
    const secret = process.env.SESSION_SECRET;
    if (!secret) return null;

    const sid = getSessionId(req, secret);
    if (!sid) return null;

    const session = await loadSession(store, sid);
    const userId = session?.userId;
    if (!userId) return null;

    const eligible = await isMastermindEligible(userId);
    return eligible ? userId : null;
}
