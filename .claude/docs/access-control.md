# Access Control — Canonical Reference

> **This is the single source of truth for authentication and authorization
> across the entire app.** When writing backend routes or frontend components
> that gate on auth state, always check this file first.
>
> The core files that implement access control are:
> - `server/middleware/requireAuth.ts` — session check (401 if no session)
> - `server/middleware/requireAccess.ts` — the single engine: pass if the user has ANY allowed role OR ANY allowed tier (401 if no session, 403 otherwise)
> - `server/middleware/requireRole.ts` — role-only wrapper over `requireAccess` (401 if no session, 403 if wrong role)
> - `server/middleware/requireSub.ts` — tier + role-bypass wrapper over `requireAccess` (401 if no session, 403 if wrong tier and no bypass)
> - `client/src/hooks/use-auth.ts` — frontend auth state (roles, subscription flags, `canAccessApp`, `isEmailVerified`)
>
> **Email verification is NOT an access gate.** It is surfaced as a soft nudge only (banner/bell,
> profile + admin indicators); `isEmailVerified` never blocks a route or page. Authorization is by
> role/tier exclusively.

---

## 1. Middleware reference

### `requireAuth`
Checks `req.session.userId`. Returns `401` if no session. No role or subscription check.

```ts
// Usage
router.post("/", requireAuth, handler);
```

### `requireAccess({ roles?, tiers? })`
The single access-control engine. A request passes when the signed-in user has **ANY** of the
allowed team roles **OR ANY** of the allowed subscription tiers (roles checked first, short-circuit).
Returns `401` if no session, `403` otherwise. `requireRole` and `requireSub` are thin wrappers over
it that pass their own 403/500 message strings, so their contracts are unchanged.

```ts
// "App access" (any subscription tier OR any team role) — used for the property list + deals reads:
router.get("/", requireSub(["basic","pro","premium"], { bypassRoles: ["admin","owner","relationship-manager","member"] }), handler);
// equivalently: requireAccess({ tiers: ["basic","pro","premium"], roles: ["admin","owner","relationship-manager","member"] })
```

### `requireRole(roleOrRoles)`
Membership-based — **not hierarchical**. Every allowed role must be listed explicitly.
Thin wrapper over `requireAccess` (role-only). Checks `req.session.userId` first (returns `401` if missing), then queries `user_roles` for a matching role (returns `403` if none found).

```ts
// Usage — single role
router.patch("/:id", requireRole("admin"), handler);

// Usage — multiple roles (any one of these passes)
router.get("/", requireRole(["admin", "owner", "relationship-manager", "member"]), handler);
```

### `requireSub(tierOrTiers, options?)`
Thin wrapper over `requireAccess` (tiers + role bypass). Checks `req.session.userId` first (returns `401` if missing).
If `bypassRoles` are provided, checks those roles first — a matching role skips the subscription check entirely.
If no bypass match, queries the user's subscription. Returns `403` if no matching tier.

`requireSub(["pro", "premium"])` — passes for **both** pro and premium subscribers; `premium` is not auto-inferred from `pro` (both tiers are listed explicitly).

```ts
// Usage
router.post("/", requireSub(["pro", "premium"], {
    bypassRoles: ["admin", "owner", "relationship-manager", "member"]
}), handler);
```

---

## 2. Role hierarchy

Roles are stored in `user_roles` and checked via `requireRole`. A user can have zero or more roles. "No role" means authenticated but unassigned.

```
owner                   ← highest
admin
relationship-manager    (RM)
member
(no role)               ← authenticated, no role assigned
(unauthenticated)       ← no session
```

> Roles are **membership-based**, not hierarchical. `requireRole(["admin"])` does NOT
> automatically pass for `owner`. Always list every allowed role explicitly.

Frontend flags from `useAuth()`:
- `isOwner`, `isAdmin`, `isRelationshipManager`, `isMember`
- `canAccessAdminPanel` — true if any team role (owner/admin/RM/member)
- `canAccessApp` — true if any subscription tier OR any team role

---

## 3. Subscription tiers

```
premium    ← highest
pro
basic
none       ← no active subscription
```

`requireSub(["pro", "premium"])` passes for pro and premium; fails for basic and none.
All four team roles (`admin`, `owner`, `relationship-manager`, `member`) bypass `requireSub` when listed in `bypassRoles`.

Frontend flags: `isPremium`, `isPro`, `isBasic`, `subscription` (raw tier string or null).

---

## 4. Status code contract

| Situation | Code |
|---|---|
| Not authenticated (no session) | 401 |
| Authenticated, wrong role or tier | 403 |
| Authenticated, ownership check failed in service | 403 |
| Validation failed | 400 |
| Resource not found | 404 |
| Success with data | 200 |
| Resource created | 201 |
| Success, no content | 204 |

---

## 5. Route permission tables

`requireRole` emits `401` for no session and `403` for wrong role.
`requireSub` emits `401` for no session and `403` for wrong tier (and no bypass role).
`requireAuth` emits `401` for no session only.

---

### 5.1 Auth (`/api/auth`)

