# Access Control — Canonical Reference

> **This is the single source of truth for authentication and authorization
> across the entire app.** When writing backend routes or frontend components
> that gate on auth state, always check this file first.
>
> The three core files that implement access control are:
> - `server/middleware/requireAuth.ts` — session check (401 if no session)
> - `server/middleware/requireRole.ts` — team role check (401 if no session, 403 if wrong role)
> - `server/middleware/requireSub.ts` — subscription tier check with optional role bypass (401 if no session, 403 if wrong tier and no bypass)
> - `client/src/hooks/use-auth.ts` — frontend auth state (roles, subscription flags, `canAccessApp`)

---

## 1. Middleware reference

### `requireAuth`
Checks `req.session.userId`. Returns `401` if no session. No role or subscription check.

```ts
// Usage
router.post("/", requireAuth, handler);
```

### `requireRole(roleOrRoles)`
Membership-based — **not hierarchical**. Every allowed role must be listed explicitly.
Checks `req.session.userId` first (returns `401` if missing), then queries `user_roles` for a matching role (returns `403` if none found).

```ts
// Usage — single role
router.patch("/:id", requireRole("admin"), handler);

// Usage — multiple roles (any one of these passes)
router.get("/", requireRole(["admin", "owner", "relationship-manager", "member"]), handler);
```

### `requireSub(tierOrTiers, options?)`
Checks `req.session.userId` first (returns `401` if missing).
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
| POST | `/api/auth/signup` | (public) | |
| POST | `/api/auth/me/avatar` | `requireAuth` | Upload or replace profile image (multipart/form-data) |
| DELETE | `/api/auth/me/avatar` | `requireAuth` | Remove profile image |

---

### 5.2 Properties (`/api/properties`)

| Method | Route | Middleware chain | unauth | member | RM | admin/owner |
|---|---|---|---|---|---|---|
| GET | `/api/properties` | (public) | ✓ | ✓ | ✓ | ✓ |
| GET | `/api/properties/map` | (public) | ✓ | ✓ | ✓ | ✓ |
| GET | `/api/properties/zip-counts` | (public) | ✓ | ✓ | ✓ | ✓ |
| GET | `/api/properties/suggestions` | (public) | ✓ | ✓ | ✓ | ✓ |
| GET | `/api/properties/streetview` | (public) | ✓ | ✓ | ✓ | ✓ |
| GET | `/api/properties/:id` | (public) | ✓ | ✓ | ✓ | ✓ |
| GET | `/api/properties/:id/transactions` | (public) | ✓ | ✓ | ✓ | ✓ |
| PATCH | `/api/properties/:id` | `requireRole(["admin","owner","relationship-manager"])` | 401 | 403 | ✓ | ✓ |
| POST | `/api/properties` | `requireRole(["admin","owner"])` | 401 | 403 | 403 | ✓ |
| DELETE | `/api/properties/:id` | `requireRole(["admin","owner"])` | 401 | 403 | 403 | ✓ |

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
| GET | `/api/deals` | (public) | ✓ | ✓ | ✓ | ✓ | ✓ |
| GET | `/api/deals/:id` | (public) | ✓ | ✓ | ✓ | ✓ | ✓ |
| POST | `/api/deals` | `requireSub(["pro","premium"], bypass: all roles)` | 401 | 403 | ✓ | ✓ (bypass) | ✓ (bypass) |
| PATCH | `/api/deals/:id` | `requireSub(["pro","premium"], bypass: all roles)` + ownership in service | 401 | 403 | own only | own only (member) / any (RM) | any |
| DELETE | `/api/deals/:id` | `requireSub(["pro","premium"], bypass: all roles)` + ownership in service | 401 | 403 | own only | own only (member) / any (RM) | any |
| POST | `/api/deals/:id/request-info` | (public) | ✓ | ✓ | ✓ | ✓ | ✓ |

**Ownership rules in service (confirmed):**
- `updateDeal`: owner of the deal, or `admin`/`owner` role. RM cannot edit another user's deal.
- `deleteDeal`: owner of the deal, or `admin`/`owner`/`relationship-manager` role. RM **can** delete any deal.

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

The per-app docs (`data.md`, `deals.md`, `vendors.md`) describe permissions at a high level for context. This file is the authoritative source and wins in any conflict.
