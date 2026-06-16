import { pgTable, uuid, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users.schema';

export const AUTH_TOKEN_TYPES = ['email_verification', 'password_reset', 'invite'] as const;
export type AuthTokenType = (typeof AUTH_TOKEN_TYPES)[number];

// Unified store for secure, expiring, single-use link tokens (email verification,
// password reset, invites). Only the SHA-256 hash of the raw token is stored — a DB
// leak must not yield live links.
export const authTokens = pgTable(
    'auth_tokens',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        type: text('type').$type<AuthTokenType>().notNull(),
        tokenHash: text('token_hash').notNull(),
        // Null for invites to a not-yet-existing user
        userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
        email: text('email'),
        metadata: jsonb('metadata').$type<Record<string, unknown>>(),
        expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
        usedAt: timestamp('used_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        index('idx_auth_tokens_token_hash').on(t.tokenHash),
        index('idx_auth_tokens_type_user').on(t.type, t.userId),
    ],
);

export type AuthToken = typeof authTokens.$inferSelect;
export type InsertAuthToken = typeof authTokens.$inferInsert;
