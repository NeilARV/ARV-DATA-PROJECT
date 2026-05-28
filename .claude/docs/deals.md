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
- Validates that either a full street address or manual property details (beds/baths/sqft/type) are provided
- Resolves MSA ID and county from city/state/zip
- If full address: calls SFR API to auto-populate beds, baths, sqft, propertyType, sfrPropertyId
- Inserts deal row + dealLinks rows

**`updateDeal(id, callerId, input)`**
- Enforces ownership (caller must be deal owner, or admin/owner role)
- Re-runs SFR lookup if address changed
- Re-inserts all links (delete old, insert new)
- Returns `previousType` and `previousPrice` for notification detection

**`requestDealInfo(dealId, requesterId, overrides)`**
- On-behalf-of mode: email goes to client (onBehalfOfEmail), CC to poster's RM
- Normal mode: email goes to poster; CC to requester's RM or default contact
- Email includes deal details, requester contact info, message, deep link to deal

**`sendDealNotification(deal, msaId, posterUserId, sendNotifications)`**
- Fetches MSA subscribers with deal notifications enabled
- Filters by deal type preference if subscriber has one set
- Excludes the deal poster
- Sends Postmark template emails: `new-deal`, `deal-sold`, or `price-update`

---

## Database Schema (`database/schemas/deals.schema.ts`)

### `deals` table
| Column | Type | Notes |
|---|---|---|
| id | bigserial PK | |
| userId | uuid FK→users | Deal poster |
| msaId | int FK→msas | Resolved on create/update |
| sfrPropertyId | bigint nullable | From SFR API lookup |
| type | enum | `wholesale`, `agent`, `sold` |
| address | text nullable | Full street address (optional) |
| city, state, zipCode, county | text/varchar | Required |
| price, potentialARV | decimal(15,2) | Optional |
| beds, baths, sqft | int/decimal | Required if no full address |
| propertyType | varchar(100) | Single Family, Townhouse, Condo, etc. |
| notes | text | Free-form |
| adminNotes | text | Internal only (admin/owner) |
| closeOfEscrow | date | Stored YYYY-MM-DD |
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
- dealType: `"wholesale" | "agent" | "sold"` (default `"agent"`; `"sold"` only available on edit)
- closeOfEscrow: regex `MM/DD/YYYY` (converted to `YYYY-MM-DD` before DB insert)
- superRefine: if no full street address pattern, beds/baths/sqft/propertyType are required
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
  → SFR API lookup if full address provided (auto-fills specs)
  → MSA + county resolved from location
  → Inserted to deals + dealLinks
  → Email notifications sent to MSA subscribers (fire-and-forget)

Another user requests info
  → RequestDealInfoForm (firstName, lastName, email required)
  → Email routed based on onBehalfOfEmail flag:
      With onBehalfOfEmail → email to client, CC poster's RM
      Without             → email to poster, CC requester's RM

Deal is edited → sold
  → Type changes from wholesale/agent → sold
  → Email notification sent ("deal-sold" template)

Deal is price-updated
  → Price change detected by controller comparing old vs new
  → Email notification sent ("price-update" template)
```

---

## Key Files

| Layer | Path |
|---|---|
| Page | `client/src/pages/Deals.tsx` |
| Main content | `client/src/components/deals/DealsPageContent.tsx` |
| Components | `client/src/components/deals/` (15 files) |
| Nav hook | `client/src/hooks/useDealsNav.ts` |
| Routes | `server/routes/deals.routes.ts` |
| Controller | `server/controllers/deals/deals.controllers.ts` |
| Service | `server/services/deals/deals.services.ts` |
| Schema | `database/schemas/deals.schema.ts` |
| Insert validation | `database/inserts/deals.insert.ts` |
| Request validation | `database/validation/deals.validation.ts` |
