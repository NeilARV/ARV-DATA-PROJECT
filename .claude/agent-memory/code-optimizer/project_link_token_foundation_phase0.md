---
name: link-token-foundation-phase0
description: auth_tokens single-use token system (Phase 0) — consumeToken is the race-safe atomic redeem; rateLimiter factory generalizes forgotPasswordRateLimit but isn't wired in yet
metadata:
  type: project
---

Phase-0 "link-token foundation" landed as a reusable secure-token system that email verification, password reset, and invites will build on.

Key invariants to preserve in future reviews:
- `server/services/auth/tokens.services.ts` `consumeToken` MUST stay a single atomic `UPDATE ... WHERE hash AND type AND usedAt IS NULL AND expiresAt > now() RETURNING *`. Splitting the check and the mark into two statements reintroduces a double-redeem race. Only the SHA-256 hash is stored — raw token must never be persisted or logged.
- `expires_at`/`used_at` are `timestamptz`; expiry uses `gt(expiresAt, sql\`now()\`)`. Changing the column to non-tz `timestamp` would silently break expiry.
- `server/middleware/rateLimiter.ts` (`createRateLimiter`) is a faithful generalization of the still-present `forgotPasswordRateLimit.ts`. As of 2026-06-16 the factory has no consumers.

**Why:** These are new uncommitted foundation files on main; the consuming flows ship later, so the pieces sit unused for now by design.

**How to apply:** When the first consumer flow ships, expect (a) `forgotPasswordRateLimit.ts` to be replaced by `createRateLimiter` and deleted to avoid two drifting copies, and (b) the [[link-token-html-builder-unescaped]] escaping gap to be fixed before any user-controlled email field flows through `sendLinkEmail`.
