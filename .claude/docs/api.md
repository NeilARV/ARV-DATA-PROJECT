# API Documentation — ARV Finance Data App

Complete reference for all HTTP API routes. Base path: `/api`.

Auth is cookie-based (express-session). All authenticated routes require an active session cookie.

For access control rules (which roles/tiers can call what), see [`access-control.md`](./access-control.md).

---

## Table of Contents

1. [Auth (`/api/auth`)](#1-auth-apiauth)
2. [Admin (`/api/admin`)](#2-admin-apiadmin)
3. [Users (`/api/users`)](#3-users-apiusers)
4. [Properties (`/api/properties`)](#4-properties-apiproperties)
5. [Companies (`/api/companies`)](#5-companies-apicompanies)
6. [Deals (`/api/deals`)](#6-deals-apideals)
7. [Vendors (`/api/vendors`)](#7-vendors-apivendors)
8. [Posts (`/api/posts`)](#8-posts-apiposts)
9. [Categories (`/api/categories`)](#9-categories-apicategories)
10. [Contact (`/api/contact`)](#10-contact-apicontact)
11. [Geocoding (`/api/geocoding`)](#11-geocoding-apigeooding)
12. [Mastermind — Channels (`/api/channels`)](#12-mastermind--channels-apichannels)

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
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z",
    "msaSubscriptions": ["San Diego"],
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
      "dealTypeFilter": ["wholesale", "agent", "sold"],
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

**Side effects**: If the email is on the subscription whitelist, the user is granted a `basic` subscription, linked to their RM, and the whitelist entry is removed. Default notification preferences are created. If a county is provided, the corresponding MSA subscription is auto-created.

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
  "state": "CO"
}
```

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
  "dealTypeFilter": ["wholesale", "agent", "sold"]
}
```

`dataAppStatusFilter` values: `"in-renovation" | "on-market" | "wholesale" | "sold"` — empty array means all statuses.
`dealTypeFilter` values: `"wholesale" | "agent" | "sold"` — empty array means all types.

**Response `200`** `{ "success": true, "preferences": { ...notificationPreferences } }`

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

**Response `200`** Array of whitelist entries:
```json
[
  {
    "id": 1,
    "email": "user@example.com",
    "msa": 3,
    "relationshipManagerId": "uuid-or-null",
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  }
]
```

---

### `POST /api/admin/whitelist`
Add an email to the subscription whitelist.

**Auth**: `requireRole(["admin", "owner", "relationship-manager"])`

**Body**
```json
{
  "email": "user@example.com",
  "msaName": "San Diego",
  "relationshipManagerId": "uuid-or-null"
}
```

`msaName` and `relationshipManagerId` are optional.

**Response `201`** `{ "message": "Email added to whitelist successfully" }`

**Errors** `400` invalid data or invalid MSA · `409` email already on whitelist

---

### `PATCH /api/admin/whitelist/:id`
Update an existing whitelist entry's MSA or relationship manager.

**Auth**: `requireRole(["admin", "owner", "relationship-manager"])`

**Params**: `id` — integer whitelist entry ID

**Body** (at least one required)
```json
{
  "msaName": "Denver",
  "relationshipManagerId": "uuid-or-null"
}
```

**Response `200`**
```json
{ "message": "Whitelist entry updated", "id": 1, "email": "user@example.com", "relationshipManagerId": "uuid-or-null" }
```

**Errors** `400` invalid id or invalid MSA · `404` entry not found

---

### `DELETE /api/admin/whitelist/:id`
Remove an entry from the subscription whitelist.

**Auth**: `requireRole(["admin", "owner", "relationship-manager"])`

**Params**: `id` — integer whitelist entry ID

**Response `200`** `{ "message": "Whitelist entry deleted", "id": 1 }`

**Errors** `400` invalid id · `404` entry not found

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
List properties with filtering, pagination, and sorting. Accepts many query params passed directly to the service layer.

**Auth**: Public

**Key query params**
| Param | Type | Description |
|---|---|---|
| `msaId` | number | Filter by MSA |
| `county` | string | Filter by county name |
| `status` | string | Filter by property status |
| `minPrice` / `maxPrice` | number | Price range |
| `company` | string | Filter by company name |
| `page` | number | Page number |
| `limit` | number | Results per page |

**Response `200`** `{ properties: [...], total: number, page: number }`

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
Lightweight list of all property coordinates and basic metadata for map rendering.

**Auth**: Public

**Response `200`** Array of `{ id, latitude, longitude, city, state, status, ... }`

---

### `GET /api/properties/zip-counts`
Property counts grouped by zip code. Used to populate filter dropdowns.

**Auth**: Public

**Response `200`** `[{ zipCode: "92101", count: 14 }]`

---

### `GET /api/properties/suggestions`
Autocomplete suggestions for property search.

**Auth**: Public

**Query params**: `search` (min 2 chars) · `county` (optional filter)

**Response `200`** Array of suggestion objects. Returns `[]` if `search` is shorter than 2 characters.

---

### `GET /api/properties/streetview`
Proxy for Google Street View static image.

**Auth**: Public

**Query params**: `address`, `city`, `state` (or similar — passed to Google Maps API)

**Response `200`** Image data or redirect URL.

---

### `GET /api/properties/:id`
Get a single property by its internal UUID.

**Auth**: Public

**Response `200`** Full property object · `404` not found

---

### `PATCH /api/properties/:id`
Update the `isArvFunded` flag and/or statuses on a property.

**Auth**: `requireRole(["admin", "owner", "relationship-manager"])`

**Body**
```json
{ "isArvFunded": true }
```

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

**Response `200`** Array of transaction objects.

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

### `POST /api/companies/:id/claim`
Submit a claim for a company. Creates a `pending` claim in the admin review queue.

**Auth**: `requireAuth`

**Body**: none

**Response `201`** `{ "message": "Claim submitted", "claimId": "uuid" }`

**Errors** `404` company not found · `409` user already has a pending or approved claim for this company

---

### `GET /api/companies/:id/members`
Get the approved members (claimed users) for a company.

**Auth**: `requireAuth`

**Response `200`**
```json
{
  "data": [
    {
      "userId": "uuid",
      "firstName": "Jane",
      "lastName": "Doe",
      "email": "jane@example.com",
      "role": "owner",
      "isPrimary": true,
      "joinedAt": "2026-06-03T00:00:00Z"
    }
  ],
  "count": 1
}
```

---

## 5a. Claims `/api/claims`

### `GET /api/claims`
List company claims for admin review.

**Auth**: `requireRole(["admin", "owner", "relationship-manager"])`

**Query params**: `status` — `pending` | `approved` | `rejected` (default: all)

**Response `200`**
```json
{
  "data": [
    {
      "id": "uuid",
      "status": "pending",
      "adminNotes": null,
      "reviewedAt": null,
      "createdAt": "2026-06-03T00:00:00Z",
      "userId": "uuid",
      "userFirstName": "Jane",
      "userLastName": "Doe",
      "userEmail": "jane@example.com",
      "companyId": "uuid",
      "companyName": "Acme Capital LLC",
      "reviewerFirstName": null,
      "reviewerLastName": null
    }
  ],
  "count": 1
}
```

---

### `PATCH /api/claims/:id`
Approve or reject a company claim.

**Auth**: `requireRole(["admin", "owner", "relationship-manager"])`

**Body**
```json
{ "action": "approve", "adminNotes": "Verified via LinkedIn" }
```

`action` is required: `"approve"` or `"reject"`. `adminNotes` is optional (max 1000 chars).

**Response `200`** `{ "message": "Claim approved", "claim": { ...claim } }`

**Errors** `400` invalid body · `404` claim not found · `409` claim already reviewed

On approve: inserts a row into `company_members` linking the user to the company.

---

### `GET /api/users/me/company-memberships`
Get all approved company memberships for the currently authenticated user.

**Auth**: `requireAuth`

**Response `200`**
```json
{
  "data": [
    {
      "companyId": "uuid",
      "companyName": "Acme Capital LLC",
      "role": "owner",
      "isPrimary": true,
      "joinedAt": "2026-06-03T00:00:00Z"
    }
  ],
  "count": 1
}
```

---

## 6. Deals `/api/deals`

### `GET /api/deals`
List all deals with optional filters.

**Auth**: Public

**Query params** (all optional)
| Param | Type | Description |
|---|---|---|
| `userId` | string | Filter by deal owner |
| `msaName` | string | Filter by MSA name |
| `county` | string | Filter by county |
| `city` | string | Filter by city |
| `state` | string | Filter by state |
| `zipCode` | string | Filter by zip code |

**Response `200`** Array of deal objects.

---

### `GET /api/deals/:id`
Get a single deal by integer ID.

**Auth**: Public

**Response `200`** Full deal object · `400` invalid id · `404` not found

---

### `POST /api/deals`
Create a new deal.

**Auth**: `requireSub(["pro", "premium"], { bypassRoles: ["admin", "owner", "relationship-manager", "member"] })`

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

`dealType` values: `"wholesale" | "agent" | "sold"`

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

**Auth**: `requireSub(["pro", "premium"], { bypassRoles: [...all roles] })`

**Response `200`** `{ "message": "Deal deleted successfully", "id": 1 }`

**Errors** `400` invalid id · `401` not authenticated · `403` ownership check failed · `404` not found

---

### `POST /api/deals/:id/request-info`
Request contact info for a deal — sends an email to the deal poster's RM (or default contact).

**Auth**: Public (but must be authenticated — handler checks session)

**Body** (validated via `requestDealInfoSchema`)
```json
{
  "message": "I'm interested in this property."
}
```

**Response `200`** `{ "message": "Request sent successfully" }`

**Errors** `400` invalid id or body · `401` not authenticated

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

**Response `200`** `{ "message": "Contact message sent" }`

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

## 12. Mastermind — Channels `/api/channels`

The first slice of the Mastermind app (4th app). Access = any subscription tier OR any team
role, via `requireMastermind` (a configured `requireSub(["basic","pro","premium"], { bypassRoles: ["admin","owner","relationship-manager","member"] })`). Channel management is admin/owner only.
Membership is implicit in Phase 1: every eligible user can read every public, non-archived
channel. See [`access-control.md` §5.12](./access-control.md).

### `GET /api/channels`
List public channels.

**Auth**: `requireMastermind`

**Query params** (optional)
| Param | Type | Description |
|---|---|---|
| `includeArchived` | boolean (`"true"`) | Include archived channels. **Honored only for admin/owner**; ignored for everyone else. |

**Response `200`** `{ "channels": [ { "id": "uuid", "name": "san-diego-market", "description": "…", "type": "public", "isArchived": false, "createdBy": "uuid|null", "createdAt": "…", "updatedAt": "…" } ] }`

**Errors** `401` not authenticated · `403` no role and no subscription

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
