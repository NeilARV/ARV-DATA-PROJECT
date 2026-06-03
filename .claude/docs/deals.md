# Deals App — Overview & Reference

## What It Is
The Deals page is a marketplace for real estate investment deals — wholesale properties, agent-listed properties, and completed sales. Users post deals they want to move, other investors browse and request contact info, and the system routes inquiries to the appropriate relationship manager. It functions like an internal deal board layered on top of the ARV Data app's existing property and company data.

The page is auth-aware but publicly viewable — anyone can browse deals, but creating deals requires a pro or premium subscription (with bypass for team roles).

---

## Page Entry Point
`client/src/pages/Deals.tsx` — wraps `DealsInner` in 5 context providers:
`MapProvider → FiltersProvider → CompaniesProvider → PropertiesProvider → PropertyProvider`

`DealsInner` checks auth state and renders `Header` + `DealsPageContent`. If the user is unauthenticated, it prompts a login dialog (non-forced).

---

## Component Tree

```
DealsPageContent
├── DealsHeader
│   ├── Tabs: "All Deals" / "Your Deals"
│   ├── DealsLocationSearch (county / MSA / city / zip autocomplete)
│   └── Add Deal button (subscription-gated)
├── DealsGrid
│   ├── Mobile tab bar: "New Deals" / "Sold Deals"
│   ├── DealsColumn ("New Deals") — scrollable, auto-scrolls to expanded deal
│   │   └── DealCard2 (repeating)
│   └── DealsColumn ("Sold Deals")
│       └── DealCard2 (repeating)
├── AddDealDialog (modal)
│   └── DealFormFields (shared form component)
├── EditDealDialog (modal)
│   └── DealFormFields
├── DeleteDealDialog (confirmation modal)
├── RequestDealInfoDialog
│   └── RequestDealInfoForm
└── BestBuyersDialog (top 3 buyers for a given zip)
```

### DealCard2 (collapsed)
- Street view image (`/api/properties/streetview`)
- Address, city, state, zip
- Deal type badge: Wholesale (purple) / Agent (orange) / Sold (red)
- ARV Exclusive badge (white, star icon) — admin-set
- Posted date (relative)
- Specs: beds, baths, sqft
- Financial grid: Purchase Price, Potential ARV, Est. Budget, Close of Escrow
- Action buttons: "Request More Info" (hidden on mobile), 3-dot menu (Edit / Delete)

### DealCard2 (expanded)
- Notes
- Photo album link
- Comparable sale links (up to 3, domain-extracted labels)
- "Request More Info" button (mobile)
- "Top Potential Buyers" button (deal owner only)
- Admin footer (admin/owner/RM only): poster name, email, phone, On Behalf Of, Internal Note

---

## State Management

### `useDealsNav` (URL-driven navigation)
Manages filter and selection state via URL params.

```
State (from URL):
  tab: "all" | "mine"                   ← ?tab=mine
  locationFilter: LocationFilter | null  ← ?filterType + ?filterValue + ?filterState
  dealId: number | null                  ← ?dealId=123

Actions:
  setTab(tab)
  setLocationFilter(filter)
  setDealId(id)
```

On first load with no filter, defaults to the user's county (resolved from their MSA).

### `DealsPageContent` local state
- `showAddDeal` — controls AddDealDialog
- `deleteConfirm` — deal + address for delete confirmation
- `editDeal` — deal being edited (links normalized to string array)
- `confirmRequestDeal` — deal for info request flow
- `requestInfoSucceeded` — success state for request form
- `bestBuyersDeal` — which deal's top buyers to show

### Data fetching (React Query)
- Primary: `GET /api/deals?userId=X&county=X&state=X&city=X&zip=X` — filtered deal list
- Secondary: `GET /api/deals/:id` — fetches a pinned deal (from URL `?dealId`) that may not be in the filtered list; prepended to the list if absent

Deals are split client-side into `newDeals` (type !== "sold") and `soldDeals`.

---

## API Surface