| Method | Route | Middleware | Notes |
|---|---|---|---|
| POST | `/api/auth/login` | (public) | |
| POST | `/api/auth/logout` | (public) | |
| GET | `/api/auth/me` | (public) | Returns `{ user: null }` if unauthenticated |
| PATCH | `/api/auth/me` | (public) | Session userId read from session if present |
| PATCH | `/api/auth/me/notifications` | (public) | Session userId read from session if present |
| PATCH | `/api/auth/me/password` | `requireAuth` | Voluntary password change; verifies current password (400 if wrong), clears `must_reset_password`, and invalidates the user's other sessions |
| POST | `/api/auth/me/complete-reset` | `requireAuth` | Completes a forced reset: only valid when `must_reset_password` is set (409 otherwise); takes `newPassword` only (no current password — the session proves possession of the temp password) |
| POST | `/api/auth/forgot-password` | (public) | Rate-limited. Emails a temp password, flags `must_reset_password`, and invalidates all of the user's existing sessions; always returns 200 (no email enumeration) |
| POST | `/api/auth/signup` | (public) | Auto-logs in; also mints a 24h `email_verification` token and emails the link (best-effort — a send failure does not fail signup) |
| POST | `/api/auth/verify-email` | (public) | Redeems a verification link `{ token }`; the token is the proof of inbox control. 400 on missing/invalid/expired/used token; idempotent success for an already-verified valid token |
| POST | `/api/auth/resend-verification` | `requireAuth` | Rate-limited (per-IP window). Re-issues + emails a fresh link; already-verified is a no-op `200 { alreadyVerified: true }` |
| POST | `/api/auth/me/avatar` | `requireAuth` | Upload or replace profile image (multipart/form-data) |
| DELETE | `/api/auth/me/avatar` | `requireAuth` | Remove profile image |

---

### 5.2 Properties (`/api/properties`)

| Method | Route | Middleware chain | unauth | member | RM | admin/owner |
|---|---|---|---|---|---|---|
| GET | `/api/properties` | `requireSub(["basic","pro","premium"], bypass: all roles)` | 401 | ✓ | ✓ | ✓ |
| GET | `/api/properties/map` | (public) | ✓ | ✓ | ✓ | ✓ |
| GET | `/api/properties/map/extent` | (public) | ✓ | ✓ | ✓ | ✓ |
| GET | `/api/properties/map/regions` | (public) | ✓ | ✓ | ✓ | ✓ |
| GET | `/api/properties/zip-counts` | (public) | ✓ | ✓ | ✓ | ✓ |
| GET | `/api/properties/suggestions` | (public) | ✓ | ✓ | ✓ | ✓ |
| GET | `/api/properties/streetview` | (public) | ✓ | ✓ | ✓ | ✓ |
| GET | `/api/properties/:id` | (public) | ✓ | ✓ | ✓ | ✓ |
| GET | `/api/properties/:id/transactions` | (public) | ✓ | ✓ | ✓ | ✓ |
| PATCH | `/api/properties/:id` | `requireRole(["admin","owner","relationship-manager"])` | 401 | 403 | ✓ | ✓ |
| POST | `/api/properties` | `requireRole(["admin","owner"])` | 401 | 403 | 403 | ✓ |
| DELETE | `/api/properties/:id` | `requireRole(["admin","owner"])` | 401 | 403 | 403 | ✓ |

> **`GET /api/properties` is app-access gated** (the buyers/wholesale feeds + table): any
> subscription tier (basic/pro/premium) **or** any team role passes; everyone else (unauth or
> authenticated-no-sub-no-role) gets `401`/`403`. The **map, detail, suggestions, street view,
> zip-counts, and transactions remain public at the API.** The **client**, however, now gates the
> whole Data page (`/data`, `client/src/pages/Data.tsx`) behind login via `AppAccessGate`: logged-out
> visitors are redirected to `/login?redirect=/data` and authenticated-no-access users see the
> locked panel, so the previously-anonymous map teaser is no longer reachable through the UI. (The
> public API rows are unchanged — this is a client-routing change only.)

> **Field-level visibility on property reads:** `supplementalTaxBill` (the signed supplemental-tax
> total on `GET /api/properties` and `GET /api/properties/:id`) is returned **only to
> `admin`/`owner` callers** — resolved from the session in the controller via `isAdminOrOwner`
> (`server/services/users/users.services.ts`), never from query params. Every other caller
> (including unauthenticated on the public detail route) receives `null` for the field. This is
> response shaping, not a `403` (mirrors the Deals field-stripping pattern in §5.4).

---

### 5.3 Companies (`/api/companies`)

