import crypto from 'crypto';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { db } from 'server/storage';
import { authTokens } from '@database/schemas/authTokens.schema';
import type { AuthToken, AuthTokenType } from '@database/schemas/authTokens.schema';

const RAW_TOKEN_BYTES = 32;

// Raw token lives only in the email URL and the inbound request — never logged, never stored.
export function generateRawToken(): string {
    return crypto.randomBytes(RAW_TOKEN_BYTES).toString('base64url');
}

export function hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
}

interface CreateTokenParams {
    type: AuthTokenType;
    userId?: string;
    email?: string;
    metadata?: Record<string, unknown>;
    ttlMs: number;
}

// Inserts the hash and returns the raw token for the caller to embed in a link.
export async function createToken({
    type,
    userId,
    email,
    metadata,
    ttlMs,
}: CreateTokenParams): Promise<string> {
    const rawToken = generateRawToken();

    await db.insert(authTokens).values({
        type,
        tokenHash: hashToken(rawToken),
        userId: userId ?? null,
        email: email ?? null,
        metadata: metadata ?? null,
        expiresAt: new Date(Date.now() + ttlMs),
    });

    return rawToken;
}

interface ConsumeTokenParams {
    type: AuthTokenType;
    rawToken: string;
}

// Single atomic UPDATE: match-by-hash + correct type + unused + unexpired, marking used in
// one statement. No race can redeem one link twice. Returns the row on success, else null.
export async function consumeToken({ type, rawToken }: ConsumeTokenParams): Promise<AuthToken | null> {
    const [consumed] = await db
        .update(authTokens)
        .set({ usedAt: new Date() })
        .where(
            and(
                eq(authTokens.tokenHash, hashToken(rawToken)),
                eq(authTokens.type, type),
                isNull(authTokens.usedAt),
                gt(authTokens.expiresAt, sql`now()`),
            ),
        )
        .returning();

    return consumed ?? null;
}

interface InvalidateActiveTokensParams {
    type: AuthTokenType;
    userId: string;
}

// Kills prior live tokens for a user (e.g. on resend) so only the newest link works.
export async function invalidateActiveTokens({
    type,
    userId,
}: InvalidateActiveTokensParams): Promise<void> {
    await db
        .update(authTokens)
        .set({ usedAt: new Date() })
        .where(
            and(
                eq(authTokens.type, type),
                eq(authTokens.userId, userId),
                isNull(authTokens.usedAt),
            ),
        );
}