### Deals routes (`server/routes/deals.routes.ts`)

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/deals` | Public | List deals; accepts `userId`, `county`, `city`, `state`, `zipCode`, `msaName` |
| GET | `/api/deals/:id` | Public | Single deal |
| POST | `/api/deals` | requireSub (pro/premium) | Create deal |
| PATCH | `/api/deals/:id` | requireSub (pro/premium) | Update deal (ownership enforced in service) |
| DELETE | `/api/deals/:id` | requireSub (pro/premium) | Delete deal |
| POST | `/api/deals/:id/request-info` | Auth required | Send deal inquiry |

**Subscription bypass:** `admin`, `owner`, `relationship-manager`, `member` roles skip the pro/premium requirement.

---

## Backend

### Controller (`server/controllers/deals/deals.controllers.ts`)
- Strips admin-only fields (`isArvExclusive`, `onBehalfOfEmail`, `adminNotes`) from request if caller is not admin/owner
- Detects sold transition or price change on PATCH → fires deal notification email
- Validates `userId` in POST matches authenticated session (prevents posting on behalf of others unless admin)

### Service (`server/services/deals/deals.services.ts`)

**`getDeals(filters)`**
- Builds dynamic WHERE clause from filters; joins with `msas` and `users`
- Post-processing per deal:
  - Batch-fetches top 3 buyers per zip code (arms-length sales, last 3 months)
  - Batch-fetches `dealLinks` records
  - Resolves street view URL via Google Street View API
- Returns enriched `Deal[]` with `topBuyers`, `links`, `streetViewUrl`

**`createDeal(input)`**
- Validates that city, state, zipCode, beds, baths, sqft, and propertyType are all provided (all required — see Validation section)
- Resolves MSA ID from city/state/zip via `resolveMsaId`
- Resolves county from zip/city/state via `resolveCountyFromZip`
- Inserts deal row + dealLinks rows
- `sfrPropertyId` is always `null` — property specs are entered manually, not fetched from any external API

**`updateDeal(id, callerId, input)`**
- Enforces ownership (caller must be deal owner, or admin/owner role)
- Re-runs MSA and county resolution if location fields changed
- Re-inserts all links (delete old, insert new)
- Returns `previousType` and `previousPrice` for notification detection in the controller

**`requestDealInfo(dealId, requesterId, overrides)`**
- On-behalf-of mode: email goes to client (onBehalfOfEmail), CC to poster's RM
- Normal mode: email goes to poster; CC to requester's RM or default contact
- Email includes deal details, requester contact info, message, deep link to deal

**`sendDealNotification(deal, msaId, posterUserId, sendNotifications)`**
- Fetches MSA subscribers with deal notifications enabled for the primary MSA
- Extends the subscriber list with any **companion MSA** subscribers (see Companion MSA Notifications below)
- Filters by deal type preference if subscriber has one set
- Excludes the deal poster (exception: neil@arvfinance.com always receives)
- Fetches whitelist recipients for the primary and all companion MSAs, deduplicates by email
- Sends Postmark template emails: `new-deal`, `deal-sold`, or `price-update`

---

## Deal Creation & Editing — Form Behavior

### Property Details (Always Required)
Beds, baths, sqft, and property type are **always required** when posting or editing a deal. There is no auto-fill from any external API — the poster enters these manually.

- Baths accepts decimals (e.g. `2.5` for a half-bath)
- Street address is **optional** — a deal can be posted with only city/state/zip (useful for undisclosed-address wholesale deals)
- When a street address is provided, it is used for street view image display only — no external lookup occurs

### Form Field Layout (`DealFormFields`)
Fields are ordered and grouped to surface required information first:

1. Street Address *(optional)*
2. City / State / Zip Code — single row, equal-width columns
3. Beds / Baths / Sq Ft — single row, equal-width columns *(required)*
4. Property Type *(required)*
5. Price / Potential ARV — side by side *(optional)*
6. Showing Date / Showing Time — side by side *(optional)*
7. Estimated Budget *(optional)*
8. Deal Type
9. Notes *(optional)*
10. Comparable Sale Links — up to 3 URLs *(optional)*
11. Photo Album URL *(optional)*

Admin-only fields (Internal Note, On Behalf Of, ARV Exclusive) appear below a divider in `AddDealDialog` and `EditDealDialog` and are only visible to admin/owner/RM roles.

### `AddDealDialog` vs `EditDealDialog`
- **Add** — default deal type is `agent`; `sold` is not available (deals cannot be posted directly as sold)
- **Edit** — `sold` type is available, enabling the sold transition that fires a deal-sold notification
- Both dialogs show a description below the title explaining the purpose and email notification behavior to the poster

---

## Companion MSA Notifications

Some cities sit near MSA boundaries and are of interest to investors in a neighboring market. The static map `COMPANION_NOTIFICATION_MSAS` in `deals.services.ts` defines these overrides:

```ts
const COMPANION_NOTIFICATION_MSAS: Record<string, string[]> = {
    'temecula|ca': ['San Diego-Chula Vista-Carlsbad, CA'],
    'murrieta|ca': ['San Diego-Chula Vista-Carlsbad, CA'],
};
```

**How it works:**
- The deal's `msaId` is **never changed** — Temecula is correctly assigned to the Riverside MSA for data integrity
- At notification time, `sendDealNotification` builds a key `city|state` from the deal's location and checks the map
- For each companion MSA name found, it queries the `msas` table for the ID, then runs the same subscriber query (same join: `userMsaSubscriptions` + `userNotificationPreferences`)
- All subscriber lists are merged before deduplication — the existing `seen` Set (by user ID) handles cross-MSA duplicates naturally
- Whitelist recipients are fetched for both the primary and all companion MSAs, then deduplicated by email
- The early-return "no subscribers" guard checks the **merged** list, so a primary MSA with zero subscribers does not prevent companion MSA subscribers from receiving the notification

**Adding a new companion city:**
Add one entry to `COMPANION_NOTIFICATION_MSAS` in `server/services/deals/deals.services.ts`. Key format is `"city|state"` (all lowercase). No DB migration or other code changes needed.

---

## Database Schema (`database/schemas/deals.schema.ts`)

### `deals` table
| Column | Type | Notes |
|---|---|---|
| id | bigserial PK | |
| userId | uuid FK→users | Deal poster |
| msaId | int FK→msas | Resolved on create/update from city/state/zip |
| sfrPropertyId | bigint nullable | Always null — retained for schema compatibility |
| type | enum | `wholesale`, `agent`, `sold` |
| address | text nullable | Full street address (optional) |
| city, state, zipCode, county | text/varchar | city/state/zipCode required; county resolved server-side |
| price, potentialARV | decimal(15,2) | Optional |
| beds, baths, sqft | int/decimal | Required — entered manually by poster |
| propertyType | varchar(100) | Required — Single Family, Townhouse, Condo, etc. |
| notes | text | Free-form |
| adminNotes | text | Internal only (admin/owner) |
| showingTime | timestamp | Optional; stored as ISO datetime string (no timezone) |
| estimatedBudget | int | |
| photosUrl | text | Link to external photo album |
| isArvExclusive | boolean | Default false; admin-set |
| onBehalfOfEmail | text | RM-posted deals; redirects contact requests |

### `dealLinks` table
| Column | Notes |
|---|---|
| dealId FK | Cascade delete with deal |
| sortOrder | 1–3 |
| url | Full URL |
| domain | Extracted domain label (e.g., "redfin") |

---

## Validation (`database/inserts/deals.insert.ts`)

`dealFormSchema` (Zod):
- city, state (2 chars), zipCode required
- beds, baths, sqft, propertyType **always required** — no conditional logic based on address presence
- baths accepts decimals (`z.coerce.number().positive()`)
- dealType: `"wholesale" | "agent" | "sold"` (default `"agent"`; `"sold"` only available on edit)
- showingDate: optional, regex `MM/DD/YYYY`; showingTimeStr: optional, regex `HH:MM`; showingAmPm: `"AM"|"PM"` (default `"AM"`) — three fields combined into ISO datetime string (`YYYY-MM-DDThh:mm:00`) before DB insert as `showingTime`
- links: URL-validated, max 3
- adminNotes, onBehalfOfEmail, isArvExclusive: schema fields, stripped server-side for non-privileged callers

---

## Access Control

| Action | Public | Auth | Member/RM | Admin/Owner |
|---|---|---|---|---|
| View deals | ✓ | ✓ | ✓ | ✓ |
| Request deal info | — | ✓ | ✓ | ✓ |
| Create deal | — | Pro/Premium | ✓ (bypass) | ✓ |
| Edit own deal | — | — | ✓ (own) | ✓ (any) |
| Delete own deal | — | — | ✓ (own) | ✓ (any) |
| Delete any deal | — | — | RM only | ✓ |
| Set ARV Exclusive | — | — | — | ✓ |
| Set On Behalf Of | — | — | RM only | ✓ |
| View poster contact info | — | — | ✓ | ✓ |

---

## Deal Lifecycle

```
User creates deal
  → Subscription check (pro/premium or bypass role)
  → MSA + county resolved from city/state/zip
  → Beds/baths/sqft/propertyType validated (always required, always manual)
  → Inserted to deals + dealLinks
  → Email notifications sent (fire-and-forget):
      Primary MSA subscribers notified
      Companion MSA subscribers notified (if city is in COMPANION_NOTIFICATION_MSAS)
      Whitelist recipients notified (primary + companion MSAs, deduplicated)