| Method | Route | Middleware chain | unauth | member | RM | admin/owner |
|---|---|---|---|---|---|---|
| GET | `/api/companies` | (public) | ✓ | ✓ | ✓ | ✓ |
| GET | `/api/companies/contacts/suggestions` | (public) | ✓ | ✓ | ✓ | ✓ |
| GET | `/api/companies/wholesale-leaderboard` | (public) | ✓ | ✓ | ✓ | ✓ |
| GET | `/api/companies/leaderboard` | (public) | ✓ | ✓ | ✓ | ✓ |
| GET | `/api/companies/:id` | (public) | ✓ | ✓ | ✓ | ✓ |
| PATCH | `/api/companies/:id` | `requireRole(["admin","owner"])` | 401 | 403 | 403 | ✓ |
| POST | `/api/companies/:id/contacts` | `requireRole(["admin","owner"])` | 401 | 403 | 403 | ✓ |
| PATCH | `/api/companies/:id/contacts/:contactId` | `requireRole(["admin","owner"])` | 401 | 403 | 403 | ✓ |
| DELETE | `/api/companies/:id/contacts/:contactId` | `requireRole(["admin","owner"])` | 401 | 403 | 403 | ✓ |
| POST | `/api/companies/:id/enrich` | `requireRole(["admin","owner"])` | 401 | 403 | 403 | ✓ |
| POST | `/api/companies/:id/claim` | `requireAuth` | 401 | ✓ | ✓ | ✓ |
| GET | `/api/companies/:id/members` | `requireAuth` | 401 | ✓ | ✓ | ✓ |

---

### 5.3a Claims (`/api/claims`)

| Method | Route | Middleware chain | unauth | member | RM | admin/owner |
|---|---|---|---|---|---|---|
| GET | `/api/claims` | `requireRole(["admin","owner","relationship-manager"])` | 401 | 403 | ✓ | ✓ |
| PATCH | `/api/claims/:id` | `requireRole(["admin","owner","relationship-manager"])` | 401 | 403 | ✓ | ✓ |

---

### 5.4 Deals (`/api/deals`)

`requireSub` emits `401` for no session, `403` for wrong tier with no bypass role.
Ownership is enforced in the service layer (not middleware), returning `403` if the caller is not the owner and doesn't have a qualifying role.

| Method | Route | Middleware chain | unauth | no-sub/no-role | pro or premium | member/RM | admin/owner |
|---|---|---|---|---|---|---|---|
| GET | `/api/deals` | `requireSub(["basic","pro","premium"], bypass: all roles)` | 401 | 403 | ✓ | ✓ (bypass) | ✓ (bypass) |
| GET | `/api/deals/msas` | `requireSub(["basic","pro","premium"], bypass: all roles)` | 401 | 403 | ✓ | ✓ (bypass) | ✓ (bypass) |
| GET | `/api/deals/locations` | `requireSub(["basic","pro","premium"], bypass: all roles)` | 401 | 403 | ✓ | ✓ (bypass) | ✓ (bypass) |
| GET | `/api/deals/:id` | `requireSub(["basic","pro","premium"], bypass: all roles)` | 401 | 403 | ✓ | ✓ (bypass) | ✓ (bypass) |
| GET | `/api/deals/:id/top-buyers` | `requireSub(["basic","pro","premium"], bypass: all roles)` + ownership in service | 401 | 403 | own only | own only (member) / any (RM) | any |
| POST | `/api/deals` | `requireSub(["basic","pro","premium"], bypass: all roles)` | 401 | 403 | ✓ | ✓ (bypass) | ✓ (bypass) |
| PATCH | `/api/deals/:id` | `requireSub(["basic","pro","premium"], bypass: all roles)` + ownership in service | 401 | 403 | own only | own only (member) / any (RM) | any |
| DELETE | `/api/deals/:id` | `requireSub(["basic","pro","premium"], bypass: all roles)` + ownership in service | 401 | 403 | own only | own only (member) / any (RM) | any |
| POST | `/api/deals/:id/request-info` | `requireSub(["basic","pro","premium"], bypass: all roles)` | 401 | 403 | ✓ | ✓ (bypass) | ✓ (bypass) |
| POST | `/api/deals/:id/offers` | `requireSub(["basic","pro","premium"], bypass: all roles)` | 401 | 403 | ✓ | ✓ (bypass) | ✓ (bypass) |
| GET | `/api/deals/:id/offers` | auth + ownership in service | 401 | 403 | own only | own only (member) / any (RM) | any |
| DELETE | `/api/deals/:id/offers/:offerId` | auth + ownership in service | 401 | 403 | own only | own only (member) / any (RM) | any |

> **The entire Deals experience is app-access gated** — `GET /api/deals`, `/api/deals/msas`, and
> `/api/deals/:id` now require any subscription tier **or** any team role (they were previously
> public). The Deals page mirrors this with a whole-page `AppAccessGate`. All deal write routes
> (create, edit, delete, `POST /offers`, and `request-info`) carry the same gate; `no-sub/no-role`
> is always `403`. **`request-info` is no longer public** — it previously required no auth and now
> requires the subscription/role gate like the other deal actions. Email verification is **not**
> part of any of these gates.

