# API Documentation — ARV Finance Data App

Complete reference for all HTTP API routes. Base path: `/api`.

Auth is cookie-based (express-session). All authenticated routes require an active session cookie.

> Each route below lists an **Auth** summary for convenience. `access-control.md` is the canonical source for authorization and **wins on any conflict** — if an Auth line here disagrees with the permission table there, the table is correct.

For access control rules (which roles/tiers can call what), see [`access-control.md`](./access-control.md).

---

## Table of Contents

1. [Auth (`/api/auth`)](#1-auth-apiauth)
2. [Admin (`/api/admin`)](#2-admin-apiadmin)
2a. [Code Violations (`/api/code-violations`)](#2a-code-violations-apicode-violations)
3. [Users (`/api/users`)](#3-users-apiusers)
4. [Properties (`/api/properties`)](#4-properties-apiproperties)
5. [Companies (`/api/companies`)](#5-companies-apicompanies)
6. [Deals (`/api/deals`)](#6-deals-apideals)
7. [Vendors (`/api/vendors`)](#7-vendors-apivendors)
8. [Posts (`/api/posts`)](#8-posts-apiposts)
9. [Categories (`/api/categories`)](#9-categories-apicategories)
10. [Contact (`/api/contact`)](#10-contact-apicontact)
11. [Geocoding (`/api/geocoding`)](#11-geocoding-apigeooding)
12. [Mastermind — Channels & Messages (`/api/channels`, `/api/messages`)](#12-mastermind--channels--messages-apichannels-apimessages)

---

## 1. Auth `/api/auth`

### `POST /api/auth/login`
Log in with email and password.

**Body**
```json
{ "email": "user@example.com", "password": "secret" }
```

**Response `200`**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "firstName": "Jane",
    "lastName": "Doe",
    "email": "jane@example.com",
    "phone": "555-123-4567",
    "notifications": true,
    "county": "San Diego",
    "state": "CA",
    "profileImageUrl": null,
    "subscriptionId": 1,
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  }
}
```

**Errors** `400` invalid body · `401` wrong credentials

---

### `POST /api/auth/logout`
Destroy the current session.

**Response `200`** `{ "success": true }`

---

### `GET /api/auth/me`
Return the currently authenticated user with enriched data. Returns `{ user: null }` when unauthenticated (not a 401).

**Response `200`**
```json
{
  "user": {
    "id": "uuid",
    "firstName": "Jane",
    "lastName": "Doe",
    "email": "jane@example.com",
    "phone": "555-123-4567",
    "notifications": true,
    "county": "San Diego",
    "state": "CA",
    "profileImageUrl": "https://...",
    "subscriptionId": 1,
    "emailVerifiedAt": "2024-01-01T00:00:00Z",
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z",
    "countySubscriptions": [
      { "county": "San Diego", "state": "CA", "msaId": 3, "msaName": "San Diego-Chula Vista-Carlsbad, CA" }
    ],
    "relationshipManager": {
      "id": "uuid",
      "firstName": "John",
      "lastName": "Smith",
      "email": "john@arvfinance.com",
      "phone": "555-000-0000"
    },
    "notificationPreferences": {
      "userId": "uuid",
      "dataAppEnabled": true,
      "dealNotificationsEnabled": true,
      "vendorNotificationsEnabled": false,
      "analyticsEnabled": false,
      "dataAppStatusFilter": ["in-renovation", "wholesale"],
      "dealTypeFilter": ["wholesale", "agent", "sold", "reo"],
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": null
    }
  }
}
```

---

### `POST /api/auth/signup`
Create a new user account.

**Body**
```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane@example.com",
  "phone": "5551234567",
  "password": "secret123",
  "county": "San Diego",
  "state": "CA"
}
```

**Response `201`** `{ "success": true, "user": { ...user fields } }`

**Errors** `400` validation failed · `409` email already registered

**Side effects**: Auto-logs in the new user (sets the session). If the email is on the subscription whitelist, the user is granted a `basic` subscription, linked to their RM, the entry's county rows are copied into the user's county subscriptions, and the whitelist entry is removed. Default notification preferences are created. If a county is provided, a home-county subscription is seeded (the county only, never the whole MSA) — for a whitelisted signup the result is the union of the entry's counties and the home county, deduplicated by the subscription primary key. A 24h `email_verification` token is minted and the verification link emailed (best-effort — a send failure is logged but does not fail signup).

---

### `POST /api/auth/verify-email`
Redeem an email-verification link. The raw token (delivered in the email URL) is the proof of inbox control, so no session is required. Consumes the token atomically (single-use), then stamps `users.email_verified_at`. An already-verified user with a still-valid token still returns success (idempotent).

**Auth**: Public

**Body**
```json
{
  "token": "string (required)"
}
```

**Response `200`** `{ "success": true }`

**Errors** `400` missing token, or token invalid / expired / already used · `500` server error

---

### `POST /api/auth/resend-verification`
Re-issue and email a fresh verification link to the authenticated user. Invalidates any prior live verification token first. If the user is already verified, it is a no-op success. Rate-limited per IP.

**Auth**: `requireAuth` (rate-limited)

**Response `200`** `{ "success": true }` · already verified: `{ "success": true, "alreadyVerified": true }`

**Errors** `401` not authenticated · `404` user not found · `429` too many requests · `500` server error

---

### `PATCH /api/auth/me`
Update the authenticated user's profile fields.

**Auth**: Session required (checked in handler, not middleware).

**Body** (all optional)
```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane@example.com",
  "phone": "(555) 123-4567",
  "county": "Denver",
  "state": "CO",
  "countySubscriptions": [{ "county": "Denver", "state": "CO" }]
}
```

`countySubscriptions` is a replace-list: the user's subscription rows are replaced to match it exactly (empty array clears all).

**Response `200`**
```json
{
  "success": true,
  "user": { ...full user object same shape as GET /api/auth/me }
}
```

**Errors** `400` validation failed · `401` not authenticated · `409` email taken by another account

---

### `PATCH /api/auth/me/notifications`
Update the authenticated user's notification preferences.

**Auth**: Session required (checked in handler, not middleware).

**Body** (all optional)
```json
{
  "dataAppEnabled": true,
  "dealNotificationsEnabled": true,
  "vendorNotificationsEnabled": false,
  "analyticsEnabled": false,
  "dataAppStatusFilter": ["in-renovation", "wholesale"],
  "dealTypeFilter": ["wholesale", "agent", "sold", "reo"]
}
```

`dataAppStatusFilter` values: `"in-renovation" | "on-market" | "wholesale" | "sold"` — empty array means all statuses.
`dealTypeFilter` values: `"wholesale" | "agent" | "sold" | "reo"` — empty array means all types.

**Response `200`** `{ "success": true, "preferences": { ...notificationPreferences } }`

---

### `PATCH /api/auth/me/password`
Voluntary password change for the authenticated user (the Security tab). Verifies the current password, sets the new one, clears the `must_reset_password` flag, and invalidates the user's other sessions (the current session is kept).

**Auth**: `requireAuth`

**Body**
```json
{
  "currentPassword": "string (required)",
  "newPassword": "string (min 6)"
}
```

**Response `200`** `{ "success": true }`

**Errors** `400` validation failed or current password incorrect · `401` not authenticated · `404` user not found · `500` server error

---

### `POST /api/auth/me/complete-reset`
Completes a forced password reset for a user who logged in with a temporary password. Takes only the new password — the active session (created by logging in with the temp password) is the proof of possession, so the current password is not required. Only valid while `must_reset_password` is set; clears the flag on success.

**Auth**: `requireAuth`

**Body**
```json
{
  "newPassword": "string (min 6)"
}
```

**Response `200`** `{ "success": true }`

**Errors** `400` validation failed · `401` not authenticated · `404` user not found · `409` no password reset is pending · `500` server error

---

### `POST /api/auth/forgot-password`
Request a temporary password by email. If an account exists for the email, a temporary password is generated, the account is flagged (`must_reset_password = true`), the password is emailed, and all of the user's existing sessions are invalidated. Always returns the same generic `200` regardless of whether the email exists (no account enumeration). Rate-limited per IP and per email.

**Auth**: Public (rate-limited)

**Body**
```json
{
  "email": "string (valid email)"
}
```

**Response `200`** `{ "message": "If an account exists for that email, a temporary password has been sent." }`

**Errors** `400` invalid email · `429` too many requests

---

### `POST /api/auth/me/avatar`
Upload or replace the authenticated user's profile image.

**Auth**: `requireAuth`

**Content-Type**: `multipart/form-data`

**Body**: `image` field — JPEG or PNG, max 5 MB.

**Response `200`** `{ "profileImageUrl": "https://..." }`

**Errors** `400` no file or invalid type · `401` not authenticated · `404` user not found · `500` storage error

---

### `DELETE /api/auth/me/avatar`
Remove the authenticated user's profile image.

**Auth**: `requireAuth`

**Response `200`** `{ "message": "Avatar removed" }`

**Errors** `401` not authenticated · `404` user not found

---

## 2. Admin `/api/admin`

### `GET /api/admin/status`
Returns the current user's authentication state, admin flag, roles, and subscription tier. Always returns 200.

**Response `200`**
```json
{
  "authenticated": true,
  "isAdmin": true,
  "roles": ["admin"],
  "subscriptionTier": "pro"
}
```

When unauthenticated: `{ "authenticated": false, "isAdmin": false, "roles": [] }`

---

### `GET /api/admin/whitelist`
List all entries on the email subscription whitelist.

**Auth**: `requireRole(["admin", "owner", "relationship-manager"])`

**Response `200`** Entries with their subscribed counties (each carrying its parent MSA name):
```json
{
  "data": [
    {
      "id": 1,
      "email": "user@example.com",
      "relationshipManagerId": "uuid-or-null",
      "counties": [
        { "county": "San Diego", "state": "CA", "msaName": "San Diego-Chula Vista-Carlsbad, CA" }
      ]
    }
  ],
  "count": 1
}
```

---

### `POST /api/admin/whitelist`
Add an email to the subscription whitelist.

**Auth**: `requireRole(["admin", "owner", "relationship-manager"])`

**Body**
```json
{
  "email": "user@example.com",
  "counties": [{ "county": "San Diego", "state": "CA" }],
  "relationshipManagerId": "uuid-or-null"
}
```

`counties` is a non-empty `(county, state)` replace-list; the server derives each county's MSA from
`COUNTY_TO_MSA` and silently drops untracked counties (same resolution contract as the user
subscription replace-list). A list that resolves to nothing (only untracked counties) is rejected —
an entry with zero counties would receive no email. `relationshipManagerId` is optional.

**Response `201`** `{ "message": "Email added to whitelist successfully" }`

**Errors** `400` invalid data, empty counties list, or no tracked counties · `409` email already on whitelist

---

### `PATCH /api/admin/whitelist/:id`
Update an existing whitelist entry's counties and/or relationship manager.

**Auth**: `requireRole(["admin", "owner", "relationship-manager"])`

**Params**: `id` — integer whitelist entry ID

**Body** (at least one required)
```json
{
  "counties": [{ "county": "Denver", "state": "CO" }],
  "relationshipManagerId": "uuid-or-null"
}
```

`counties` replaces the entry's county set under the same resolution contract as create (non-empty,
untracked counties dropped server-side, a list resolving to no tracked counties rejected); omit it
to leave counties unchanged.

**Response `200`**
```json
{ "message": "Whitelist entry updated", "id": 1, "email": "user@example.com", "relationshipManagerId": "uuid-or-null" }
```

**Errors** `400` invalid id or invalid body (empty counties list) · `404` entry not found

---

### `DELETE /api/admin/whitelist/:id`
Remove an entry from the subscription whitelist.

**Auth**: `requireRole(["admin", "owner", "relationship-manager"])`

**Params**: `id` — integer whitelist entry ID

**Response `200`** `{ "message": "Whitelist entry deleted", "id": 1 }`

**Errors** `400` invalid id · `404` entry not found

---

## 2a. Code Violations `/api/code-violations`

San Diego code-enforcement complaint ingest. **Admin + owner only** (`requireRole(["admin","owner"])`). The upload is Phase 1 only — it archives the raw CSV, opens an audit row, parses + validates, and enqueues one `cv_violations` row per complaint as `pending`, then returns immediately. After enqueuing it fires the consumer drain (`processCodeViolationQueue`) in the background — there is no cron, so address matching, owner resolution, and email notification begin right after upload. Alerts send automatically (no approval step): a matched complaint emails the owning company only when it's **sendable** — a code-enforcement `CE-*` record with an open status (`New` or `Active …`). Closed `CE-*` complaints and all temporary `##TMP-*` records are stored but never emailed.

### `POST /api/code-violations/uploads`
Ingest an Accela code-enforcement CSV export.

**Auth**: `requireRole(["admin", "owner"])`

**Body**: `multipart/form-data`
- `file` — the CSV file (required; `text/csv` or `application/vnd.ms-excel`, ≤ 2 MB)
- `source` — optional, `"manual"` (default) | `"scraper"`

Dedup is by `record_number`: a brand-new complaint inserts as `pending`; an already-seen one refreshes its Accela `status_text`/`description` and its (possibly corrected) address but is **not** re-queued. Rows missing a record number or address (junk lines) are skipped, not enqueued. `rowsTotal` is the count of valid parsed rows (junk excluded); `skipped` is the junk count.

**Response `201`**
```json
{ "uploadId": "uuid", "rowsTotal": 412, "violationsNew": 37, "skipped": 3 }
```

**Errors** `400` no file / wrong file type / file too large (> 2 MB) / invalid `source` / invalid or corrupt CSV · `401` unauth · `403` not admin/owner · `500` ingest failure (the `cv_uploads` row is marked `failed`)

---

### `GET /api/code-violations/uploads`
List ingest runs, most recent first, for the admin results panel.

**Auth**: `requireRole(["admin", "owner"])`

**Response `200`** `{ "uploads": [ /* cv_uploads rows */ ] }`

---

### `GET /api/code-violations/uploads/:id`
Fetch a single ingest run **plus its per-complaint breakdown** — backs the admin detail panel (per-complaint status, resolved owner, and the owning company's alert recipients). Each violation's `recipients` mirror who NOTIFY targets: the matched owner company's operator-group members (`group_members`) narrowed by the master-notifications / verified-email kill-switch (never `company_contacts`); empty when the owner is an individual/unlinked, ungrouped, or has no notifiable members. Whether an alert actually fired is the complaint's `notified` flag (only sendable — new/active `CE-*` — complaints email). `violations` lists only the complaints this upload first enqueued (by `first_seen_upload_id`), so a re-upload of all-duplicate rows returns an empty array.

**Auth**: `requireRole(["admin", "owner"])`

**Params**: `id` — uuid of the `cv_uploads` row

**Response `200`**
```json
{
  "upload": { /* cv_uploads row */ },
  "violations": [
    {
      "id": "uuid",
      "recordNumber": "CE-0542079",
      "recordType": "Complaint",
      "statusText": "New",
      "description": "…",
      "violationDate": "2026-06-26",
      "rawAddress": "991 Worthington St, San Diego CA 92114 United States",
      "processingStatus": "complete",
      "notified": true,
      "errorMessage": null,
      "createdAt": "2026-06-30T12:00:00.000Z",
      "propertyId": "uuid",
      "ownerCompanyId": "uuid",
      "ownerCompanyName": "Acme Holdings LLC",
      "ownerName": "ACME HOLDINGS LLC",
      "recipients": [{ "userId": "uuid", "email": "owner@example.com" }]
    }
  ]
}
```

**Errors** `404` upload not found · `401` unauth · `403` not admin/owner

---

## 3. Users `/api/users`

### `GET /api/users`
List all users with their roles, subscription tier, relationship managers, and account types.

**Auth**: `requireRole(["admin", "owner", "relationship-manager", "member"])`

**Query params** (optional)
| Param | Value | Effect |
|---|---|---|
| `domain` | `arvfinance.com` | Return only ARV team emails |
| `excludeDomain` | `arvfinance.com` | Exclude ARV team emails |

**Response `200`** Array:
```json
[
  {
    "id": "uuid",
    "firstName": "Jane",
    "lastName": "Doe",
    "email": "jane@example.com",
    "phone": "555-123-4567",
    "createdAt": "2024-01-01T00:00:00Z",
    "emailVerifiedAt": "2024-01-01T00:00:00Z",
    "roles": ["member"],
    "subscriptionTier": "basic",
    "relationshipManagers": [
      { "id": "uuid", "firstName": "John", "lastName": "Smith" }
    ],
    "accountTypes": ["investor"]
  }
]
```

---

### `GET /api/users/relationship-managers`
List all users with the relationship-manager role.

**Auth**: `requireRole(["admin", "owner", "relationship-manager", "member"])`

**Response `200`** Array:
```json
[
  {
    "id": "uuid",
    "first_name": "John",
    "last_name": "Smith",
    "phone": "555-000-0000",
    "email": "john@arvfinance.com",
    "roles": ["relationship-manager"]
  }
]
```

---

### `GET /api/users/roles`
List all available role definitions.

**Auth**: `requireRole(["admin", "owner"])`

**Response `200`** `[{ "id": 1, "name": "owner" }, ...]`

---

### `GET /api/users/account-types`
List all available account type options.

**Auth**: `requireRole(["admin", "owner", "relationship-manager", "member"])`

**Response `200`** `[{ "id": 1, "name": "investor" }, ...]`

---

### `POST /api/users/:userId/roles`
Assign an ARV team role to a user. Caller must hold a role that is permitted to assign the requested role. Owner role cannot be assigned via API.

**Auth**: `requireRole(["admin", "owner"])`

**Params**: `userId` — UUID

**Body** `{ "roleName": "member" }`

Valid `roleName` values: `"admin" | "relationship-manager" | "member"`

**Response `201`**
```json
{ "message": "Role assigned", "userId": "uuid", "roleId": 3, "roleName": "member" }
```

**Errors** `400` invalid or missing roleName · `403` not allowed to assign this role or target has higher/equal privilege · `404` user not found · `409` role already assigned

**Side effect**: If `roleName` is `"relationship-manager"` and `POSTMARK_ACCOUNT_TOKEN` is set, a Postmark sender signature is created for the user's email.

---

### `DELETE /api/users/:userId/roles/:role`
Remove an ARV team role from a user. Owner role cannot be removed via API.

**Auth**: `requireRole(["admin", "owner"])`

**Params**: `userId` — UUID · `role` — role name string

**Response `200`**
```json
{ "message": "Role removed", "userId": "uuid", "roleId": 3, "roleName": "member" }
```

**Errors** `400` invalid role · `403` not allowed · `404` user not found or role not assigned

**Side effects**: If removing `"relationship-manager"`, all of that user's RM assignments are cleared and the Postmark sender signature is deleted (if configured).

---

### `PATCH /api/users/:userId`
Update a user's subscription tier, account types, and/or relationship manager assignment.

**Auth**: `requireRole(["admin", "owner"])`

**Params**: `userId` — UUID

**Body** (all fields optional)
```json
{
  "subscriptionTier": "pro",
  "accountTypes": ["investor", "agent"],
  "relationshipManagerId": "uuid-or-null"
}
```

`subscriptionTier` values: `"basic" | "pro" | "premium" | null` (null removes subscription).
`accountTypes` is the full desired set — existing types not in the list are removed.
`relationshipManagerId` null clears the assignment.

**Response `200`** `{ "message": "User updated", "userId": "uuid" }`

**Errors** `400` invalid data or invalid account type · `404` user not found

---

### `DELETE /api/users/:userId`
Permanently delete a user account. Cannot delete yourself or a user with equal/higher privilege.

**Auth**: `requireRole(["admin", "owner"])`

**Params**: `userId` — UUID

**Response `200`** `{ "message": "User deleted", "userId": "uuid" }`

**Errors** `403` self-deletion or target has higher/equal privilege · `404` user not found

---

## 4. Properties `/api/properties`

### `GET /api/properties`
List properties with filtering, pagination, and sorting. Accepts many query params passed directly to the service layer. Powers the buyers/wholesale feeds and table.

**Auth**: App access — `requireSub(["basic","pro","premium"], { bypassRoles: all team roles })`. Any subscription tier or team role. 401 unauth, 403 no-sub/no-role. (The map, detail, suggestions, street view, zip-counts, and transactions endpoints stay public.)

**Key query params**
| Param | Type | Description |
|---|---|---|
| `county` | string | Filter by county name |
| `status` | string | Filter by property status (repeatable) |
| `minPrice` / `maxPrice` | number | Price range |
| `company` | string | Filter by company name (fallback when no `companyId` is resolved) |
| `companyId` / `companyRole` | string | Filter by company id, optionally pinned to `buyer`/`seller` |
| `groupId` | string | Filter by operator group — matches every member company's transactions via the shared involvement predicate; `companyRole` applies; `companyId` wins when both are present. Suppresses `dateRange` like a company selection |
| `page` | number | Page number (default `1`; malformed values fall back to the default) |
| `limit` | number | Results per page (default `10`, max `100`; malformed values fall back to the default) |
| `skipCount` | string | `"true"` on page > 1 skips the COUNT query; the client reuses page 1's total |

**Response `200`** `{ properties: [...], total: number | null, hasMore: boolean, page: number, limit: number }` — `total` is `null` when the COUNT is skipped (`skipCount=true` on page > 1).

List rows carry no supplemental-tax data (the v1 `supplementalTaxBill` field was removed in v2).
Per-transaction supplemental-tax fields live on `GET /api/properties/:id`, visible to admin/owner
only. See `access-control.md` §5.2.

---

### `POST /api/properties`
Create a property record by fetching from the SFR external API.

**Auth**: `requireRole(["admin", "owner"])`

**Body**
```json
{ "address": "123 Main St", "city": "San Diego", "state": "CA", "zipCode": "92101" }
```

**Response `200`**
```json
{ "message": "Property created successfully", "id": "uuid", "sfrPropertyId": "sfr-123" }
```

Also returns `"Property updated successfully"` if the property already existed and was refreshed.

**Errors** `400` missing fields · `404` not found in SFR API · `500` SFR API not configured

---

### `GET /api/properties/map`
Lightweight list of property coordinates and basic metadata for map rendering. Restricted to a viewport box when bounds are supplied, so only pins currently in view are returned.

**Auth**: Public

**Query params**: `county`, `status` (repeatable), `dateRange`, `companyId`, `groupId` (operator group — all member companies; `companyId` wins when both are present), `companyRole`, `zipcode`, `city` (filters) · `south`, `west`, `north`, `east` (optional viewport box — all four required together; `400` if partially specified or non-numeric). Omit the box to fetch the full filtered set.

**Response `200`** Array of `{ id, latitude, longitude, city, zipcode, county, status, statuses, price, buyerId, sellerId, propertyOwner, ... }`

---

### `GET /api/properties/map/extent`
Bounding box + count of the qualifying set for the current filters/company, used to center and zoom the map without loading every pin.

**Auth**: Public

**Query params**: `county`, `status` (repeatable), `dateRange`, `companyId`, `groupId`, `companyRole`, `zipcode`, `city`

**Response `200`** `{ minLat, maxLat, minLng, maxLng, count }`, or `null` when no properties with coordinates match.

---

### `GET /api/properties/map/regions`
Property counts grouped by county for the national overview layer (the zoomed-out MSA bubbles). Cross-region by design — ignores county/company/location filters so every region is represented, but respects status + date so the overview matches the zoomed-in view. No pin data is returned.

**Auth**: Public

**Query params**: `status` (repeatable), `dateRange`

**Response `200`** `[{ county: "san diego", count: 707 }]` — county is lower-cased + trimmed; the client sums these into per-MSA bubbles.

---

### `GET /api/properties/zip-counts`
Property counts grouped by zip code. Used to populate filter dropdowns.

**Auth**: Public

**Query params**: `county`, `msa`, `status` (repeatable), `dateRange`, `companyId`, `groupId`, `companyRole` — the company/group involvement semantics match `GET /api/properties`.

**Response `200`** `[{ zipCode: "92101", count: 14 }]`

---

### `GET /api/properties/suggestions`
Autocomplete suggestions for property search.

**Auth**: Public

**Query params**: `search` (min 2 chars) · `county` (optional filter)

**Response `200`** Array of suggestion objects. Returns `[]` if `search` is shorter than 2 characters.

---

### `GET /api/properties/streetview`
Resolves a property's Street View (or satellite) image, falling back through cache → Street View → satellite. Images are cached in Supabase Storage.

**Auth**: Public

**Query params**: `address` (required), `city`, `state`, `size` (default `600x400`), `sfrPropertyId`

**Response**: `302` redirect to the Supabase CDN URL for the image (the common path; `Cache-Control: max-age=604800`). Legacy rows still held as `bytea` are streamed as `200` with an `ETag` (honors `If-None-Match` → `304`). `404` with a short `Cache-Control` when no image is available for the address; `400` if `address` is missing.

---

### `GET /api/properties/:id`
Get a single property by its internal UUID.

**Auth**: Public

**Response `200`** Full property object · `404` not found

The response includes `supplementalTaxBill` — the signed CA supplemental-tax total for the
displayed sale (negative = bill owed, positive = refund). **Admin/owner only**: resolved from the
session role; all other callers (including unauthenticated — the route is public) receive `null`.
See `access-control.md` §5.2.

---

### `PATCH /api/properties/:id`
Update a property's `isArvFunded` flag, statuses, transactions, and/or assignment marking.
At least one field must be provided.

**Auth**: `requireRole(["admin", "owner", "relationship-manager"])`

**Body** (all fields optional)
```json
{
  "isArvFunded": true,
  "statuses": ["in-renovation"],
  "deletedTransactionIds": [123],
  "assignments": [{ "transactionId": 123, "isAssignment": true, "assignorName": "ACME WHOLESALE LLC" }]
}
```
`assignments` marks (or clears) the assignment flag + assignor on existing sale transactions.
`isAssignment: false` clears it; `assignorName` resolves to an existing company when it matches
one (individuals keep only the name).

**Response `200`** `{ "message": "Property updated", "id": "uuid", "isArvFunded": true, "statuses": [...] }`

**Errors** `400` validation failed · `404` not found

---

### `DELETE /api/properties/:id`
Delete a property record.

**Auth**: `requireRole(["admin", "owner"])`

**Response `200`** `{ "message": "Property deleted successfully", "id": "uuid", "sfrPropertyId": "sfr-123" }`

**Errors** `404` not found

---

### `GET /api/properties/:id/transactions`
Get all transaction records for a property.

**Auth**: Public

**Response `200`** Array of transaction objects, each including `isAssignment`, `assignorId`, and
`assignorName` (the assignment metadata on the sale row).

---

## 5. Companies `/api/companies`

### `GET /api/companies`
List companies (buyer/seller directory) with filtering and pagination.

**Auth**: Public

**Query params**
| Param | Type | Description |
|---|---|---|
| `county` | string | Filter by county |
| `search` | string | Search by company name |
| `sort` | string | Sort field |
| `page` | number | Page number |
| `limit` | number | Results per page |

**Response `200`** `{ companies: [...], total: number, page: number }`

---

### `GET /api/companies/contacts/suggestions`
Autocomplete suggestions for company/contact search.

**Auth**: Public

**Query params**: `search` (min 2 chars) · `county` (optional)

**Response `200`** Array of suggestion objects. Returns `[]` if `search` is too short.

---

### `GET /api/companies/wholesale-leaderboard`
Top wholesale companies by transaction count.

**Auth**: Public

**Query params**: `county` (optional)

**Response `200`** `[{ companyName: "...", count: 42, ... }]`

---

### `GET /api/companies/leaderboard`
Top zip codes and buyers within an MSA.

**Auth**: Public

**Query params**: `county` (defaults to `"San Diego"`)

**Response `200`** `{ topZips: [...], topBuyers: [...] }`

---

### `GET /api/companies/groups`
Public groups directory (Data-app Groups tab): multi-company operator groups ranked by the active
sort, scoped to the selected county. Mirrors the company directory's sort/search/county/pagination
contract. Distinct from the admin `/api/groups` router (which owns group mutation and is role-gated).

**Auth**: Public

**Query params**
| Param | Type | Description |
|---|---|---|
| `county` | string \| string[] | Filter by county (repeatable); a group appears when ≥1 member operates in a selected county |
| `search` | string | Search by group name (min 2 chars) |
| `sort` | string | One of `most-properties`, `most-sold-properties`, `most-sold-properties-all-time`, `most-bought-properties`, `most-bought-properties-all-time`, `buys-wholesale`, `wholesalers` (invalid/`new-buyers` → `most-properties`) |
| `page` | number | Page number |
| `limit` | number | Results per page (max 100) |

**Behavior**: Only groups with **two or more** member companies appear (the gate is evaluated
globally; auto-created singletons never appear). Aggregate counts are computed by grouping the
per-sort count queries by `group_id` — de-duplicated on the distinct-property sorts, intra-group
transfers included. Stats are county-scoped; a group with a zero count for the active sort is hidden.
Group names are RAW (format with `formatCompanyName` at the render edge).

**Response `200`** `{ groups: GroupDirectoryRow[], total: number, page: number, limit: number }` where
each row is `{ id, name, companyCount, propertyCount, propertiesSoldCount, propertiesSoldCountAllTime, propertiesBoughtCount, propertiesBoughtCountAllTime, wholesaleBuyCount, wholesalerCount }` with exactly one count populated for the active sort.

---

### `GET /api/companies/groups/:id`
One group's directory row under the same visibility rules as the directory (2+ members, county
scoping, non-zero count for the sort). Backs `?group=` deep-link validation in the Data app.

**Auth**: Public

**Query params**: `county` (repeatable), `sort` (same set as the directory; invalid → `most-properties`)

**Response `200`** `{ group: GroupDirectoryRow }` · **`404`** when the group is stale for this view — disbanded, under two members, no activity in the selected counties, or a malformed/unknown id.

---

### `GET /api/companies/:id`
Get a single company with contact info and transaction history.

**Auth**: Public

**Query params**: `county` (optional context for transaction filtering)

**Response `200`** Full company object · `404` not found

---

### `PATCH /api/companies/:id`
Update company metadata (name, notes, etc.).

**Auth**: `requireRole(["admin", "owner"])`

**Body** (validated via `updateCompanySchema` — all fields optional)
```json
{ "name": "New Company Name", "notes": "Updated notes" }
```

**Response `200`** Updated company object

**Errors** `400` validation failed or no fields · `404` not found · `409` name already taken

---

### `POST /api/companies/:id/contacts`
Add a contact person to a company.

**Auth**: `requireRole(["admin", "owner"])`

**Body** (validated via `insertCompanyContactSchema`)
```json
{ "name": "Jane Doe", "email": "jane@example.com", "phone": "555-123-4567", "title": "Manager" }
```

**Response `201`** Created contact object · `404` company not found

---

### `PATCH /api/companies/:id/contacts/:contactId`
Update an existing company contact.

**Auth**: `requireRole(["admin", "owner"])`

**Body** (validated via `updateCompanyContactSchema` — all fields optional)

**Response `200`** Updated contact object · `400` invalid contactId or no fields · `404` contact not found

---

### `DELETE /api/companies/:id/contacts/:contactId`
Delete a company contact.

**Auth**: `requireRole(["admin", "owner"])`

**Response `204`** No content · `404` contact not found

---

### `POST /api/companies/:id/enrich`
Fetch and apply company data from OpenCorporates.

**Auth**: `requireRole(["admin", "owner"])`

**Body** `{ "state": "CA" }` — 2-letter state code required

**Response `200`** `{ "message": "Company enriched successfully" }`

**Errors** `400` invalid state or unsupported jurisdiction · `404` company not found or no match found · `502` OpenCorporates API error

---

### `GET /api/users/me/company-memberships`
Get every company the authenticated user is associated with **through their group(s)** — one row per
company across all the groups they belong to (companies resolve via `group_members`). Backs the
Profile "My Companies" tab.

**Auth**: `requireAuth`

**Response `200`**
```json
{
  "data": [
    {
      "companyId": "uuid",
      "companyName": "ACME CAPITAL LLC",
      "groupId": "uuid",
      "groupName": "Acme",
      "joinedAt": "2026-06-03T00:00:00Z"
    }
  ],
  "count": 1
}
```

Rows are wire-shaped `UserGroupCompany` (`shared/types/groups.ts`). `joinedAt` is the user's
`group_members.created_at` for the group the company belongs to.

---

### `GET /api/users/:userId/groups`
Get the groups a user is a member of (admin group-membership editor — backs EditUser). One row per
group the user belongs to.

**Auth**: `requireRole(["admin", "owner", "relationship-manager"])`

**Response `200`**
```json
{
  "data": [
    { "groupId": "uuid", "groupName": "Acme", "role": "owner", "joinedAt": "2026-06-03T00:00:00Z" }
  ],
  "count": 1
}
```

Rows are wire-shaped `UserGroupMembership` (`shared/types/groups.ts`); `role` is `"owner"`,
`"member"`, or `null`.

**Errors** `400` invalid user ID

---

### `PUT /api/users/:userId/groups`
Replace a user's group memberships with exactly the given set (adds missing, removes absent).
Writes `group_members`.

**Auth**: `requireRole(["admin", "owner"])`

**Body**
```json
{ "groupIds": ["uuid", "uuid"] }
```

**Response `200`** `{ "message": "Group memberships updated" }`

**Errors** `400` invalid user ID, invalid body, or unknown group ids

---

## 5b. Company Groups `/api/groups`

Admin/owner-only management of operator groups (`requireRole(["admin","owner"])` on every route — see
access-control.md §5.3b). A company belongs to at most one group; grouping is non-destructive
(disbanding a group reverts its companies to ungrouped and ends its memberships).

### `GET /api/groups`
List all groups (name order) with their company + member counts. Backs the Groups admin tab list.

**Auth**: `requireRole(["admin", "owner"])`

**Response `200`** `{ "data": [{ "id": "uuid", "name": "...", "description": "..." | null, "createdAt": "iso", "updatedAt": "iso" | null, "companyCount": 2, "memberCount": 3 }] }`

---

### `GET /api/groups/:id`
Get one group with its companies and members. Backs the manage-group dialog.

**Auth**: `requireRole(["admin", "owner"])`

**Response `200`**
```json
{
  "group": { "id": "uuid", "name": "...", "description": "..." | null, "createdAt": "iso", "updatedAt": "iso" | null },
  "companies": [{ "id": "uuid", "companyName": "RAW NAME LLC" }],
  "members": [{ "userId": "uuid", "firstName": "...", "lastName": "...", "email": "...", "role": "owner" | "member" | null, "createdAt": "iso" }]
}
```
`companyName` is the RAW DB name (format with `formatCompanyName` at the render edge).

**Errors** `400` invalid id · `404` group not found

---

### `POST /api/groups`
Create an operator group.

**Auth**: `requireRole(["admin", "owner"])`

**Body**
```json
{ "name": "Vertigo Rev", "description": "Multi-LLC operator" }
```
`name` is required (1–255 chars, must be unique); `description` is optional (max 1000).

**Response `201`** `{ "message": "Group created", "group": { ...companyGroup } }`

**Errors** `400` invalid body · `409` a group with this name already exists

---

### `PATCH /api/groups/:id`
Rename a group and/or edit its description.

**Auth**: `requireRole(["admin", "owner"])`

**Body** — at least one of `name` (1–255) or `description` (string or `null` to clear).
```json
{ "name": "Vertigo Rev Holdings", "description": null }
```

**Response `200`** `{ "message": "Group updated", "group": { ...companyGroup } }`

**Errors** `400` invalid id or body · `404` group not found · `409` name already taken

---

### `DELETE /api/groups/:id`
Disband (delete) a group. Its companies revert to ungrouped (`group_id` SET NULL) and its memberships end (cascade).

**Auth**: `requireRole(["admin", "owner"])`

**Response `200`** `{ "message": "Group disbanded", "id": "uuid" }`

**Errors** `400` invalid id · `404` group not found

---

### `POST /api/groups/:id/merge`
Merge source group `:id` (A) into a target group (B): unions A's companies and members into B, then deletes A. Non-destructive at the company level — no company row is deleted, only re-pointed to B. On a `(user_id, group_id)` collision the existing B membership is kept (its `role` is not overwritten).

**Auth**: `requireRole(["admin", "owner"])`

**Body** `{ "targetGroupId": "uuid" }` — B, the surviving group (required, must differ from `:id`).

**Response `200`** `{ "message": "Groups merged", "group": { ...companyGroup }, "companiesMoved": 2, "membersMoved": 3 }` — `group` is the surviving target B; `companiesMoved` is the number of companies re-pointed to B; `membersMoved` is the number of A's members newly added to B (colliding members already in B are not counted).

**Errors** `400` invalid id or body, or source === target · `404` source or target group not found

---

### `POST /api/groups/:id/companies`
Add a company to a group. If the company already belongs to another group it is **moved** (one group per company); re-adding a company already in this group is an idempotent success.

**Auth**: `requireRole(["admin", "owner"])`

**Body** `{ "companyId": "uuid" }`

**Response `200`** `{ "message": "Company added to group" }`

**Errors** `400` invalid id or body · `404` group or company not found

---

### `DELETE /api/groups/:id/companies/:companyId`
Remove a company from a group, reverting it to ungrouped.

**Auth**: `requireRole(["admin", "owner"])`

**Response `200`** `{ "message": "Company removed from group" }`

**Errors** `400` invalid id · `404` company not found or not in that group

---

### `POST /api/groups/:id/members`
Add a user to a group (associating them with every company in it).

**Auth**: `requireRole(["admin", "owner"])`

**Body** — `role` optional (`owner` | `member`; omitted → null).
```json
{ "userId": "uuid", "role": "member" }
```

**Response `201`** `{ "message": "Member added to group", "member": { ...groupMember } }`

**Errors** `400` invalid id or body · `404` group or user not found · `409` already a member

---

### `DELETE /api/groups/:id/members/:userId`
Remove a user's group membership.

**Auth**: `requireRole(["admin", "owner"])`

**Response `200`** `{ "message": "Member removed from group" }`

**Errors** `400` invalid id · `404` not a member

---

### `PATCH /api/groups/:id/members/:userId`
Set a group member's role.

**Auth**: `requireRole(["admin", "owner"])`

**Body** `{ "role": "owner" }` (`owner` | `member`, required)

**Response `200`** `{ "message": "Member role updated", "member": { ...groupMember } }`

**Errors** `400` invalid id or body · `404` not a member

---

### `POST /api/groups/companies/:companyId/members`
Add a member to a company (auto-singleton). If the company has no group, a singleton group named after the company's **raw** name is auto-created and the company linked to it; otherwise the member is added to the company's existing group.

**Auth**: `requireRole(["admin", "owner"])`

**Body** — `role` optional (`owner` | `member`).
```json
{ "userId": "uuid", "role": "member" }
```

**Response `201`** `{ "message": "Member added to company", "group": { ...companyGroup }, "member": { ...groupMember } }`

**Errors** `400` invalid id or body · `404` company or user not found · `409` already a member of the resolved group

---

## 6. Deals `/api/deals`

### `GET /api/deals`
List one page of the unified deals feed, newest first.

**Auth**: App access — `requireSub(["basic","pro","premium"], { bypassRoles: all team roles })`. Any subscription tier or team role; 401 unauth, 403 no-sub/no-role. (The whole Deals experience is gated.)

**Query params** (all optional)
| Param | Type | Description |
|---|---|---|
| `type` | `DealType` | Narrows to a single deal type (`wholesale`, `agent`, `reo`, or `sold`); an invalid value is ignored. Omit for all types. |
| `page` | number | 1-based page (default `1`) |
| `limit` | number | Page size (default `10`, max `50`) |
| `userId` | string | Filter by deal owner |
| `county` | string, repeatable | County set for `county IN (...)` |
| `msa` | string | Restricts the county set to that MSA's tracked counties — with `msa`, an empty or foreign county set matches no deals (one-MSA-at-a-time contract, as on `GET /api/properties`) |

**Response `200`** `{ deals, total, hasMore, page, limit }`. `deals` is one page of deal objects (each with `links` and a relative `streetViewUrl`; deals the caller owns also carry a `bidCount` of offers received, omitted otherwise since offers are poster-private). `total` is the count of all matching deals; `hasMore` indicates further pages. Top buyers are **not** included — fetch them lazily via `GET /api/deals/:id/top-buyers`.

---

### `GET /api/deals/:id`
Get a single deal by integer ID.

**Auth**: App access — `requireSub(["basic","pro","premium"], { bypassRoles: all team roles })`. Any subscription tier or team role; 401 unauth, 403 no-sub/no-role.

**Response `200`** Full deal object, enriched like the list (`links`, `streetViewUrl`; a deal the caller owns also carries `bidCount`) · `400` invalid id · `404` not found

---

### `GET /api/deals/msas`
List the MSAs available in the deal-form location dropdown.

**Auth**: App access — `requireSub(["basic","pro","premium"], { bypassRoles: all team roles })`. Any subscription tier or team role; 401 unauth, 403 no-sub/no-role.

**Response `200`** Array of `{ id, name }` MSA objects.

---

### `GET /api/deals/locations`
Distinct cities (with state) and zip codes across all deals — powers the location-search autocomplete independently of the paginated list.

**Auth**: App access — `requireSub(["basic","pro","premium"], { bypassRoles: all team roles })`. Any subscription tier or team role; 401 unauth, 403 no-sub/no-role.

**Response `200`** `{ cities: { city, state }[], zips: string[] }`.

---

### `GET /api/deals/:id/top-buyers`
Top buyers (up to 3) for a deal's zip — recent arms-length purchasers in the area. Fetched on demand so the deal list never carries this data. **Owner-only** (or a privileged team member); enforced in the service.

**Auth**: App access — `requireSub(["basic","pro","premium"], { bypassRoles: all team roles })` + ownership in service. 401 unauth, 403 not owner/privileged, 404 deal not found.

**Response `200`** `{ topBuyers: { companyId, companyName, contactName }[] }` (empty array when the deal has no zip or no recent buyers).

---

### `POST /api/deals`
Create a new deal.

**Auth**: `requireSub(["basic", "pro", "premium"], { bypassRoles: ["admin", "owner", "relationship-manager", "member"] })`

**Body**
```json
{
  "userId": "uuid",
  "address": "123 Main St",
  "city": "San Diego",
  "state": "CA",
  "zipCode": "92101",
  "dealType": "wholesale",
  "price": 350000,
  "potentialARV": 550000,
  "estimatedBudget": 80000,
  "showingTime": "Saturday 10am",
  "beds": 3,
  "baths": 2,
  "sqft": 1400,
  "propertyType": "SFR",
  "notes": "Great deal!",
  "links": [],
  "sendNotifications": true,
  "isArvExclusive": false,
  "onBehalfOfEmail": null,
  "adminNotes": null
}
```

`userId` must match the authenticated session user. `isArvExclusive` and `onBehalfOfEmail` are silently stripped for non-privileged callers.

`dealType` values: `"wholesale" | "agent" | "sold" | "reo"`

**Response `201`** `{ "message": "Deal posted successfully", "deal": { ...deal } }`

**Side effect**: If `sendNotifications` is `true`, a deal alert email is sent to MSA subscribers (fire-and-forget after response).

---

### `PATCH /api/deals/:id`
Update an existing deal. Ownership enforced in service (own deal, or admin/owner role).

**Auth**: `requireSub(["pro", "premium"], { bypassRoles: [...all roles] })`

**Params**: `id` — integer deal ID

**Body**: Same optional fields as POST (excluding `userId`).

**Response `200`** `{ "message": "Deal updated successfully", "deal": { ...deal } }`

**Side effect**: If deal type changes to `"sold"` or price changes, a notification email is sent (fire-and-forget).

**Errors** `400` invalid id · `401` not authenticated · `403` ownership check failed · `404` not found

---

### `DELETE /api/deals/:id`
Delete a deal. Ownership enforced in service.

**Auth**: `requireSub(["basic", "pro", "premium"], { bypassRoles: [...all roles] })`

**Response `200`** `{ "message": "Deal deleted successfully", "id": 1 }`

**Errors** `400` invalid id · `401` not authenticated · `403` ownership check failed · `404` not found

---

### `POST /api/deals/:id/request-info`
Request contact info for a deal — sends an email to the deal poster's RM (or default contact).

**Auth**: App access — `requireSub(["basic","pro","premium"], { bypassRoles: all team roles })`. Any subscription tier or team role; 401 unauth, 403 no-sub/no-role. (Previously public.)

**Body** (validated via `requestDealInfoSchema`)
```json
{
  "message": "I'm interested in this property."
}
```

**Response `200`** `{ "message": "Request sent successfully" }`

**Errors** `400` invalid id or body · `401` not authenticated

---

### `POST /api/deals/:id/offers`
Submit a non-binding offer ("bid") on a deal. Records the offer (full history — repeat offers are allowed) and sends a bell notification to the deal's poster (no email). Contact fields are a snapshot of what the bidder entered.

**Auth**: `requireSub(["basic", "pro", "premium"], { bypassRoles: ["admin", "owner", "relationship-manager", "member"] })` — any subscription tier or any team role.

**Body** (validated via `submitOfferSchema`)
```json
{
  "amount": 325000,
  "firstName": "Jane",
  "lastName": "Investor",
  "email": "jane@example.com",
  "phone": "(555) 111-2222"
}
```
`phone` is optional; `amount` must be greater than 0.

**Response `201`** `{ "message": "Offer submitted successfully" }`

**Errors** `400` invalid id or body · `401` not authenticated · `403` no qualifying tier/role · `404` deal not found

---

### `GET /api/deals/:id/offers`
List the offers submitted on a deal, newest first. Offers are poster-private.

**Auth**: Authenticated; the service allows only the deal owner or an `admin`/`owner`/`relationship-manager`.

**Response `200`**
```json
{
  "offers": [
    {
      "id": 12,
      "dealId": 5,
      "bidderUserId": "…",
      "amount": "325000.00",
      "firstName": "Jane",
      "lastName": "Investor",
      "email": "jane@example.com",
      "phone": "(555) 111-2222",
      "createdAt": "2026-06-12T00:00:00.000Z"
    }
  ]
}
```

**Errors** `400` invalid id · `401` not authenticated · `403` not the owner or privileged · `404` deal not found

---

### `DELETE /api/deals/:id/offers/:offerId`
Remove a single offer from a deal.

**Auth**: Authenticated; the service allows only the deal owner or an `admin`/`owner`/`relationship-manager`.

**Response `200`** `{ "message": "Offer removed successfully", "id": 12 }`

**Errors** `400` invalid id · `401` not authenticated · `403` not the owner or privileged · `404` offer or deal not found (also `404` when the offer belongs to a different deal)

---

## 7. Vendors `/api/vendors`

### `GET /api/vendors`
List all vendors, optionally filtered by category.

**Auth**: Public

**Query params**: `categoryIds` — comma-separated integers (e.g. `?categoryIds=1,3`)

**Response `200`** Array of vendor objects:
```json
[
  {
    "id": "uuid",
    "name": "ABC Plumbing",
    "description": "Full-service plumbing",
    "address": "123 Trade St",
    "city": "San Diego",
    "state": "CA",
    "zipCode": "92101",
    "phone": "555-123-4567",
    "website": "https://abcplumbing.com",
    "logoUrl": "https://...",
    "headerUrl": "https://...",
    "isRecommended": true,
    "categories": [{ "id": 2, "name": "Plumbing", "slug": "plumbing", "iconName": "Wrench" }]
  }
]
```

---

### `GET /api/vendors/recommended`
List vendors flagged as recommended.

**Auth**: Public

**Response `200`** Same shape as `GET /api/vendors`

---

### `GET /api/vendors/:vendorId`
Get a single vendor by UUID with full category data.

**Auth**: Public

**Response `200`** Single vendor object · `404` not found

---

### `POST /api/vendors`
Create a new vendor.

**Auth**: `requireRole(["admin", "owner"])`

**Body** (validated via `vendorInputSchema`)
```json
{
  "name": "ABC Plumbing",
  "description": "Full-service plumbing",
  "address": "123 Trade St",
  "city": "San Diego",
  "state": "CA",
  "zipCode": "92101",
  "phone": "555-123-4567",
  "website": "https://abcplumbing.com",
  "categoryIds": [2, 5]
}
```

**Response `201`** Created vendor object

---

### `PUT /api/vendors/:vendorId`
Update a vendor's details and category assignments.

**Auth**: `requireRole(["admin", "owner"])`

**Body**: Same shape as POST, all fields optional (validated via `updateVendorSchema`).

**Response `200`** Updated vendor object · `404` not found

---

### `PUT /api/vendors/:vendorId/recommend`
Toggle the `isRecommended` flag on a vendor.

**Auth**: `requireRole(["admin", "owner"])`

**Response `200`** `{ "id": "uuid", "isRecommended": true }`

---

### `DELETE /api/vendors/:vendorId`
Delete a vendor and all associated images from storage.

**Auth**: `requireRole(["admin", "owner"])`

**Response `204`** No content · `404` not found

---

### `POST /api/vendors/:vendorId/logo`
Upload or replace a vendor's logo image.

**Auth**: `requireRole(["admin", "owner"])`

**Content-Type**: `multipart/form-data`

**Body**: `image` field — JPEG or PNG, max 5 MB.

**Response `200`** `{ "message": "Logo uploaded", "logoUrl": "https://..." }`

---

### `DELETE /api/vendors/:vendorId/logo`
Remove a vendor's logo.

**Auth**: `requireRole(["admin", "owner"])`

**Response `200`** `{ "message": "Logo removed" }`

---

### `POST /api/vendors/:vendorId/header`
Upload or replace a vendor's header image.

**Auth**: `requireRole(["admin", "owner"])`

**Content-Type**: `multipart/form-data`

**Body**: `image` field — JPEG or PNG, max 5 MB.

**Response `200`** `{ "message": "Header uploaded", "headerUrl": "https://..." }`

---

### `DELETE /api/vendors/:vendorId/header`
Remove a vendor's header image.

**Auth**: `requireRole(["admin", "owner"])`

**Response `200`** `{ "message": "Header removed" }`

---

## 8. Posts `/api/posts`

### `GET /api/posts`
List community activity feed posts with optional filters and pagination.

**Auth**: Public

**Query params** (all optional)
| Param | Type | Description |
|---|---|---|
| `categoryId` | integer | Filter by category |
| `vendorId` | string (UUID) | Filter to posts mentioning a vendor |
| `userId` | string (UUID) | Filter by post author |
| `page` | integer | Page number (default 1) |
| `limit` | integer | Results per page (default varies) |

**Response `200`** Array of post objects:
```json
[
  {
    "id": "uuid",
    "title": "Finished a flip in North Park",
    "content": "<p>HTML content with mention marks</p>",
    "address": "123 Main St",
    "city": "San Diego",
    "state": "CA",
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z",
    "userId": "uuid",
    "authorFirstName": "Jane",
    "authorLastName": "Doe",
    "authorProfileImageUrl": "https://...",
    "likeCount": 4,
    "commentCount": 2,
    "categories": [{ "id": 2, "name": "Plumbing", "slug": "plumbing", "iconName": "Wrench" }],
    "vendorTags": [{ "id": "uuid", "name": "ABC Plumbing" }],
    "images": [{ "id": 1, "imageUrl": "https://...", "displayOrder": 0 }]
  }
]
```

---

### `GET /api/posts/:postId`
Get a single post by UUID with full enrichment (same shape as list, plus `userTags`).

**Auth**: Public

**Response `200`** Single post object including `userTags: [{ id, firstName, lastName }]` · `404` not found

---

### `POST /api/posts`
Create a community post.

**Auth**: `requireAuth`

**Body**
```json
{
  "title": "Finished a flip",
  "content": "<p>TipTap HTML content</p>",
  "address": "123 Main St",
  "city": "San Diego",
  "state": "CA",
  "categoryIds": [2],
  "vendorIds": ["uuid"],
  "taggedUserIds": ["uuid"]
}
```

`title` and `content` are required. All other fields optional.

**Response `201`** `{ "message": "Post created successfully", "post": { ...post } }`

---

### `PUT /api/posts/:postId`
Update a post. Ownership enforced in service (author, admin, or owner).

**Auth**: `requireAuth`

**Body**: Same optional fields as POST.

**Response `200`** `{ "message": "Post updated successfully", "post": { ...post } }`

**Errors** `401` not authenticated · `403` not the author or admin/owner · `404` not found

---

### `DELETE /api/posts/:postId`
Delete a post. Ownership enforced in service.

**Auth**: `requireAuth`

**Response `200`** `{ "message": "Post deleted successfully", "id": "uuid" }`

**Errors** `401` · `403` · `404`

---

### `POST /api/posts/:postId/images`
Upload an image to a post (max 5 per post). Ownership enforced in service.

**Auth**: `requireAuth`

**Content-Type**: `multipart/form-data`

**Body**: `image` field — JPEG or PNG, max 5 MB.

**Response `201`** `{ "message": "Image uploaded", "image": { "id": 1, "imageUrl": "https://...", "displayOrder": 4 } }`

**Errors** `400` no file · `403` not the author · `404` post not found · `422` max images reached

---

### `DELETE /api/posts/:postId/images/:imageId`
Delete an image from a post. Ownership enforced in service.

**Auth**: `requireAuth`

**Params**: `imageId` — integer

**Response `200`** `{ "message": "Image deleted", "id": 1 }`

**Errors** `400` invalid imageId · `403` · `404`

---

## 9. Categories `/api/categories`

### `GET /api/categories`
List all vendor/post categories with vendor counts.

**Auth**: Public

**Response `200`**
```json
[
  {
    "id": 2,
    "name": "Plumbing",
    "slug": "plumbing",
    "description": "Pipes, water heaters, and more",
    "iconName": "Wrench",
    "vendorCount": 5
  }
]
```

---

### `GET /api/categories/:categoryId/vendors`
List all vendors in a category.

**Auth**: Public

**Response `200`** Array of vendor objects (same shape as `GET /api/vendors`) · `400` invalid categoryId

---

### `GET /api/categories/:categoryId/posts`
List posts tagged with a category (paginated).

**Auth**: Public

**Query params**: `page` · `limit`

**Response `200`** Array of post objects (same shape as `GET /api/posts`) · `400` invalid categoryId

---

## 10. Contact `/api/contact`

### `POST /api/contact`
Submit a contact form message. Sends an email to the user's relationship manager (if authenticated and has one) or the default contact address.

**Auth**: Public (reads session if present)

**Body**
```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane@example.com",
  "phone": "5551234567",
  "subject": "Question about a deal",
  "message": "I would like to learn more..."
}
```

**Response `204`** No Content (message sent)

**Errors** `400` validation failed · `500` email sending error

---

## 11. Geocoding `/api/geocoding`

### `GET /api/geocoding/county`
Reverse geocode a coordinate pair to a US county name. Proxies the US Census Bureau Geocoder API to avoid browser CORS restrictions.

**Auth**: Public

**Query params**
| Param | Type | Required | Description |
|---|---|---|---|
| `latitude` | number | Yes | Decimal latitude |
| `longitude` | number | Yes | Decimal longitude |

**Response `200`** `{ "county": "San Diego" }`

**Errors** `400` missing or invalid params · `404` no county found for coordinates · `500` Census API error

---

## 12. Mastermind — Channels & Messages `/api/channels`, `/api/messages`

The first slices of the Mastermind app (4th app). Access = any subscription tier OR any team
role, via `requireMastermind` (a configured `requireSub(["basic","pro","premium"], { bypassRoles: ["admin","owner","relationship-manager","member"] })`). Channel management is admin/owner only.
Membership is implicit in Phase 1: every eligible user can read every public, non-archived
channel. **Admin-only channels** (`channels.is_admin_only = true`, e.g. `#admin`) are the
exception — visible/usable by `admin`/`owner` only. They are excluded from `GET /api/channels`
for non-admins, and every per-channel route (`/messages` GET+POST, `/read`, `/members`, `/pin`
GET, `/messages/:id/reactions` POST+DELETE) returns **404** for a non-admin caller (existence is
never disclosed). This is enforced in the services, not the route middleware. See
[`access-control.md` §5.12–§5.13](./access-control.md).

### `GET /api/channels`
List public channels.

**Auth**: `requireMastermind`

**Query params** (optional)
| Param | Type | Description |
|---|---|---|
| `includeArchived` | boolean (`"true"`) | Include archived channels. **Honored only for admin/owner**; ignored for everyone else. |

**Response `200`** `{ "channels": [ { "id": "uuid", "name": "san-diego-market", "description": "…", "type": "public", "isArchived": false, "isAdminOnly": false, "createdBy": "uuid|null", "createdAt": "…", "updatedAt": "…", "unreadCount": 3, "hasMention": false } ] }`

Channels are returned in display order: `#general` first, then market channels (`…-market`),
then everything else, then **admin-only channels last**. Admin-only channels are **omitted
entirely** for non-admin callers.

`unreadCount` / `hasMention` are computed per-caller from `channel_members.last_read_at`: a
channel the caller has never opened (no `channel_members` row) returns `unreadCount: 0`;
`hasMention` reflects stored `@user` mention rows only (`@here`/`@channel` broadcasts are
expanded at notify time — Part 8).

**Errors** `401` not authenticated · `403` no role and no subscription

---

### `PATCH /api/channels/:id/read`
Advance the caller's read-state for a channel (clears its unread badge). Upserts the caller's
`channel_members` row — the **lazy membership join point** — setting `last_read_at = now()` and
`last_read_message_id` to the channel's latest message. The client debounces this call while a
channel is being viewed.

**Auth**: `requireMastermind`

**Params**: `id` — channel UUID

**Response `204`** (no body)

**Errors** `400` invalid channel id · `401` not authenticated · `403` no role and no subscription · `404` channel not found, or admin-only and caller is not admin/owner

---

### `POST /api/channels`
Create a public channel.

**Auth**: `requireRole(["admin", "owner"])`

**Body** (validated via `createChannelSchema`)
```json
{
  "name": "san-diego-market",
  "description": "San Diego MSA market talk"
}
```

`name` must be a lowercase slug (`^[a-z0-9-]+$`, ≤80 chars) and unique. `description` is optional (≤500 chars).

**Response `201`** `{ "message": "Channel created", "channel": { ...channel } }`

**Errors** `400` invalid input · `401` not authenticated · `403` not admin/owner · `409` name already exists

---

### `PATCH /api/channels/:id`
Rename a channel or edit its description.

**Auth**: `requireRole(["admin", "owner"])`

**Params**: `id` — channel UUID

**Body** (validated via `updateChannelSchema`; both fields optional)
```json
{
  "name": "san-diego-flips",
  "description": "Updated topic"
}
```

**Response `200`** `{ "message": "Channel updated", "channel": { ...channel } }`

**Errors** `400` invalid id or input · `401` not authenticated · `403` not admin/owner · `404` not found · `409` name already exists

---

### `POST /api/channels/:id/archive`
Soft-archive a channel (`is_archived = true`). The first "delete" — reversible safety net.

**Auth**: `requireRole(["admin", "owner"])`

**Params**: `id` — channel UUID

**Response `200`** `{ "message": "Channel archived", "channel": { ...channel } }`

**Errors** `400` invalid id · `401` not authenticated · `403` not admin/owner · `404` not found

---

### `DELETE /api/channels/:id`
Hard-delete a channel (cascades to its messages, members, etc.). Permitted **only when the
channel is already archived** — the delete-twice safety net.

**Auth**: `requireRole(["admin", "owner"])`

**Params**: `id` — channel UUID

**Response `200`** `{ "message": "Channel deleted", "id": "uuid" }`

**Errors** `400` invalid id · `401` not authenticated · `403` not admin/owner · `404` not found · `409` channel is not archived yet

---

### Messages

All message routes are gated by `requireMastermind`. There is no `requireRole` on them — the
author-vs-admin rules live in the service: **edit is author-only** (admins may delete but never
edit another user's message); **delete is author OR admin/owner** and is a **soft delete**.
Soft-deleted messages are still returned, as blank tombstones (`isDeleted: true`, empty
`content`). The message object shape is:

```json
{
  "id": "uuid", "channelId": "uuid", "senderId": "uuid",
  "content": "<p>sanitized TipTap HTML</p>",
  "isEdited": false, "isDeleted": false,
  "createdAt": "…", "updatedAt": "…",
  "senderFirstName": "Jane", "senderLastName": "Doe", "senderProfileImageUrl": "url|null",
  "attachments": [
    { "id": "uuid", "fileUrl": "url", "fileName": "deck.pdf", "fileType": "application/pdf", "fileSizeBytes": 12345 }
  ],
  "reactions": [
    { "emoji": "👍", "count": 3, "reactedByMe": true }
  ],
  "linkPreviews": [
    { "url": "https://youtube.com/watch?v=…", "title": "…", "description": "…", "image": "url|null", "logo": "url|null", "publisher": "YouTube" }
  ]
}
```

`attachments`, `reactions`, and `linkPreviews` are hydrated on every read (history + backfill); a
tombstone carries empty arrays for all three. `reactedByMe` is per-viewer. Reaction emoji come from
the fixed set `👍 👎 😀 😢 😂 ✅`. `linkPreviews` holds up to 2 cards, one per unique `<a href>` in the
message HTML, sourced from the `link_previews` cache; it is empty until the background unfurl
populates the cache, after which a follow-up `message.updated` carries the filled-in previews.

---

### `GET /api/channels/:id/members`
List **mention candidates** for the channel's composer. Phase 1: returns **all
Mastermind-eligible users** (any tier or any team role) — public channels all share the same
pool. For an **admin-only** channel the pool narrows to **admins/owners** (so you can't
`@mention` a user who can't see the channel). Phase 2+ private/DM channels will narrow this to
actual members.

**Auth**: `requireMastermind`

**Params**: `id` — channel UUID

**Response `200`**
```json
{
  "users": [
    { "id": "uuid", "firstName": "Jane", "lastName": "Doe", "profileImageUrl": "https://..." }
  ]
}
```

`profileImageUrl` is `null` when the user has no avatar. It powers the avatar on the profile
card shown when a `@user` mention chip is clicked in a rendered message.

**Errors** `400` invalid channel id · `401` not authenticated · `403` no role and no subscription · `404` channel not found, or admin-only and caller is not admin/owner

---

### `GET /api/channels/:id/messages`
Channel message history, **or** reconnect backfill when `since` is supplied.

**Auth**: `requireMastermind`

**Params**: `id` — channel UUID

**Query params** (optional)
| Param | Type | Description |
|---|---|---|
| `cursor` | uuid | Keyset cursor — the `id` of the oldest message already loaded. Returns the next older page. |
| `limit` | number | Page size, default `30`, max `50`. |
| `since` | uuid | **Backfill mode.** The `id` of the newest message the client already has; returns everything newer, oldest-first. Takes precedence over `cursor`. |

**Response `200` (history mode)** `{ "messages": [ { ...message } ], "nextCursor": "uuid|null" }` — newest-first; `nextCursor` is `null` on the last page.

**Response `200` (backfill mode, `?since=`)** `{ "messages": [ { ...message } ], "hasMore": false }` — oldest-first; `hasMore` is `true` if more than 500 messages are pending (request again with the last `id`).

**Errors** `400` invalid channel id or cursor · `401` not authenticated · `403` no role and no subscription · `404` channel not found / archived, or admin-only and caller is not admin/owner

---

### `POST /api/channels/:id/messages`
Send a message. Content is **sanitized server-side** before persistence (stored-XSS protection).

**Auth**: `requireMastermind`

**Params**: `id` — channel UUID

**Body** (validated via `createMessageSchema`)
```json
{
  "content": "<p>Hello <strong>world</strong></p>",
  "attachments": [
    { "fileUrl": "url", "fileName": "deck.pdf", "fileType": "application/pdf", "fileSizeBytes": 12345 }
  ]
}
```

`content` is TipTap HTML, up to 10000 chars. `parentMessageId` is accepted by the schema but
**ignored in Phase 1** (threads are Phase 2). `attachments` (optional, max 5) is metadata from
`POST /api/mastermind/attachments`; each `fileUrl` is re-validated server-side to start with our
Supabase bucket's public-URL prefix. A message is valid with **text OR ≥1 attachment** — empty
content with no attachment is rejected.

**Response `201`** `{ "message": { ...message } }`

**Side effect**: After the message is persisted, the service parses `@user` mention marks from the sanitized HTML and inserts a row into `message_mentions` for each unique mentioned user (UNIQUE constraint deduplicates).

**Errors** `400` invalid id / invalid input / empty with no attachment / invalid attachment URL · `401` not authenticated · `403` no role and no subscription, or channel is archived · `404` channel not found, or admin-only and caller is not admin/owner

---

### `PATCH /api/messages/:id`
Edit your own message. **Author-only — even admins cannot edit another user's message.**

**Auth**: `requireMastermind`

**Params**: `id` — message UUID

**Body** (validated via `updateMessageSchema`)
```json
{
  "content": "<p>Edited text</p>",
  "attachments": [
    { "fileUrl": "https://…/mastermind/…", "fileName": "spec.pdf", "fileType": "application/pdf", "fileSizeBytes": 12345 }
  ]
}
```

Sets `isEdited = true`. Content is sanitized server-side. A message is valid with text **OR** at least one attachment.

**`attachments`** (optional) is the **full desired set** for the message: kept attachments (with their existing `fileUrl`) plus any newly uploaded ones (uploaded first via `POST /api/mastermind/attachments`). The server reconciles by `fileUrl` — attachments no longer present are deleted (rows **and** their Supabase Storage objects), and new ones are inserted (max `MAX_ATTACHMENTS_PER_MESSAGE`; each `fileUrl` must point at the Mastermind bucket). Omitting the key leaves existing attachments untouched.

**Side effect**: `message_mentions` rows for this message are rebuilt on every edit — previous mention rows are deleted and re-inserted from the updated content.

**Response `200`** `{ "message": { ...message } }`

**Errors** `400` invalid id / invalid input / empty after sanitize with no attachment / invalid attachment URL / too many attachments · `401` not authenticated · `403` not the author · `404` not found · `409` message is deleted

---

### `DELETE /api/messages/:id`
Soft-delete a message (`isDeleted = true`, content blanked). Never hard-deleted.

**Auth**: `requireMastermind`

**Params**: `id` — message UUID

Allowed for the **author OR an admin/owner**. Idempotent on an already-deleted message.

**Response `200`** `{ "message": { ...tombstone message } }`

**Side effect**: A soft-deleted message's attachment storage objects, attachment rows, reaction rows, and channel pin (if it was pinned) are all removed.

**Errors** `400` invalid id · `401` not authenticated · `403` not the author and not admin/owner · `404` not found

---

### `POST /api/messages/:id/reactions`
Add a reaction to a message.

**Auth**: `requireMastermind`

**Params**: `id` — message UUID

**Body** (validated via `reactionSchema`) `{ "emoji": "👍" }` — must be in the fixed set `👍 👎 😀 😢 😂 ✅`.

**Response `201`** `{ "success": true }`. Idempotent: re-reacting with the same emoji is a no-op (and skips the broadcast). On a real change, broadcasts `reaction.changed` (`action: "add"`) to the channel.

**Errors** `400` invalid id / unsupported emoji · `401` not authenticated · `403` no role and no subscription · `404` message not found / deleted / in an unreadable channel (includes an admin-only channel when the caller is not admin/owner)

---

### `DELETE /api/messages/:id/reactions`
Remove your reaction from a message.

**Auth**: `requireMastermind`

**Params**: `id` — message UUID

**Body** (validated via `reactionSchema`) `{ "emoji": "👍" }`

**Response `200`** `{ "success": true }`. Self-scoped (only the caller's own reaction). Idempotent; broadcasts `reaction.changed` (`action: "remove"`) only on a real change.

**Errors** `400` invalid id / unsupported emoji · `401` not authenticated · `403` no role and no subscription · `404` message not found / deleted / in an unreadable channel (includes an admin-only channel when the caller is not admin/owner)

---

### `GET /api/channels/:id/pin`
The channel's single pinned message (or `null`).

**Auth**: `requireMastermind`

**Params**: `id` — channel UUID

**Response `200`**
```json
{
  "pinned": {
    "message": { ...message },
    "pinnedByUserId": "uuid|null",
    "pinnedByFirstName": "Jane|null",
    "pinnedByLastName": "Doe|null",
    "pinnedAt": "…"
  }
}
```
`pinned` is `null` when there is no pin or the pinned message has since been deleted.

**Errors** `400` invalid channel id · `401` not authenticated · `403` no role and no subscription · `404` channel not found / archived, or admin-only and caller is not admin/owner

---

### `POST /api/channels/:id/pin`
Set or replace the channel's single pin. **Admin/owner only** (`requireRole(['admin','owner'])`).

**Auth**: `requireRole(['admin','owner'])`

**Params**: `id` — channel UUID

**Body** (validated via `pinMessageSchema`) `{ "messageId": "uuid" }` — must belong to the channel and not be deleted.

**Response `200`** `{ "pinned": { ...PinnedMessage } }`. One pin per channel (`pinned_messages` `UNIQUE(channel_id)`) — upserts/replaces. Broadcasts `message.pinned` to the channel.

**Errors** `400` invalid channel id / invalid messageId · `401` not authenticated · `403` not admin/owner · `404` channel or message not found

---

### `DELETE /api/channels/:id/pin`
Clear the channel pin. **Admin/owner only.**

**Auth**: `requireRole(['admin','owner'])`

**Params**: `id` — channel UUID

**Response `200`** `{ "pinned": null }`. Broadcasts `message.pinned` (`pinned: null`).

**Errors** `400` invalid channel id · `401` not authenticated · `403` not admin/owner · `404` channel not found

---

### `POST /api/mastermind/attachments`
Upload one file for a message. Multipart (`multipart/form-data`, field `file`). Returns metadata to send back in the `attachments[]` of `POST /api/channels/:id/messages`.

**Auth**: `requireMastermind`

**Constraints**: max **10 MB**; allowlisted MIME types — `image/jpeg`, `image/png` (rendered inline) and `application/pdf`, `text/csv`, `text/plain` (download link). Must match the Supabase bucket's allowed types.

**Response `201`**
```json
{ "attachment": { "fileUrl": "url", "fileName": "deck.pdf", "fileType": "application/pdf", "fileSizeBytes": 12345 } }
```

**Errors** `400` no file / unsupported type / empty / too large · `401` not authenticated · `403` no role and no subscription

---

### Notifications (`/api/notifications`)

The in-app bell feed. All routes use `requireMastermind` and are **self-scoped** — every query
filters on the caller's `user_id`. Rows are created server-side only. Two producers exist today:
the Mastermind mention fan-out on message create (`@user` → type `mention`; `@channel` → type
`channel_mention` for every eligible user; the admin/owner-only `@announcement` → type
`announcement` for every eligible user; the sender never notifies themself), and the deals app
(`deal_bid` → the deal's poster when an investor submits an offer). `@announcement` is gated in the
message service — a non-admin/owner author's chip is stripped before persistence. When a message
carries both broadcasts, type precedence is `mention` (direct) > `announcement` > `channel_mention`.
In an **admin-only** channel the mention fan-out is scoped to **admins/owners** only — broadcasts
reach admins/owners, and a direct `@user` of a non-admin is dropped (no bell/email deep-linking a
user into a channel they can't open). See `access-control.md` §5.14.

The notification object shape (REST and the `notification.created` socket event are identical).
`channelId`/`channelName`/`messageId` populate for mention types; `dealId`/`metadata` populate for
`deal_bid`. `actorId` is the message sender (mentions) or the bidder (`deal_bid`):

```json
{
  "id": "uuid",
  "type": "mention | channel_mention | announcement | deal_bid",
  "channelId": "uuid|null", "channelName": "san-diego-market|null",
  "messageId": "uuid|null", "messageExcerpt": "plain-text excerpt (≤120 chars)",
  "dealId": 5,
  "metadata": { "amount": "325000.00", "address": "123 Main St" },
  "actorId": "uuid|null", "actorFirstName": "Jane|null", "actorLastName": "Doe|null",
  "actorProfileImageUrl": "url|null",
  "isRead": false, "createdAt": "…"
}
```

`messageExcerpt` is the mention message's HTML stripped to plain text; it is empty when the
message has since been soft-deleted (clients show a generic label instead). `dealId` and `metadata`
are `null` for mention types.

---

#### `GET /api/notifications`
The caller's notification feed (newest-first, capped at 30) plus their total unread count.

**Auth**: `requireMastermind`

**Response `200`** `{ "notifications": [ { ...notification } ], "unreadCount": 3 }`

**Errors** `401` not authenticated · `403` no role and no subscription

---

#### `PATCH /api/notifications/:id/read`
Mark one of the caller's notifications read.

**Auth**: `requireMastermind`

**Params**: `id` — notification UUID

**Response `204`** (no body)

**Errors** `400` invalid id · `401` not authenticated · `403` no role and no subscription · `404` not found **or owned by another user** (no id-existence leak)

---

#### `PATCH /api/notifications/read-all`
Mark all of the caller's unread notifications read.

**Auth**: `requireMastermind`

**Response `200`** `{ "updated": 4 }` — the number of rows flipped.

**Errors** `401` not authenticated · `403` no role and no subscription

---

### Real-Time — WebSocket (`/ws`)

Mastermind's live layer. **REST is the source of truth; the WebSocket is only a notifier** —
every mutation persists over the REST routes above, then the server broadcasts the resulting
message over the socket. No new data lives only on the socket; a dropped connection is recovered
by the `?since=` backfill on `GET /api/channels/:id/messages`.

**Connection**: one socket per browser tab, opened app-wide for eligible users. Served at `/ws`
on the same HTTP server (`ws://` in dev, `wss://` in prod). Vite's HMR socket is left untouched
(upgrades are routed by path).

**Upgrade auth**: the upgrade request's `connect.sid` session cookie is parsed, unsigned with
`SESSION_SECRET`, and resolved through the session store; the user must pass
`isMastermindEligible` (the same rule as `requireMastermind`). A failed check rejects the upgrade
with `401` and no socket opens. See `access-control.md` §5.13.

**Subscription model**: the client subscribes to the one channel it is viewing (the "firehose").
The per-user 'doorbell' stream delivers `notification.created` to **every connected tab of the
recipient**, independent of channel subscriptions — mentions reach users browsing other pages.

**Client → server** (JSON):
```json
{ "type": "subscribe",   "channelId": "uuid" }
{ "type": "unsubscribe", "channelId": "uuid" }
```
`subscribe` is honored only for a public, non-archived channel — and for an **admin-only**
channel only when the client is `admin`/`owner` (otherwise the subscribe is silently ignored, so
no live events for that channel are delivered).

**Server → client** (JSON) — each carries the same enriched message object the REST routes
return (timestamps as ISO strings):
```json
{ "type": "message.created", "message": { ...message, "mentionedUserIds": ["uuid"], "mentionedEveryone": false } }
{ "type": "message.updated", "message": { ...message } }
{ "type": "message.deleted", "message": { ...tombstone } }
{ "type": "reaction.changed", "messageId": "uuid", "channelId": "uuid", "emoji": "👍", "userId": "uuid", "action": "add" }
{ "type": "message.pinned", "channelId": "uuid", "pinned": { ...PinnedMessage } | null }
{ "type": "notification.created", "notification": { ...notification } }
```
`message.created` additionally carries `mentionedUserIds` / `mentionedEveryone` so clients can
flag mention badges without re-parsing the HTML; the other message events omit them.
`reaction.changed` is a **per-user delta** (not an aggregate) — each client applies `action`
for `userId` and sets its own `reactedByMe` only when `userId` is the viewer, so a single
broadcast yields correct per-viewer counts. `message.updated` / `message.deleted` are
**field-merged** on the client (content/flags update; reactions & attachments are preserved),
since a channel-wide event can't carry per-viewer reaction state. `notification.created` carries
the same notification object as `GET /api/notifications` and is delivered to all of the
recipient's tabs (not channel-scoped).

**Heartbeat**: the server pings every ~30s and terminates sockets that miss a pong.

---

## Common Error Response Shape

All error responses follow:
```json
{ "message": "Human-readable description" }
```

Validation errors (400) also include:
```json
{ "message": "Invalid input", "errors": [ ...Zod error array ] }
```

## Image Upload Notes

All image endpoints share the same constraints:
- **Accepted types**: `image/jpeg`, `image/png`
- **Max file size**: 5 MB
- **Storage**: Supabase Storage (public buckets)
- **Old image cleanup**: Replacing an image automatically deletes the previous file from storage
- **Cache busting**: Uploaded URLs include a `?t=<timestamp>` query parameter