Another user requests info
  → RequestDealInfoForm (firstName, lastName, email required)
  → Email routed based on onBehalfOfEmail flag:
      With onBehalfOfEmail → email to client, CC poster's RM
      Without             → email to poster, CC requester's RM

Deal is edited → sold
  → Type changes from wholesale/agent → sold
  → Email notification sent ("deal-sold" template) to primary + companion MSA subscribers

Deal is price-updated
  → Price change detected by controller comparing old vs new
  → Email notification sent ("price-update" template) to primary + companion MSA subscribers
```

---

## Key Files

| Layer | Path |
|---|---|
| Page | `client/src/pages/Deals.tsx` |
| Main content | `client/src/components/deals/DealsPageContent.tsx` |
| Shared form fields | `client/src/components/deals/DealFormFields.tsx` |
| Add dialog | `client/src/components/deals/AddDealDialog.tsx` |
| Edit dialog | `client/src/components/deals/EditDealDialog.tsx` |
| Other components | `client/src/components/deals/` (15 files total) |
| Nav hook | `client/src/hooks/useDealsNav.ts` |
| Routes | `server/routes/deals.routes.ts` |
| Controller | `server/controllers/deals/deals.controllers.ts` |
| Service | `server/services/deals/deals.services.ts` |
| Schema | `database/schemas/deals.schema.ts` |
| Insert validation | `database/inserts/deals.insert.ts` |
| Request validation | `database/validation/deals.validation.ts` |