**Ownership rules in service (confirmed):**
- `updateDeal`: owner of the deal, or `admin`/`owner` role. RM cannot edit another user's deal.
- `deleteDeal`: owner of the deal, or `admin`/`owner`/`relationship-manager` role. RM **can** delete any deal.
- `getBidsForDeal` / `deleteDealBid`: owner of the deal, or `admin`/`owner`/`relationship-manager` role. Offers are poster-private — a non-owner without a qualifying role gets `403`. `deleteDealBid` returns `404` if the offer is missing or belongs to a different deal.
- `getTopBuyersForDeal`: owner of the deal, or `admin`/`owner`/`relationship-manager` role. A non-owner without a qualifying role gets `403`; `404` if the deal is missing.

**Field-level stripping on POST/PATCH:**
The controller strips `isArvExclusive`, `onBehalfOfEmail`, and `adminNotes` if the caller is not admin/owner. These fields are silently ignored for non-privileged callers (no 403 — they get a 2xx but the fields are dropped).

---

### 5.5 Vendors (`/api/vendors`)

| Method | Route | Middleware chain | unauth | any authenticated | admin/owner |
|---|---|---|---|---|---|
| GET | `/api/vendors` | (public) | ✓ | ✓ | ✓ |
| GET | `/api/vendors/recommended` | (public) | ✓ | ✓ | ✓ |
| GET | `/api/vendors/:vendorId` | (public) | ✓ | ✓ | ✓ |
| POST | `/api/vendors` | `requireRole(["admin","owner"])` | 401 | 403 | ✓ |
| PUT | `/api/vendors/:vendorId` | `requireRole(["admin","owner"])` | 401 | 403 | ✓ |
| PUT | `/api/vendors/:vendorId/recommend` | `requireRole(["admin","owner"])` | 401 | 403 | ✓ |
| DELETE | `/api/vendors/:vendorId` | `requireRole(["admin","owner"])` | 401 | 403 | ✓ |
| POST | `/api/vendors/:vendorId/logo` | `requireRole(["admin","owner"])` | 401 | 403 | ✓ |
| DELETE | `/api/vendors/:vendorId/logo` | `requireRole(["admin","owner"])` | 401 | 403 | ✓ |
| POST | `/api/vendors/:vendorId/header` | `requireRole(["admin","owner"])` | 401 | 403 | ✓ |
| DELETE | `/api/vendors/:vendorId/header` | `requireRole(["admin","owner"])` | 401 | 403 | ✓ |

RM, member, and no-role authenticated users all return `403` on vendor writes — no elevated permissions.

---

### 5.6 Posts (`/api/posts`)

Ownership enforced in service: author, admin, or owner can edit/delete. Other authenticated users get `403`.

| Method | Route | Middleware chain | unauth | authenticated (non-author) | author | admin/owner |
|---|---|---|---|---|---|---|
| GET | `/api/posts` | (public) | ✓ | ✓ | ✓ | ✓ |
| GET | `/api/posts/:postId` | (public) | ✓ | ✓ | ✓ | ✓ |
| POST | `/api/posts` | `requireAuth` | 401 | ✓ | ✓ | ✓ |
| PUT | `/api/posts/:postId` | `requireAuth` + ownership in service | 401 | 403 | ✓ | ✓ |
| DELETE | `/api/posts/:postId` | `requireAuth` + ownership in service | 401 | 403 | ✓ | ✓ |
| POST | `/api/posts/:postId/images` | `requireAuth` + ownership in service | 401 | 403 | ✓ | ✓ |
| DELETE | `/api/posts/:postId/images/:imageId` | `requireAuth` + ownership in service | 401 | 403 | ✓ | ✓ |

---

### 5.7 Categories (`/api/categories`)

All public — no auth required.

| Method | Route | Access |
|---|---|---|
| GET | `/api/categories` | Public |
| GET | `/api/categories/:categoryId/vendors` | Public |
| GET | `/api/categories/:categoryId/posts` | Public |

---

### 5.8 Users (`/api/users`)

| Method | Route | Middleware chain | unauth | member | RM | admin/owner |
|---|---|---|---|---|---|---|
| GET | `/api/users` | `requireRole(["admin","owner","relationship-manager","member"])` | 401 | ✓ | ✓ | ✓ |
| GET | `/api/users/relationship-managers` | `requireRole(["admin","owner","relationship-manager","member"])` | 401 | ✓ | ✓ | ✓ |
| GET | `/api/users/roles` | `requireRole(["admin","owner"])` | 401 | 403 | 403 | ✓ |
| GET | `/api/users/account-types` | `requireRole(["admin","owner","relationship-manager","member"])` | 401 | ✓ | ✓ | ✓ |
| GET | `/api/users/me/company-memberships` | `requireAuth` | 401 | ✓ | ✓ | ✓ |
| GET | `/api/users/:userId/company-memberships` | `requireRole(["admin","owner","relationship-manager"])` | 401 | 403 | ✓ | ✓ |
| PUT | `/api/users/:userId/company-memberships` | `requireRole(["admin","owner"])` | 401 | 403 | 403 | ✓ |
| POST | `/api/users/:userId/roles` | `requireRole(["admin","owner"])` | 401 | 403 | 403 | ✓ |
| DELETE | `/api/users/:userId/roles/:role` | `requireRole(["admin","owner"])` | 401 | 403 | 403 | ✓ |
| PATCH | `/api/users/:userId` | `requireRole(["admin","owner"])` | 401 | 403 | 403 | ✓ |
| DELETE | `/api/users/:userId` | `requireRole(["admin","owner"])` | 401 | 403 | 403 | ✓ |

