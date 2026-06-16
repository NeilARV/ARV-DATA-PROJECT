# Link-Token System: Email Verification, Invite Links & Password Reset

**Status:** Design / planning. No code written yet.
**Author:** Planning session, 2026-06-16.

This document describes a single, reusable **secure link-token system** and the three
features built on top of it. The features ship **in sequence**, each verified before the
next begins:

1. **Phase 0 — Foundation** (built once, shared by all three)
2. **Phase 1 — Email verification** (soft gate)
3. **Phase 2 — Invite links**
4. **Phase 3 — Password reset links** (replaces today's temp-password flow)

The foundation is built with all three features in mind so that Phases 2 and 3 are thin
consumers — they should add **only** new files plus a route registration, never modify the
core token service.

---

## Decisions locked in

| Decision | Choice | Rationale |
|---|---|---|
| Email-verification enforcement | **Soft gate** | Keep current auto-login UX; show a banner and block only sensitive actions until verified. |
| Token storage | **Single unified `auth_tokens` table** | Fewer tables, one hardened consume-path, trivial to extend; splitting later is a mechanical migration. |
| Password reset | **Keep temp-password flow for now**, migrate to links in Phase 3 | Don't disturb a working system until its turn. |
| Existing users on rollout | **Grandfather as verified** | Zero disruption; only new signups must verify. |

---

## The shared insight

All three features are the same primitive: **a secure, expiring, single-use token delivered
as a clickable link.** Only the metadata and the on-click action differ.

```
Generate random bytes  →  store SHA-256 HASH in DB (raw token never stored)
Email link with RAW token  →  data.arvfinance.com/<action>?token=<raw>
User clicks  →  server hashes raw, looks up by hash, checks expiry + not-yet-used
Valid  →  perform action (verify / provision / reset)  →  mark used (atomic)
```

### Security invariants (apply to every phase)
- Raw token exists only in the email URL and the inbound request — **never logged, never stored**.
- DB stores only the SHA-256 hash. A DB leak must not yield live links.
- `consumeToken` is a **single atomic UPDATE**: find-by-hash + check expiry + check unused +
  mark used in one statement. No race can redeem one link twice.
- Generic responses where enumeration matters (mirrors the existing `forgotPassword`
  "if an account exists…" pattern).

---

## Current-state notes (what exists today)

- **Sessions, not JWTs.** Login/signup set `req.session.userId`. Signup auto-logs-in the new user.
- **Password reset today is temp-password-based**, not link-based: `forgotPassword` generates a
  random password, hashes it onto the user, emails the plaintext, sets `mustResetPassword = true`;
  next login forces `ResetPassword.tsx` → `/me/complete-reset`. **This stays until Phase 3.**
- **No token table; no `emailVerified` column.**
- **Email** goes through Postmark (`sendPlainEmail` / `sendEmailWithTemplate`), with per-feature
  HTML built in `passwordReset.services.ts`.
- **Rate limiting** is a hand-rolled in-memory limiter (`forgotPasswordRateLimit.ts`).
- **Schema changes** precedent: one-off scripts like `scripts/add-must-reset-password.ts`
  (avoids the `db:push` drift that wants to truncate `market_scan_queue`).

---

## Phase 0 — Foundation (build once)

### `auth_tokens` table

| column | type | notes |
|---|---|---|
| `id` | uuid pk | default random |
| `type` | text | `'email_verification' \| 'password_reset' \| 'invite'` |
| `tokenHash` | text not null | SHA-256 of the raw token; raw never stored. Indexed. |
| `userId` | uuid null → users.id (cascade) | null for invites to a not-yet-existing user |
| `email` | text null | invited address (invites); optional audit elsewhere |
| `metadata` | jsonb null | invite grant: `{ tier, accountType?, role? }` |
| `expiresAt` | timestamptz not null | |
| `usedAt` | timestamptz null | single-use marker |
| `createdAt` | timestamptz not null | default now() |

Indexes: `tokenHash`, `(type, userId)`.

### Token service — `server/services/auth/tokens.services.ts` (the reusable core)
- `generateRawToken()` → 32 random bytes, base64url (reuses crypto pattern from `generateTempPassword.ts`).
- `hashToken(raw)` → SHA-256.
- `createToken({ type, userId?, email?, metadata?, ttlMs })` → inserts hash, returns the **raw** token.
- `consumeToken({ type, rawToken })` → atomic
  `UPDATE … SET used_at = now() WHERE token_hash = $1 AND type = $2 AND used_at IS NULL AND expires_at > now() RETURNING *`.
- `invalidateActiveTokens({ type, userId })` → kill prior live tokens (used on resend).

### Generic link-email — `server/services/postmark/linkEmail.services.ts`
- `sendLinkEmail({ to, from?, heading, bodyLines, ctaLabel, url, footerNote })` — one builder
  for all link emails, reusing the HTML structure currently duplicated in `passwordReset.services.ts`.
- Auth/system emails send from the **default sender** (not the recipient's RM).

### Reusable rate limiter — `server/middleware/rateLimiter.ts`
- `createRateLimiter({ windowMs, maxPerIp, cooldownMs })` factory, generalized from
  `forgotPasswordRateLimit.ts`. The existing forgot-password limiter keeps working unchanged.

### Phase 0 file list

**New**
- `database/schemas/authTokens.schema.ts` — `auth_tokens` table
- `database/validation/authTokens.validation.ts` — Zod (`verifyEmailSchema`, shared token-string validation)
- `server/services/auth/tokens.services.ts` — core token service
- `server/services/postmark/linkEmail.services.ts` — generic link-email builder/sender
- `server/middleware/rateLimiter.ts` — reusable limiter factory
- `scripts/add-auth-tokens-and-email-verified.ts` — one-off migration (create table, add column, backfill)
- Unit test for `tokens.services.ts` (hash / expiry / single-use / atomicity)

**Modified**
- `database/schemas/index.ts` — export `authTokens.schema`
- `server/services/auth/index.ts` — export `TokenServices`

---

## Phase 1 — Email verification (soft gate)

### Behavior
- Signup keeps auto-login; additionally mints an `email_verification` token (24h TTL) and
  emails the link to `data.arvfinance.com/verify-email?token=…`.
- User can browse immediately. A **banner** prompts them to verify. **Sensitive actions are
  blocked** by `requireVerifiedEmail` middleware until `emailVerifiedAt` is set.
- Existing users are grandfathered (`emailVerifiedAt` backfilled to now in the Phase 0 migration).

### Endpoints (in `auth.routes.ts`)
- `POST /api/auth/verify-email` (public) — `consumeToken`, stamp `users.emailVerifiedAt`.
  Idempotent: already-verified returns success.
- `POST /api/auth/resend-verification` (`requireAuth`, rate-limited) — invalidate old tokens, issue + send a new one.

### Sensitive-action gate (soft)
`requireVerifiedEmail` is applied to (proposed, **pending confirmation**):
- create deal
- request contact info
- create community post

> The exact route files are confirmed against `.claude/docs/access-control.md` at build time.
> Access-control + validation integration tests are **mandatory** for any route whose guard changes.

### Phase 1 file list

**New**
- `server/services/auth/emailVerification.services.ts` — issue/verify glue over tokens.services
- `server/controllers/auth/emailVerification.controllers.ts` — `verifyEmail`, `resendVerification`
- `server/middleware/requireVerifiedEmail.ts` — soft-gate middleware
- `client/src/pages/VerifyEmail.tsx` — `/verify-email?token=` page (success / expired / resend)
- `client/src/components/auth/VerifyEmailBanner.tsx` — dismissible banner
- Integration tests: verify-email + resend (access-control + validation)

**Modified**
- `database/schemas/users.schema.ts` — add `emailVerifiedAt` column
- `server/controllers/auth/registration.controllers.ts` — mint token + send link after create (keep auto-login)
- `server/controllers/auth/session.controllers.ts` — include `emailVerifiedAt` in `me` / profile responses
- `server/controllers/auth/index.ts` — export new `EmailVerification` controller group
- `server/services/auth/user.services.ts` — add `markEmailVerified(userId)`
- `server/services/auth/index.ts` — export `EmailVerificationServices`
- `server/routes/auth.routes.ts` — register `POST /verify-email`, `POST /resend-verification`
- `client/src/App.tsx` — add `/verify-email` route
- `client/src/hooks/use-auth.ts` — surface `emailVerifiedAt` on the user object
- `client/src/pages/Signup.tsx` — optional "check your inbox" nudge post-signup
- `client/src/components/layout/*` — mount `VerifyEmailBanner` when unverified
- Sensitive-action route files — apply `requireVerifiedEmail` (exact files TBD)
- `.claude/docs/api.md`, `.claude/docs/access-control.md` — document new routes + middleware

### Verification checkpoint
Ship and verify Phase 1 fully before starting Phase 2.

---

## Phase 2 — Invite links

Built entirely on Phase 0. An admin/RM mints an invite that, when redeemed, provisions a new
account with a pre-applied grant (e.g. auto-promote to `basic`) and is **inherently verified**
(clicking proves inbox control).

### Behavior
- **Create:** admin/RM endpoint → `createToken({ type: 'invite', email, metadata: { tier, accountType?, role? }, ttlMs: 7d })`, send link to `/accept-invite?token=`.
- **Validate:** `GET` endpoint returns the invited email + grant so the client renders a
  prefilled, email-locked signup.
- **Redeem:** on signup-via-invite, `consumeToken`, apply grant via existing
  `UsersServices.updateUserTierRole` (+ account type/role from `metadata`), and set
  `emailVerifiedAt = now()` (skip verification entirely).

### Edge cases to design
- Invited email already has an account → reject, or apply grant to existing user (decide at build).
- Signup email ≠ invited email → lock the field.
- Expired / already-used invite → friendly error + path forward.

### Phase 2 file list (anticipated)

**New**
- `server/services/auth/invites.services.ts` — create/validate/redeem glue
- `server/controllers/auth/invites.controllers.ts` (or under admin/users) — handlers
- `client/src/pages/AcceptInvite.tsx` — `/accept-invite?token=` page
- Integration tests: invite create (role-gated) + redeem (access-control + validation)

**Modified**
- route file (admin/users or auth) — register create/validate/redeem routes
- `server/controllers/auth/registration.controllers.ts` — invite-aware signup path (consume + grant + verify)
- `client/src/App.tsx` — add `/accept-invite` route
- `.claude/docs/api.md`, `.claude/docs/access-control.md` — document invite routes

### Open questions for Phase 2
- Who can mint invites — admin only, or RMs too?
- What a grant covers beyond tier (account type, role).

### Verification checkpoint
Ship and verify Phase 2 fully before starting Phase 3.

---

## Phase 3 — Password reset links (replaces temp-password flow)

The final consumer. Everything it needs already exists after Phases 0–1.

### Behavior
- `forgotPassword` → `createToken({ type: 'password_reset', userId, ttlMs: 1h })` + `sendLinkEmail`
  to `/reset-password?token=` (instead of emailing a plaintext temp password).
- New page collects a new password and posts token + password; server `consumeToken` then
  `changeUserPassword`.
- Retire the temp-password + `mustResetPassword` path (and the forced-reset redirect/hard-gate
  in `App.tsx`) once the link flow is verified.

### Phase 3 file list (anticipated)

**New**
- `client/src/pages/ResetPasswordWithToken.tsx` — token-based `/reset-password?token=` page
  (distinct from today's forced-reset `ResetPassword.tsx`)
- Integration tests: forgot-password (link issuance) + token reset (validation + single-use)

**Modified**
- `server/controllers/auth/session.controllers.ts` — `forgotPassword` issues a link; add a
  token-reset handler
- `server/routes/auth.routes.ts` — register token-reset route
- `server/services/postmark/passwordReset.services.ts` — switch to `sendLinkEmail` (or retire)
- `client/src/pages/ForgotPassword.tsx` — copy update ("we sent a reset link")
- `client/src/App.tsx` — wire token-reset page; remove forced-reset hard gate
- Cleanup: `mustResetPassword` usage, `scripts/reset-one-user.ts`, related tests
- `.claude/docs/api.md`, `.claude/docs/access-control.md` — document changes

---

## Cross-cutting requirements

- **Every new route** needs the access-control + validation integration tests described in
  `.claude/docs/testing.md`.
- Run `npm run check`, fix errors, then invoke the **code-optimizer** agent before finishing any phase.
- Run the **Agent Updater** for every phase (all phases make DB/API changes) so
  `api.md` / `access-control.md` stay current.
- Schema changes use targeted one-off scripts (per `add-must-reset-password.ts`), **not** `db:push`.

## Items still to confirm before coding

1. The exact **sensitive-action set** for the Phase 1 soft gate (proposed: create deal,
   request contact info, create community post).
2. The **banner mount location** (shared layout/header component).
3. Whether to **refactor `passwordReset.services.ts` onto `sendLinkEmail` in Phase 0**
   (lean: defer to Phase 3 to keep the verification PR low-risk).
4. Phase 2: **who can mint invites** and the full **grant scope**.