---

### 5.9 Admin (`/api/admin`)

| Method | Route | Middleware chain | unauth | member | RM | admin/owner |
|---|---|---|---|---|---|---|
| GET | `/api/admin/status` | (public) | ✓ | ✓ | ✓ | ✓ |
| GET | `/api/admin/whitelist` | `requireRole(["admin","owner","relationship-manager"])` | 401 | 403 | ✓ | ✓ |
| POST | `/api/admin/whitelist` | `requireRole(["admin","owner","relationship-manager"])` | 401 | 403 | ✓ | ✓ |
| PATCH | `/api/admin/whitelist/:id` | `requireRole(["admin","owner","relationship-manager"])` | 401 | 403 | ✓ | ✓ |
| DELETE | `/api/admin/whitelist/:id` | `requireRole(["admin","owner","relationship-manager"])` | 401 | 403 | ✓ | ✓ |

---

### 5.9a Code Violations (`/api/code-violations`)

Admin + owner only (`requireRole(["admin","owner"])` via `ADMIN_ROLES`) — **not** `PRIVILEGED_ROLES`, so relationship-managers and members are excluded. The CSV ingest is Phase 1 only (archive + parse + enqueue); it then fires the consumer drain in the background (no cron), which matches, resolves owners, and emails alerts for sendable complaints automatically (no approval step).

| Method | Route | Middleware chain | unauth | member | RM | admin/owner |
|---|---|---|---|---|---|---|
| POST | `/api/code-violations/uploads` | `requireRole(["admin","owner"])` | 401 | 403 | 403 | ✓ |
| GET | `/api/code-violations/uploads` | `requireRole(["admin","owner"])` | 401 | 403 | 403 | ✓ |
| GET | `/api/code-violations/uploads/:id` | `requireRole(["admin","owner"])` | 401 | 403 | 403 | ✓ |

---

### 5.10 Geocoding (`/api/geocoding`)

| Method | Route | Access |
|---|---|---|
| GET | `/api/geocoding/county` | Public (Census Bureau proxy) |

---

### 5.11 Contact (`/api/contact`)

| Method | Route | Access | Notes |
|---|---|---|---|
| POST | `/api/contact` | Public | Reads `req.session.userId` to route to user's RM if logged in, but auth is not required |

---

### 5.12 Mastermind — Channels (`/api/channels`)

Mastermind access = **any subscription tier OR any team role**. The read/list route is gated
by `requireMastermind` — a configured instance of `requireSub(['basic','pro','premium'], { bypassRoles: ['admin','owner','relationship-manager','member'] })` exported from
`server/middleware/requireMastermind.ts`. This is equivalent in meaning to the frontend
`canAccessApp` flag. The same file exports `isMastermindEligible(userId)` (the boolean form,
for the WebSocket upgrade handshake).

Channel **management** (create / rename / archive / delete) is admin/owner only and uses
`requireRole(['admin','owner'])` — stricter than `requireMastermind`, so it is not stacked.

Membership is **implicit**: every eligible user can read every public, non-archived channel
(no `channel_members` row required). `channel_members` rows are written lazily later to carry
read-state; they are not consulted for authorization in Phase 1.

| Method | Route | Middleware chain | unauth | no-role/no-sub | sub (basic/pro/prem) | member/RM | admin/owner |
|---|---|---|---|---|---|---|---|
| GET | `/api/channels` | `requireMastermind` | 401 | 403 | ✓ | ✓ (bypass) | ✓ (bypass) |
| PATCH | `/api/channels/:id/read` | `requireMastermind` | 401 | 403 | ✓ | ✓ (bypass) | ✓ (bypass) |
| POST | `/api/channels` | `requireRole(['admin','owner'])` | 401 | 403 | 403 | 403 | ✓ |
| PATCH | `/api/channels/:id` | `requireRole(['admin','owner'])` | 401 | 403 | 403 | 403 | ✓ |
| POST | `/api/channels/:id/archive` | `requireRole(['admin','owner'])` | 401 | 403 | 403 | 403 | ✓ |
| DELETE | `/api/channels/:id` | `requireRole(['admin','owner'])` | 401 | 403 | 403 | 403 | ✓ |
| GET | `/api/channels/:id/members` | `requireMastermind` | 401 | 403 | ✓ | ✓ (bypass) | ✓ (bypass) |
| GET | `/api/channels/:id/pin` | `requireMastermind` | 401 | 403 | ✓ | ✓ (bypass) | ✓ (bypass) |
| POST | `/api/channels/:id/pin` | `requireRole(['admin','owner'])` | 401 | 403 | 403 | 403 | ✓ |
| DELETE | `/api/channels/:id/pin` | `requireRole(['admin','owner'])` | 401 | 403 | 403 | 403 | ✓ |

**Behavior notes:**
- `GET /api/channels` returns public, non-archived channels (enriched with per-caller
  `unreadCount` / `hasMention`). Admin/owner may pass `?includeArchived=true` to include
  archived channels (the archive view); the flag is ignored for non-admin callers
  (controller-enforced), so they only ever see active channels.
- **Pin** is **admin/owner only** (set/replace/clear). `GET /api/channels/:id/pin` returns the
  single pinned message (or `null`) for any eligible caller and is what the channel pin bar reads;
  the pinned payload includes who pinned it. There is one pin per channel
  (`pinned_messages` `UNIQUE(channel_id)`); `POST` upserts (replaces) it. A pinned message that is
  soft-deleted is cleared from the pin.
- `PATCH /api/channels/:id/read` advances the caller's `channel_members.last_read_at` /
  `last_read_message_id` (the unread-badge clear). It upserts the caller's own
  `channel_members` row — this is the **lazy membership join point** — and returns `204`.
  It only ever touches the caller's own read-state, so no ownership check is needed beyond
  `requireMastermind`. It is **DM-aware**: for a `dm` channel id the caller must be one of the two
  members (non-member → `404`, existence never disclosed); admin-only channels stay admin/owner-only.
- **Channel management is public-channels-only.** `PATCH /api/channels/:id` (rename/edit),
  `POST /api/channels/:id/archive`, and `DELETE /api/channels/:id` all `404` for any non-public
  (e.g. `dm`) channel — existence never disclosed — so an admin/owner can never rename, archive,
  or hard-delete a private DM they are not part of. The §5.15 "admins have no DM access" rule
  therefore holds at the **channel** layer too, not just for messages (enforced in the service via
  a `type === 'public'` guard).
- `POST /api/channels/:id/archive` is a **soft** archive (`is_archived = true`).
- `DELETE /api/channels/:id` is a **hard** delete (cascade) and is only permitted when the
  channel is **already archived** — otherwise it returns `409` ("archive the channel before
  deleting"). This is the delete-twice safety net.

**Admin-only channels (`channels.is_admin_only = true`, e.g. `#admin`):**
A channel flagged `is_admin_only` is visible and usable by **`admin`/`owner` only** — *not*
`member`, `relationship-manager`, or any subscriber, even though all of those pass
`requireMastermind`. The flag is an **orthogonal, service-enforced** restriction layered on top
of the route middleware in the tables above (the channel is still `type='public'`). Enforcement
points (a non-admin caller is treated as if the channel does not exist → **404**, so existence is
never disclosed):
- `GET /api/channels` **excludes** admin-only channels for non-admins (so the channel never
  appears in their sidebar, mention lists, or deep links).
- `GET`/`POST /api/channels/:id/messages`, `PATCH /api/channels/:id/read`,
  `GET /api/channels/:id/members`, and `GET /api/channels/:id/pin` all return **404** for a
  non-admin caller. For admin/owner they behave normally.
- The message-id-scoped routes (`POST`/`DELETE /api/messages/:id/reactions`) also **404** a
  non-admin on an admin-only channel's message (the reaction service re-checks the channel).
  Edit/delete (`PATCH`/`DELETE /api/messages/:id`) are already author-or-admin gated, and a
  non-admin can never be the author of an admin-only message (they can't post), so they're
  blocked there too.
- `GET /api/channels/:id/members` additionally **scopes mention candidates to admins/owners** for
  an admin-only channel (you cannot `@mention` a user who can't see the channel).
- **Notification fan-out** is scoped: an `@channel` in an admin-only channel notifies
  **admins/owners only**, and a direct `@user` of a non-admin is **dropped** (no bell/email
  deep-linking a user into a channel they can't open).
- **Real-time:** the `/ws` `subscribe` to an admin-only channel is rejected for a non-admin
  client (see the WS note in §5.13).
- Channel-management routes (`POST`/`PATCH`/archive/`DELETE`, pin set/clear) are already
  `requireRole(['admin','owner'])`, so they need no extra check.

---

### 5.13 Mastermind — Messages (`/api/channels/:id/messages`, `/api/messages/:id`)

All message routes are gated by `requireMastermind` (same rule as channels: any subscription
tier OR any team role). There is **no** `requireRole` on these routes — author-vs-admin rules
are enforced **inside the service**, mirroring the Vendors posts pattern:

- **Edit (`PATCH /api/messages/:id`)** is **author-only** — a non-author is `403` *even for
  admin/owner*. This enforces the Mastermind design rule: admins may delete a message but may
  **never edit** what someone else said.
- **Delete (`DELETE /api/messages/:id`)** is allowed for the **author OR an admin/owner**.
  Delete is a **soft delete** (`is_deleted = true`, content blanked to a tombstone); messages
  are never hard-deleted.

| Method | Route | Middleware chain | unauth | no-role/no-sub | sub (basic/pro/prem) | member/RM | admin/owner |
|---|---|---|---|---|---|---|---|
| GET | `/api/channels/:id/messages` | `requireMastermind` | 401 | 403 | ✓ | ✓ (bypass) | ✓ (bypass) |
| POST | `/api/channels/:id/messages` | `requireMastermind` | 401 | 403 | ✓ | ✓ (bypass) | ✓ (bypass) |
| PATCH | `/api/messages/:id` | `requireMastermind` (+ author-only in service) | 401 | 403 | ✓ own / 403 others | ✓ own / 403 others | ✓ own / **403 others** |
| DELETE | `/api/messages/:id` | `requireMastermind` (+ author-or-admin in service) | 401 | 403 | ✓ own / 403 others | ✓ own / 403 others | ✓ **any** |
| POST | `/api/messages/:id/reactions` | `requireMastermind` | 401 | 403 | ✓ | ✓ (bypass) | ✓ (bypass) |
| DELETE | `/api/messages/:id/reactions` | `requireMastermind` | 401 | 403 | ✓ | ✓ (bypass) | ✓ (bypass) |

**Behavior notes:**
- `GET …/messages` returns history newest-first via **keyset pagination** (`?cursor=<messageId>&limit=`,
  default 30, max 50) → `{ messages, nextCursor }`. Passing `?since=<messageId>` switches to
  **reconnect backfill** mode (messages newer than that id, oldest-first). Reads target public,
  non-archived channels only (archived/unknown → `404`).
- Soft-deleted messages are still returned, as **blank tombstones** (`isDeleted: true`, content
  stripped), so the timeline has no gaps.
- `POST …/messages` validates content with `createMessageSchema`, **sanitizes the TipTap HTML
  server-side** (stored-XSS protection), and rejects content that is empty once sanitized
  (`400`). Posting to an archived channel → `403`. `parentMessageId` is ignored in Phase 1.
- `PATCH /api/messages/:id` sets `is_edited = true`; editing a soft-deleted message → `409`.
- `POST …/messages` also accepts an optional `attachments[]` (metadata from the upload endpoint
  below). Each `fileUrl` is re-validated server-side to start with our Supabase bucket's public-URL
  prefix (a client cannot attach an arbitrary URL). A message is valid with **text OR ≥1
  attachment**; empty content with no attachment → `400`.
- **Reactions** (`POST`/`DELETE /api/messages/:id/reactions`) take `{ emoji }` from the fixed set
  (`👍 👎 😀 😢 😂 ✅`); off-set emoji → `400`. Add is idempotent (`UNIQUE(message_id,user_id,emoji)`),
  remove is self-scoped (only the caller's own reaction). Both broadcast a `reaction.changed` delta.
- **Attachment upload** (`POST /api/mastermind/attachments`, `requireMastermind`) is a multipart
  endpoint (`multer`, field `file`, max 10 MB, allowlisted image/doc MIME types) that uploads to
  Supabase Storage and returns `{ attachment }` metadata to send back with the message. Access
  matrix is the standard `requireMastermind` chain (401 / 403 / ✓).
- **DM messages (Phase 2):** the message-id-scoped routes above (`PATCH`/`DELETE /api/messages/:id`,
  `POST`/`DELETE /api/messages/:id/reactions`) are not channel-scoped, so each resolves the
  message's channel and, when it is a **DM**, requires the caller to be one of the two members
  (`assertDmMembership`) — a non-member is **404**. Two DM-specific overrides to the table above:
  **edit stays author-only** (as everywhere), and **delete is author-only in a DM** — the
  admin/owner "delete any" power in the `DELETE` row does **not** apply to DM messages. See §5.15.

**Real-time (`/ws`) upgrade gate:** the Mastermind WebSocket at `/ws` is **not** an Express
route, so the middleware table above doesn't apply. The upgrade is authenticated manually in
`server/websocket/auth.ts`: it reads the `connect.sid` session cookie, unsigns it with
`SESSION_SECRET`, loads the session, and requires `isMastermindEligible(userId)` — the **same
rule** as `requireMastermind`. A missing/invalid cookie, missing session, or ineligible user
causes the upgrade to be rejected with `401` (no socket opens). Once connected, a client may only
`subscribe` to public, non-archived channels — and to an **admin-only** channel only if the
client is `admin`/`owner` (otherwise the subscribe is silently ignored, so no live events for that
channel are delivered).

---

### 5.14 Mastermind — Notifications (`/api/notifications`)

The in-app bell feed. All routes are gated by `requireMastermind` and are **self-scoped**: every
query/update filters on the caller's `user_id`, so a user can only ever read or mark their own
notifications — there is no admin view and no cross-user access at any role.

| Method | Route | Middleware chain | unauth | no-role/no-sub | sub (basic/pro/prem) | member/RM | admin/owner |
|---|---|---|---|---|---|---|---|
| GET | `/api/notifications` | `requireMastermind` | 401 | 403 | ✓ | ✓ (bypass) | ✓ (bypass) |
| PATCH | `/api/notifications/:id/read` | `requireMastermind` (+ self-scoped in service) | 401 | 403 | ✓ own / 404 others | ✓ own / 404 others | ✓ own / **404 others** |
| PATCH | `/api/notifications/read-all` | `requireMastermind` | 401 | 403 | ✓ | ✓ (bypass) | ✓ (bypass) |

**Behavior notes:**
- Notification rows are created server-side only (mention fan-out on message create — `@user`
  rows get type `mention`, `@channel` expands to all eligible users as `channel_mention`, and the
  admin/owner-only `@announcement` expands the same way as the distinct `announcement` type,
  excluding the sender). `@announcement` is gated in the message service: a non-admin/owner
  author's `@announcement` chip is stripped before persistence, so they can never fan one out.
  There is no `POST /api/notifications`.
- `PATCH /api/notifications/:id/read` returns `404` (not `403`) when the row exists but belongs
  to another user, so the route does not leak which notification ids exist.
- New notifications are also pushed over the `/ws` socket (`notification.created`) to every
  connected tab of the recipient — same upgrade gate as §5.13.

---

### 5.15 Mastermind — Direct Messages (`/api/dms`)

1:1 direct messages (Phase 2). A DM is a `channels` row with `type='dm'` and exactly **two**
`channel_members` rows; it reuses the entire message pipeline. All DM routes are gated by
`requireMastermind` (same rule as channels/messages: any subscription tier OR any team role).
**Authorization inside a DM is by membership, enforced in the service** (`assertDmMembership`) — a
non-member is always **404** (existence is never disclosed), at **every role including admin/owner**.

**DMs are fully private:** admins/owners have **no** elevated access — they cannot list, read, or
delete a DM they are not a member of, and the "admin can delete any message" rule (§5.13) is
**disabled** for DM messages (delete is author-only).

| Method | Route | Middleware chain | unauth | no-role/no-sub | sub (basic/pro/prem) | member/RM | admin/owner |
|---|---|---|---|---|---|---|---|
| GET | `/api/dms` | `requireMastermind` | 401 | 403 | ✓ | ✓ (bypass) | ✓ (bypass) |
| GET | `/api/dms/candidates` | `requireMastermind` | 401 | 403 | ✓ | ✓ (bypass) | ✓ (bypass) |
| POST | `/api/dms/:userId/messages` | `requireMastermind` (+ eligibility/membership in service) | 401 | 403 | ✓ | ✓ (bypass) | ✓ (bypass) |
| GET | `/api/dms/:userId/messages` | `requireMastermind` (+ eligibility/membership in service) | 401 | 403 | ✓ | ✓ (bypass) | ✓ (bypass) |

**Behavior notes:**
- `GET /api/dms` lists the caller's DM conversations (counterparty profile + unread count +
  last-activity), newest-first, **self-scoped**. Conversations with no surviving messages are omitted.
- `GET /api/dms/candidates` lists Mastermind-eligible users to start a DM with (everyone but the
  caller), for the sidebar "New message" picker.
- `POST /api/dms/:userId/messages` **creates the DM channel on first use** (lazy) via
  `getOrCreateDmChannel`, then posts. `:userId` must be a **different, Mastermind-eligible** user —
  otherwise **404** (an ineligible/unknown counterparty is never disclosed); messaging yourself is
  **400**. The channel name is the deterministic `dm:<lo>:<hi>` id pair, so a pair maps to exactly
  one channel (`UNIQUE(channels.name)`); a second post joins the existing conversation.
- `GET /api/dms/:userId/messages` resolves the caller↔`:userId` DM and returns its history (same
  keyset/backfill contract as channel history), or an **empty draft** (no channel yet) for a pair
  that has never messaged — it does **not** create the channel (creation is on first send). Same
  `:userId` eligibility/`400`-self rules as the POST.
- **No `@mentions` in a DM** — user/`@channel`/`@announcement` chips are not parsed, persisted, or
  fanned out for DM messages (server-enforced).
- **Notifications:** each DM message creates a `direct_message` bell notification for the recipient
  **unless they are currently viewing that conversation** (subscribed to the DM channel over the
  socket). Routed by actor (the sender) → `/mastermind/dm/:actorId`. **No email** for DMs.
- **Real-time:** the `/ws` `subscribe` to a DM channel is accepted only for its two members (same
  membership check); any other client's subscribe is ignored, so no DM events leak.

---

## 6. How `testing.md` uses this file

When generating the mandatory access-control integration tests for a new or changed route:

1. Find the route's row above and read its **Middleware chain** and the allowed/blocked columns.
2. Generate, per `testing.md` baseline:
   - One test per **allowed** role/tier → expect `2xx`
   - One test for the **boundary blocked** role (next down from lowest allowed) → expect `403`
   - One **unauthenticated** test → expect `401`
   - For ownership routes, one **non-owner authenticated** test → expect `403`
3. For `requireSub` routes, also test the bypass: a bypass-role user with NO subscription → expect `2xx`.
4. See `tests/server/api/` for existing test patterns to follow. Tests for users, deals, and posts already exist and demonstrate the correct approach.

---

## 7. Maintenance rule

When a route is added, changed, or removed:
1. Update the matching table here **first**
2. Then write/update the code and tests against it

The combined apps reference (`apps.md`) describes permissions at a high level for context in each app's Access Control section. This file is the authoritative source and wins in any conflict — including over the per-route `Auth` lines in `api.md`.
