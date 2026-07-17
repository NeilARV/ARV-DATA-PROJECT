# Apps — Overview & Reference (Data · Deals · Vendors · Mastermind)

ARV is organized as four feature areas that function like separate apps on a shared
foundation (auth, providers, backend). Each has its own page entry point, nav hook, routes,
controllers, and services.

| App | Route | Purpose | Backend |
|---|---|---|---|
| **Data** | `/data` | Property intelligence — browse SFR transaction data by MSA | `properties.*`, `companies.*` |
| **Deals** | `/deals` | Deal marketplace — post/browse wholesale, agent, REO, sold deals | `deals.*` |
| **Vendors** | `/vendors` | Community hub — activity feed + vendor directory | `vendors.*`, `posts.*`, `categories.*` |
| **Mastermind** | `/mastermind` | Slack-style real-time community (channels, messages, reactions, pins, notifications) | `channels.*`, `messages.*`, `notifications.*`, `/ws` |

The public **marketing landing page** lives at `/` (`client/src/pages/Home.tsx`, composed from
`client/src/components/Home/*` under the shared `MarketingHeader`). The four apps sit **behind
login**: each route is wrapped in `AppAccessGate` with `redirectWhenUnauthenticated` (or, for
Mastermind, an equivalent redirect effect), so a logged-out visitor is sent to `/login?redirect=…`
and a logged-in user without a subscription/team role sees the "request access" panel. The
`/contact` page (`client/src/pages/Contact.tsx`) is the single contact entry point — links pass a
prefilled `?subject=`/`?message=` (see `client/src/lib/contactLink.ts`); there is no contact modal.

The **Data, Deals, and Vendors** pages wrap their content in the same 5 shared context providers:
`MapProvider → FiltersProvider → CompaniesProvider → PropertiesProvider → PropertyProvider`.
**Mastermind** is a separate page (`/mastermind`) with its own socket + query state and does not use that provider tree.
---

# 1. Data App

## What It Is
The Data app (`/data`) is the core of ARV — a property intelligence platform. It surfaces
transaction data from the SFR data pipeline organized by MSA (Metropolitan Statistical Area)
and lets users explore properties by status, location, price, company, and more. The primary
use case is researching which investors are buying/selling in a market, at what prices, and
who the active operators are. It is the most data-dense part of the app — everything is
filtered, paginated, and synchronized through URL state so deep links work.

## Page Entry Point
`client/src/pages/Data.tsx` wraps `DataContent` (behind `AppAccessGate`). Before rendering, it
waits for auth to resolve when the URL has no geo selection — preventing a double-fetch caused by
`useDataNav` pushing the user's default (home MSA + subscribed counties, falling back to the home
county alone) after the initial render.

## Layout
CSS Grid `grid-cols-[375px_1fr] grid-rows-[auto_1fr]`:
- Row 1: "Investor Profiles" sidebar header · FilterHeader
- Row 2: CompanyDirectory (scrollable, 375px) · Content Area (view-dependent)

Content Area renders by `view`:
- `"map"` → `PropertyDetailPanel` (sidebar) + `PropertyMap`
- `"table"` → `TableView`
- `"grid"` / `"buyers-feed"` / `"wholesale"` → `GridView`

## Component Tree (key elements)
- **FilterHeader** — status tag filters (In-Renovation, Wholesale, Sold), state selector,
  county combobox, zip/city autocomplete (with property counts), date range (60d/90d/6mo/1yr/
  all-time), price slider ($0–$10M, $50K steps), beds, baths, property type multi-select,
  clear filters.
- **CompanyDirectory** — debounced search (300ms), 7 sort options, infinite-scroll list
  (50/page). `CompanyCard` is expandable: rank badge (gold/silver/bronze top 3), name +
  contact, property count badges, and an expanded section with owned/sold/bought counts,
  market ranking, principal/contact details, the purchase-to-ARV ratio (avg of seller
  purchase ÷ sale price across the company's Arms Length sales; "Not Available" when none),
  a 90-day acquisition chart (recharts BarChart), and action buttons (View Properties,
  Enrich, Edit, Copy). An "ensured company" slot shows a selected company that isn't in the
  paginated list.
- **Views** — map (`PropertyDetailPanel` + Leaflet `PropertyMap`), table
  (`PropertyTable`, 20/page), grid (`PropertyCard` grid, 10/page).
- **Dialogs** — LeaderboardDialog, InfoDialog, PropertyModalContent (all via `AppDialog`).

## State Management

**`useFilters()`** — property filters:
```ts
filters: {
  minPrice, maxPrice: number
  bedrooms: "Any" | "1" | "2" | "3" | "4" | "5+"
  bathrooms: "Any" | "1" | "1.5" | "2" | "2.5" | "3" | "3.5" | "4"
  propertyTypes: string[]
  zipCode: string; city?: string
  county?: string      // Default: user.county ?? "San Diego"
  statusFilters: string[]; dateRange?: DateRange
}
sortBy: "recently-sold" | "days-held" | "price-high-low" | "price-low-high"
hasActiveFilters: boolean
clearFilters(overrides?)  // Preserves county by default
```

**`useView()`** — `view: "map" | "grid" | "table" | "buyers-feed" | "wholesale"`,
`sidebarView: "directory" | "filters" | "none"`. View persisted to `?view=`.

**`useDataNav()`** — URL params `county` (`?county=`), `propertyId` (`?property=`),
`companyId` (`?company=`). `Data.tsx` runs sync effects keeping URL params ↔ filter/selection
state in sync (URL county → filters.county; URL propertyId → `fetchProperty`; URL companyId →
`handleCompanyClick`; and reverse syncs from `property.id` / `company.id` back to the URL).

**`useGeoMap()` / `useMap()`** — `mapCenter`, `mapZoom`, `mapPins`, `filteredMapPins`. Map
pins fetched from `/api/properties/map` only when `view === "map"`. Filter changes geocode via
zippopotam.us to recenter (zip→16, city→15, county→12). Company selection fits a bounding box
of company pins (zoom 8–20).

**`useCompanies()`** — selected `company`, paginated `companies`, `total`, `hasMore`,
`directorySort`, `directorySearch`, `loadCompanies`, `loadMoreCompanies`,
`handleCompanyClick` (expands filters to ALL statuses + all-time range), `ensuredCompany`,
`companySelectionInProgressRef` (prevents loadCompanies during selection).

**`useProperties()`** — `properties`, `totalProperties`, `stablePropertyCount` (retained
during loading to prevent flicker), `isLoading/isFetching`, `propertiesHasMore`,
`loadMorePropertiesRef`. Not active in map view. Page resets to 1 on any filter/sort/company/
view change; page 1 replaces, page >1 appends with ID dedup. Page size 10 (grid) / 20 (table).

**`useProperty()`** — single selected `property`, `setProperty`, `fetchProperty(id)`.

## API Surface

### Properties (`/api/properties`)
| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/properties` | requireSub (basic/pro/premium) or team role | List with filters — powers the buyers/wholesale feeds + table; app-access gated |
| GET | `/api/properties/map` | Public | Map pins (id, lat, lng, address, status, companyId, etc.) |
| GET | `/api/properties/suggestions` | Public | Address autocomplete |
| GET | `/api/properties/streetview` | Public | Google Street View proxy |
| GET | `/api/properties/:id` | Public | Single property |
| GET | `/api/properties/:id/transactions` | Public | Full transaction history |
| PATCH | `/api/properties/:id` | relationship-manager+ | Update isArvFunded, status |
| POST | `/api/properties` | admin/owner | Add property |
| DELETE | `/api/properties/:id` | admin/owner | Delete property |

**App-access split (backend unchanged):** at the **API**, the map, detail, suggestions, street
view, zip-counts, and transactions stay public; only the property **list** (`GET /api/properties`,
powering the buyers/wholesale feeds + table) requires any subscription tier or team role. The
**client now gates the whole `/data` page** via `AppAccessGate` — logged-out visitors are redirected
to `/login?redirect=/data` and logged-in users without a subscription/team role get the locked
panel — so the previously-anonymous map teaser is no longer reachable through the UI.

### Companies (`/api/companies`)
| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/companies` | Public | Directory; accepts sort, search, county, page |
| GET | `/api/companies/contacts/suggestions` | Public | Company search autocomplete |
| GET | `/api/companies/wholesale-leaderboard` | Public | Top wholesalers by county |
| GET | `/api/companies/leaderboard` | Public | Top zipcodes and buyers in MSA |
| GET | `/api/companies/:id` | Public | Single company with counts |
| POST | `/api/companies/:id/contacts` | admin/owner | Add contact |
| PATCH | `/api/companies/:id` | admin/owner | Update company |
| PATCH | `/api/companies/:id/contacts/:contactId` | admin/owner | Update contact |
| DELETE | `/api/companies/:id/contacts/:contactId` | admin/owner | Delete contact |
| POST | `/api/companies/:id/enrich` | admin/owner | Enrich from OpenCorporates |

### Geocoding
`GET /api/geocoding/county` — reverse geocode lat/lng → county (US Census Bureau proxy).

## Backend
- **`getProperties(filters)`** (`properties.services.ts`) — core query. Builds SQL
  dynamically (full-text address search, EXISTS subqueries for company/status, date range,
  price/bed/bath comparisons). **Transaction display logic** decides which company shows on
  each card: company selected → most recent Arms Length tx where it's buyer/seller (falling back
  to the latest Arms Length when it's only the assignor); no company → most recent Arms Length tx.
  Reads the "assignor" off the flagged sale row (`is_assignment` + `assignor_*`) and surfaces it
  separately. Sorts: recently-sold, days-held, price-high-low, price-low-high.
- **`getMapProperties(...)`** — lightweight `MapPin[]`; pin color set on frontend by status +
  company role.
- **`getContacts(params)`** (`companies.services.ts`) — directory listing; 7 sort modes each
  use different count aggregates over `property_transactions`; county filter via EXISTS on
  `company_counties`.
- **`getCompanyById(id, county)`** — full detail: all property counts (owned, sold/bought
  YTD & all-time, wholesale, assigned), 90-day acquisition by month, contacts list with sort order.

## Database Schema (key tables)

**Properties:** `properties` (status, MSA, county, isArvFunded, sfrPropertyId), `addresses`
(1:1, lat/lng + address parts), `structures` (1:1, beds/baths/sqft/year/condition),
`assessments` (1:many, assessed/market value by year), `property_transactions` (the heart —
buyerId/sellerId FK→companies, price, dateSold, transactionType, sortOrder, and assignment
metadata `is_assignment`/`assignor_id`/`assignor_name` on the sale row), `property_statuses`
(M:M with `statuses`), `statuses` (lookup).

**Companies:** `companies` (companyName unique, isArvClient), `company_contacts` (name, email,
phone, title, sortOrder), `company_counties` (activity counties), `company_details`
(OpenCorporates enrichment, 20+ fields), `company_addresses` (registered/mailing/head office).

## Views & Display Logic
- **Map** — color-coded Leaflet pins: blue (in-renovation), green (on-market), red (sold),
  purple (wholesale), orange (selected). Pin click → `PropertyDetailPanel`. Company selection
  re-centers to its bounding box; filter changes recenter via zippopotam.us.
- **Grid** — `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`, 10/page infinite scroll, click →
  modal. Buyers-feed and wholesale are grid variants with different status presets.
- **Table** — full-width, 20/page infinite scroll, click row → modal.
- **Which transaction shows** — most recent relevant tx: no company → most recent Arms Length
  (buyer + seller names); company selected → most recent tx where it's buyer or seller;
  assignor pattern surfaced separately.
- **Spread (wholesale)** — Arms Length only: `buyer price − seller price`, green/red by sign.
- **Enrichment** — admin/owner triggers OpenCorporates enrichment from the company card; fills
  `company_details`; requires a valid 2-letter state code.

## Company Membership
Users can be **associated with companies** to see their company's transaction portfolio,
market ranking, and acquisition activity — kept deliberately separate from `company_contacts`
(the public display roster sourced from the pipeline). Being a member does **not** auto-make a
user a public contact.

Association is **admin/owner-driven**: an admin/owner adds a user from the Admin Panel — the
**Users** table or the **Groups** tab (adding a member to an ungrouped company auto-creates its
singleton group). Membership lives on the company's group (`group_members`, resolved through
`company_groups`) — the single source of truth for both code-violation notifications and a user's
"My Companies." A user's associated companies appear in their Profile under "My Companies,"
resolved through their group(s).

| Table | Purpose |
|---|---|
| `group_members` | Membership (user↔group; companies resolve via `company_groups`) |

## Access Control
| Action | Public | Relationship Manager | Admin/Owner |
|---|---|---|---|
| Browse properties and companies | ✓ | ✓ | ✓ |
| View property transactions | ✓ | ✓ | ✓ |
| Update property isArvFunded / status | — | ✓ | ✓ |
| Add / delete property | — | — | ✓ |
| Edit company / contacts | — | — | ✓ |
| Enrich company from OpenCorporates | — | — | ✓ |
| Assign user↔company (Users / Groups tab) | — | — | ✓ |

## Data Pipeline
The Data app displays what the pipeline ingests. A cron job syncs property transaction data
from the external SFR (Single Family Rental) API into the DB, organized by MSA.

**Entry point:** `runConsumer()` in `server/jobs/consumer.ts` — reads pending rows from
`market_scan_queue` in batches, runs the steps below, marks rows complete/failed.

**Steps per batch:** `fetchQueue` (pull pending rows for an MSA, capped at
`MAX_PROPERTIES_PER_MSA` unique properties) → `markProcessing` → `batchLookup`
(SFR `/properties/batch`) → `getTransactions` (SFR `/properties/transactions`) →
`cleanTransactions` (extract company names + counties) → `insertCompanies` (upsert
buyer/seller companies, associate with MSA) → `resolvePropertyIds` (resolve buyer/seller FKs)
→ `resolveStatuses` (on-market / in-renovation / sold / wholesale) → `cleanBeforeInsert`
(normalize) → `resolveArvFunded` (annotate by lender patterns) → `insertProperties` (upsert
properties + child records) → `updateArvClientCompanies` → `markComplete` / `markFailed`.

**Key behaviors:** New Construction excluded (`"Property is New Construction"`); unresolved
status excluded (`"Couldn't Resolve Status"`); a failed batch doesn't abort the MSA (errors
caught per-batch); `MAX_PROPERTIES_PER_MSA` controls throughput (currently 5; ~2 external API
calls per property); failed rows stay in the queue for manual review (no auto-retry).

**Files:** `server/jobs/consumer.ts`, `server/jobs/processes/`,
`database/schemas/msas.schema.ts`.

## Key Files
Page `client/src/pages/Data.tsx` · components `client/src/components/data/` · hooks
`useFilters.tsx`, `useView.ts`, `useDataNav.ts`, `useMap.tsx`, `useCompanies.tsx`,
`useProperties.tsx`, `useProperty.tsx` · routes `server/routes/properties.routes.ts`,
`companies.routes.ts` · services `server/services/properties/properties.services.ts`,
`maps.services.ts`, `server/services/companies/companies.services.ts` · schemas
`database/schemas/properties.schema.ts`, `companies.schema.ts`.

---
---

# 2. Deals App

## What It Is
A marketplace for real estate investment deals — wholesale, agent-listed, and completed sales.
Users post deals, others browse and request contact info, and the system routes inquiries to
the appropriate relationship manager. It's an internal deal board layered on the Data app's
property/company data. The whole experience (reads included) requires any active subscription
(basic/pro/premium, with bypass for team roles).

## Page Entry Point
`client/src/pages/Deals.tsx` wraps `DealsInner` in `DataProviders`; `DealsInner` renders
`MarketingHeader` + a whole-page `AppAccessGate` (redirects unauthenticated visitors to
`/login?redirect=/deals`) around `DealsPageContent`. All auth/subscription gating lives in the
gate — `DealsPageContent` has no in-page checks.

## Component Tree
- **DealsToolbar** — deal-type dropdown (All Types / Wholesale / REO / Agent / Sold),
  `MsaCountyPicker` (the same State → MSA → multi-select county hierarchy as the Data app;
  shared component at `client/src/components/`), Add Deal button.
- **DealsBrowser** — master–detail over the unified newest-first feed: a `DealListRow` list
  (infinite scroll via `useInfiniteScroll`, 12/page) beside a `DealDetail` pane at ≥1024px;
  below that a single pane swaps between list and detail. Scope tabs "All Deals" / "My Deals"
  sit on the list column. On desktop the first deal auto-selects locally when nothing is
  selected; per-deal actions are driven by `capabilitiesFor` (`dealCaps`).
- **Dialogs** — AddDealDialog, EditDealDialog (both use `DealFormFields`), DeleteDealDialog,
  RequestDealInfoDialog (`RequestDealInfoForm`), SendOfferDialog (`SendOfferForm`),
  DealOffersDialog, BestBuyersDialog (top 3 buyers for a zip, fetched on open).

**DealListRow:** street-view thumbnail, address (ARV Exclusive star when admin-set), deal-type
badge (Wholesale purple / Agent orange / Sold red / REO indigo — variants from `DEAL_TYPE_META`
in `client/src/utils/deals.ts`), compact price, city/state + relative posted date.
**DealDetail:** street-view image, address + deal-type badge, financial grid (Purchase Price,
Potential ARV, Est. Budget, Close of Escrow), beds/baths/sqft, notes, photo album link, up to 3
comparable sale links (domain-extracted labels), Request More Info + Send Offer, Offers (N) +
Top Potential Buyers (deal poster only), Edit/Delete per `dealCaps`, poster footer
(admin/owner/RM): poster name/email/phone, On Behalf Of, Internal Note.

**Offers (bids):** any subscriber (basic+) or team member can submit a non-binding offer on a
non-sold deal via the Send Offer dialog (`SendOfferDialog`/`SendOfferForm` — amount + auto-filled
name/email/phone). Offers are full-history (repeat offers allowed) and **poster-private**: only
the deal owner (or admin/owner/RM) reads them, via the owner-only "Offers (N)" card action
(`DealOffersDialog`), where each offer can also be deleted (trash icon → confirmation). Each
submission sends the poster a `deal_bid` bell notification (no email) — see the
Mastermind/notifications section.

## State Management
**`useDealsNav`** (URL-driven): `tab: "all" | "mine"` (`?tab=`), `typeFilter` (`?type=`,
invalid values fall back to `all`), `selection` (`?msa=` + `?counties=` — the same
`MsaCountySelection` contract as the Data nav, via `lib/msaCountySelection`; legacy
`?filterType=county|msa` deep links from old deal emails still resolve, city/zip ones fall
through to the default), `dealId` (`?dealId=`); actions `setTab`, `setTypeFilter`,
`setSelection`, `setDealId(id, { replace? })`. On first load with no geo params, defaults once
to the home county's MSA with the user's subscribed counties in it pre-selected (the home
county alone when none are subscribed there).

**`DealsPageContent` local state:** `showAddDeal`, `deleteConfirm`, `editDeal` (links
normalized to string array), `confirmRequestDeal`, `requestInfoSucceeded`, `offerDeal`,
`offerSucceeded`, `viewOffersDeal`, `bestBuyersDeal`.

**Data fetching (React Query):** one `useInfiniteQuery` (`useDealsFeed`) against
`GET /api/deals?type&page&limit` (12/page, infinite scroll via `useInfiniteScroll`), plus the
shared scope filters `userId&msa&county` (county repeated — the selection's county set, scoped
to one MSA; none selected returns no deals). A deep-linked `?dealId` outside the loaded pages
is fetched via `GET /api/deals/:id` (`usePinnedDeal`) and pinned to the top of the feed; a 404
marks it gone and the page strips the dead `dealId` with a replacing navigation. Top buyers
load on demand from `GET /api/deals/:id/top-buyers` when the poster opens the dialog.

## API Surface (`server/routes/deals.routes.ts`)
| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/deals` | requireSub (basic/pro/premium) | One page of the unified feed; `type` (wholesale/agent/reo/sold), `page`, `limit`, `userId`, `county` (repeatable), `msa` (scopes the county set to one MSA) → `{ deals, total, hasMore, page, limit }` |
| GET | `/api/deals/msas` | requireSub (basic/pro/premium) | MSA list for the deal form dropdown |
| GET | `/api/deals/locations` | requireSub (basic/pro/premium) | Distinct cities/zips for the location autocomplete (legacy — no live client consumer since the county picker replaced the location search) |
| GET | `/api/deals/:id` | requireSub (basic/pro/premium) | Single deal |
| GET | `/api/deals/:id/top-buyers` | requireSub + ownership in service | Top buyers for the deal's zip (owner/privileged) |
| POST | `/api/deals` | requireSub (basic/pro/premium) | Create deal |
| PATCH | `/api/deals/:id` | requireSub (basic/pro/premium) | Update deal (ownership enforced in service) |
| DELETE | `/api/deals/:id` | requireSub (basic/pro/premium) | Delete deal |
| POST | `/api/deals/:id/request-info` | requireSub (basic/pro/premium) | Send deal inquiry (no longer public) |
| POST | `/api/deals/:id/offers` | requireSub (basic/pro/premium) | Submit a non-binding offer; notifies poster |
| GET | `/api/deals/:id/offers` | Auth required | List offers (owner or admin/owner/RM only) |
| DELETE | `/api/deals/:id/offers/:offerId` | Auth required | Remove an offer (owner or admin/owner/RM only) |

**App-access gated:** the whole Deals experience (reads included) requires any subscription tier
**or** any team role. `admin`, `owner`, `relationship-manager`, `member` skip the subscription
requirement (the `bypassRoles`); `request-info` was previously public and now carries the same
gate. The Deals page mirrors this with a whole-page `AppAccessGate`. Email verification is **not**
part of any deal gate.

## Backend
**Controller** (`deals.controllers.ts`) — strips admin-only fields (`isArvExclusive`,
`onBehalfOfEmail`, `adminNotes`) when caller isn't admin/owner; detects sold transition or
price change on PATCH → fires notification email; validates POST `userId` matches the session
(no posting on behalf of others unless admin).

**Service** (`deals.services.ts`):
- **`getDeals(filters)`** — one page of the unified feed (`type`, `page`/`limit`), newest
  first; dynamic WHERE, joins `msas` + `users`, plus a COUNT for the total. Batch-fetches
  `dealLinks` and (for the caller's own deals) offer counts, and sets a relative `streetViewUrl`.
  Returns `{ deals, total, hasMore, page, limit }`. It no longer probes the street-view image or
  eager-loads top buyers — the card's `<img>` drives the image fetch/re-cache, and top buyers are lazy.
- **`getTopBuyersForDeal(dealId, callerId)`** — owner/privileged only; top 3 arms-length buyers for
  the deal's zip (last 3 months). Backs `GET /api/deals/:id/top-buyers`.
- **`getDealLocations()`** — distinct `{ city, state }` pairs and zips across all deals, for the
  location-search autocomplete.
- **`createDeal(input)`** — validates city/state/zip/beds/baths/sqft/propertyType all present;
  resolves MSA from city/state/zip (`resolveMsaId`) and county from zip (`resolveCountyFromZip`);
  inserts deal + dealLinks. `sfrPropertyId` is always `null` (specs entered manually).
- **`updateDeal(id, callerId, input)`** — enforces ownership (owner or admin/owner role);
  re-runs MSA/county resolution if location changed; re-inserts links; returns `previousType`
  and `previousPrice` for notification detection.
- **`requestDealInfo(...)`** — on-behalf-of mode → email to client (onBehalfOfEmail), CC
  poster's RM; normal mode → email to poster, CC requester's RM or default contact. Includes
  deal details, requester contact, message, deep link.
- **`sendDealNotification(...)`** — resolves its audience through `resolveDealRecipients`
  (`server/services/email/recipientResolver.ts`): county-subscription match on the deal's
  county, MSA-wide fallback when the county is null/untracked, companion-city fan-out, with
  the master/deal toggles, per-user deal-type filter, and poster exclusion (except
  neil@arvfinance.com) applied inside the resolver. Whitelist recipients get the same county
  scoping via `resolveWhitelistDealRecipients` (issue #133; unique by email, already-registered
  addresses excluded), sends Postmark templates `new-deal` / `deal-sold` / `price-update`.

## Deal Creation & Editing — Form Behavior
- **Property details always required:** beds, baths, sqft, property type — no external auto-fill.
  Baths accept decimals (`2.5`). Street address is **optional** (supports undisclosed-address
  wholesale); when present it's used only for the street view image (no external lookup).
- **`DealFormFields` order:** Street Address *(opt)* → City/State/Zip → Beds/Baths/SqFt
  *(req)* → Property Type *(req)* → Price/Potential ARV *(opt)* → Showing Date/Time *(opt)* →
  Estimated Budget *(opt)* → Deal Type → Notes *(opt)* → up to 3 Comparable Links *(opt)* →
  Photo Album URL *(opt)*. Admin-only fields (Internal Note, On Behalf Of, ARV Exclusive)
  appear below a divider, visible to admin/owner/RM only.
- **Add vs Edit:** Add defaults to `agent` (`agent`/`wholesale`/`reo`) and can't post `sold`;
  Edit exposes `sold`, enabling the sold transition that fires the deal-sold notification.

## Companion MSA Notifications
Some cities near MSA boundaries interest a neighboring market. The static map
`COMPANION_CITY_MSA` in `server/constants/companionCities.constants.ts` defines the pairs:
```ts
export const COMPANION_CITY_MSA: Record<string, string> = {
    'temecula|ca': 'San Diego-Chula Vista-Carlsbad, CA',
    'murrieta|ca': 'San Diego-Chula Vista-Carlsbad, CA',
};
```
- The same map drives **both** consumers: create-time MSA resolution (`resolveMsaId` tier 0 —
  a Temecula deal is posted under the San Diego MSA) and notification fan-out
  (`resolveDealRecipients` — a companion-city deal reaches every county subscriber across
  primary ∪ companion MSAs, bypassing the exact-county match).
- Whitelist recipients fan out the same way (`resolveWhitelistDealRecipients` scopes over every
  MSA in play, deduped by email) and receive the notification even when no county subscriber
  matches.
- **Adding a companion city:** add one `"city|state"` (lowercase) entry — no migration needed.

## Database Schema (`database/schemas/deals.schema.ts`)
**`deals`:** `id` (bigserial PK), `userId` (FK→users, poster), `msaId` (FK→msas, resolved on
create/update), `sfrPropertyId` (bigint nullable, always null), `type` (`wholesale`/`agent`/
`sold`/`reo`), `address` (nullable, optional), `city`/`state`/`zipCode`/`county` (city/state/zip
required, county resolved server-side), `price`/`potentialARV` (decimal, optional),
`beds`/`baths`/`sqft` (required, manual), `propertyType` (required), `notes`, `adminNotes`
(admin/owner only), `showingTime` (timestamp, ISO string no tz), `estimatedBudget`,
`photosUrl`, `isArvExclusive` (default false, admin-set), `onBehalfOfEmail` (RM-posted deals,
redirects contact requests).
**`dealLinks`:** `dealId` (cascade delete), `sortOrder` (1–3), `url`, `domain` (extracted label).
**`dealBids`:** `id`, `dealId` (cascade delete), `bidderUserId` (cascade), `amount` (decimal),
`firstName`/`lastName`/`email`/`phone` (contact snapshot), `createdAt`; index (dealId, createdAt
DESC). Full history — one row per submission.

## Validation (`database/inserts/deals.insert.ts`)
`dealFormSchema` (Zod): city/state(2)/zip required; beds/baths/sqft/propertyType always
required (no conditional logic on address); baths `z.coerce.number().positive()`; dealType
default `"agent"` (`agent`/`wholesale`/`reo` on add), `"sold"` only on edit; showingDate optional (`MM/DD/YYYY`) + showingTimeStr
(`HH:MM`) + showingAmPm (`AM`/`PM`) combine into ISO `YYYY-MM-DDThh:mm:00`; links URL-validated
max 3; adminNotes/onBehalfOfEmail/isArvExclusive stripped server-side for non-privileged callers.

## Access Control
| Action | Public | Auth | Member/RM | Admin/Owner |
|---|---|---|---|---|
| View deals | ✓ | ✓ | ✓ | ✓ |
| Request deal info | — | ✓ | ✓ | ✓ |
| Create deal | — | Basic/Pro/Premium | ✓ (bypass) | ✓ |
| Edit own deal | — | — | ✓ (own) | ✓ (any) |
| Delete own deal | — | — | ✓ (own) | ✓ (any) |
| Delete any deal | — | — | RM only | ✓ |
| Set ARV Exclusive | — | — | — | ✓ |
| Set On Behalf Of | — | — | RM only | ✓ |
| View poster contact info | — | — | ✓ | ✓ |

## Deal Lifecycle
- **Create** → subscription check → MSA + county resolved → beds/baths/sqft/propertyType
  validated → insert deals + dealLinks → fire-and-forget emails (county subscribers across
  primary + companion MSAs, county-scoped whitelist recipients deduped).
- **Request info** → `RequestDealInfoForm` (firstName/lastName/email) → with onBehalfOfEmail:
  email to client, CC poster's RM; without: email to poster, CC requester's RM.
- **Submit offer** → `SendOfferForm` (amount + name/email/phone) → insert `deal_bids` row (full
  history) → two fire-and-forget side-effects: a `deal_bid` bell notification to the poster, and an
  offer email (`sendDealOfferNotification`, `POSTMARK_TEMPLATES.DEAL_OFFER`). The email mirrors
  request-info routing — on-behalf-of deal: To = client, Cc = poster's RM/default + bidder; normal
  deal: To = poster, Cc = bidder's RM/default + bidder; From = bidder's RM (or default), Reply-To =
  bidder. Always sent on submit (not gated by the subscriber-notification system). Poster reads
  offers via the owner-only "Offers (N)" action (`GET /api/deals/:id/offers`).
- **Edit → sold** → type wholesale/agent → sold → `deal-sold` email to primary + companion subs.
- **Price update** → controller detects old vs new → `price-update` email to primary + companion subs.

## Key Files
Page `client/src/pages/Deals.tsx` · `client/src/components/deals/` (DealsPageContent,
DealsToolbar, DealsBrowser, DealListRow, DealDetail, DealFormFields, AddDealDialog,
EditDealDialog, +others) · hooks `useNav.ts` (`useDealsNav`), `useDealsFeed.ts`,
`usePinnedDeal.ts` · capabilities `client/src/utils/deals.ts` (`dealCaps`) · routes
`server/routes/deals.routes.ts` · controller `deals.controllers.ts` · service
`deals.services.ts` · schema `database/schemas/deals.schema.ts` · validation
`database/inserts/deals.insert.ts`, `database/validation/deals.validation.ts`.

---
---

# 3. Vendors App

## What It Is
A two-panel community hub for renovation/real estate professionals. Left panel (480px) is an
**Activity Feed** of community posts about renovation projects, flips, and property work. Right
panel is a **Browse by Category** vendor directory. On mobile the two are tab-switched
("Browse" / "Activity Feed"). It lets users discover vendors (contractors, plumbers, HVAC, …)
by trade category, and lets the community share project work, tag vendors/categories, and
surface vendors through real activity.

## Page Entry Point
`client/src/pages/Vendors.tsx` wraps `VendorsContent` in the shared provider tree (inherited
from the rest of the app, not Vendors-specific).

## Component Tree
- **ActivityFeed** (left, 480px) — `PostCard` (author + avatar + timestamp, formatted HTML
  with clickable vendor/category mentions, image carousel up to 5, Edit/Delete menu for
  author/admin/owner, ImageLightbox) and `PostComposer` (auth required: TipTap rich text editor
  with Bold/Italic/Underline/Link/Font Size and mentions `@vendor` → vendorMention / `#category`
  → categoryMention, image upload max 5 JPEG/PNG, Post button).
- **BrowseByCategory** (right, flex-1) — header with search, breadcrumbs, Add Vendor button
  (admin/owner); RecommendedVendors section (`isRecommended`); view states from `useVendorNav`:
  `categories` (CategoryCard grid), `vendor-list` (VendorCard grid), `vendor-detail`
  (VendorDetail), `search` (mixed results). **VendorDetail**: header image + logo, name,
  description, contact (address/phone/website), category badges, VendorPhotoGallery (post images
  featuring the vendor), EditVendorDialog + DeleteConfirmation (admin/owner).

## State Management
**`useVendorNav`** (URL-driven): `view: "categories" | "vendor-list" | "vendor-detail"`,
`categoryId` (`?category=`), `vendorId` (`?vendor=`), `postFilters: { categoryId?, vendorId? }`
(passed to ActivityFeed). Actions: `selectCategory(id)` (→ vendor-list, clears vendor),
`selectVendor(id)` (→ vendor-detail), `goBack()`, `reset()`. URL pattern
`/vendors?category=5&vendor=abc-123`.

**Post editor:** `usePostEditor` inside `PostComposer` — TipTap instance, mention extraction,
image files, submit state.

## API Surface
### Categories
| Method | Route | Description |
|---|---|---|
| GET | `/api/categories` | All categories with vendor counts |
| GET | `/api/categories/:id/vendors` | Vendors in a category |

### Vendors
| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/vendors` | Public | All vendors; `?categoryIds=` |
| GET | `/api/vendors/recommended` | Public | `isRecommended=true` |
| GET | `/api/vendors/:id` | Public | Single vendor with categories |
| POST | `/api/vendors` | Admin/Owner | Create vendor |
| PUT | `/api/vendors/:id` | Admin/Owner | Update vendor |
| DELETE | `/api/vendors/:id` | Admin/Owner | Delete vendor |
| PUT | `/api/vendors/:id/recommend` | Admin/Owner | Toggle `isRecommended` |
| POST/DELETE | `/api/vendors/:id/logo` | Admin/Owner | Upload / remove logo (FormData) |
| POST/DELETE | `/api/vendors/:id/header` | Admin/Owner | Upload / remove header image (FormData) |

### Posts
| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/posts` | Public | Feed; `?categoryId=`, `?vendorId=`, `?page=`, `?limit=` |
| POST | `/api/posts` | Auth required | Create post |
| PUT | `/api/posts/:id` | Author/Admin/Owner | Update post |
| DELETE | `/api/posts/:id` | Author/Admin/Owner | Delete post |
| POST | `/api/posts/:id/images` | Author | Upload image (FormData, max 5) |
| DELETE | `/api/posts/:id/images/:imageId` | Author/Admin/Owner | Delete image |

## Backend
**Services:** `vendors.services.ts` (CRUD, category mapping, Supabase image upload/delete),
`posts.services.ts` (post CRUD, mention parsing, batch enrichment of likes/comments/images/
tags, ownership checks), `categories.services.ts` (category list with vendor-count aggregates).

**Key behavior:** `createPost`/`updatePost` parse vendor + category mentions out of TipTap
HTML and rebuild junction records on every save. `getPosts` enrichment fetches likes, comment
counts, images, vendor tags, and user tags in parallel batch queries (never N+1). Vendor
`getAll` dedupes when filtering by multiple categories. Vendor/post images go to Supabase
Storage (URL stored in DB); deleting a vendor cleans up its Supabase images.

## Database Schema (`database/schemas/vendors.schema.ts`)
| Table | Key Columns | Notes |
|---|---|---|
| `categories` | id, name, slug, iconName, description | Shared by vendors and posts |
| `vendors` | id (uuid), name, logoUrl, headerUrl, isRecommended, userId (nullable FK) | No registered account required |
| `vendor_categories` | (vendorId, categoryId) | M:M junction |
| `posts` | id (uuid), userId, title, content (HTML), address, city, state | Content stores TipTap HTML incl. mention marks |
| `post_categories` | (postId, categoryId) | Rebuilt on every save |
| `post_images` | id, postId, imageUrl, displayOrder | Max 5 per post |
| `post_likes` | (userId, postId) | One like per user per post |
| `post_comments` | id, postId, userId, parentCommentId (nullable) | One level of threading |
| `post_vendor_tags` | (postId, vendorId) | Rebuilt from @mentions on save |
| `post_user_tags` | (postId, taggedUserId) | Rebuilt from @user mentions on save |

Deleting a vendor or post cascades to all related junction and child records.

## Access Control
| Action | Anyone | Authenticated | Admin / Owner |
|---|---|---|---|
| Browse vendors and categories | ✓ | ✓ | ✓ |
| Read posts / activity feed | ✓ | ✓ | ✓ |
| Create post | — | ✓ | ✓ |
| Edit / delete own post | — | ✓ (own) | ✓ (any) |
| Create / edit / delete vendor | — | — | ✓ |
| Upload vendor logo / header | — | — | ✓ |
| Toggle vendor recommended | — | — | ✓ |

## Current State
**Fully implemented:** vendor CRUD with logo/header upload (Supabase), category tagging (M:M),
recommended vendors, post creation with TipTap, `@vendor`/`#category` mention autocomplete,
post images (≤5, Supabase), post edit/delete with ownership enforcement, feed filtering by
category/vendor, vendor photo gallery (images from tagged posts), mobile two-panel tab layout,
search across categories + vendors, breadcrumb nav with URL-driven state.

**In schema/backend, not yet in UI:** post likes (count fetched, no like button), post comments
(schema + count, no thread UI), user tagging (`@user`, `post_user_tags` exists, autocomplete
not wired), infinite scroll (pagination API ready; UI uses query invalidation on new posts).

## Key Files
Page `client/src/pages/Vendors.tsx` · API client `client/src/api/vendors.api.ts` · components
`client/src/components/vendors/` · hooks `useVendorNav.ts`, `usePostEditor.ts` · types
`client/src/types/vendors.d.ts` · routes `server/routes/vendors.routes.ts`, `posts.routes.ts`,
`categories.routes.ts` · controllers/services under `server/controllers/` and
`server/services/` (`vendors/`, `posts/`, `categories/`) · schema
`database/schemas/vendors.schema.ts` · validation `database/validation/vendors.validation.ts`.

---

# 4. Mastermind App

## What It Is
A Slack-style real-time community — the live layer of the mastermind subscription. Topic
channels (`#general`, `#first-time-flippers`, `#san-diego-market`, …), real-time messages,
@mentions, reactions, pins, and notifications, scoped to paying members and the ARV team. Full
design and phased build plan: `.claude/docs/mastermind.md`.

> **Status:** under construction. **Phase 1 Parts 1–9** are built (schema, access gate +
> channel routes, message REST lifecycle, WebSocket layer, frontend shell, mentions + user
> tagging, unread indicators, in-app notifications/bell, and reactions/pins/attachments). Part 9
> added emoji reactions (fixed set, `reaction.changed` delta broadcast), admin/owner-only pins
> (one per channel, `message.pinned` broadcast, pin bar showing who pinned), and message
> attachments (upload-first to Supabase; images inline + lightbox, docs as download links), plus
> the per-message hover toolbar (react · pin · edit · delete). Email notifications (Part 10) are
> the remaining Phase 1 part.

## Page Entry Point
`/mastermind` (`client/src/pages/Mastermind.tsx`). Nav entry is gated on `canAccessApp`.

## Access Model
Access = **any subscription tier OR any team role** (mirrors the frontend `canAccessApp` flag).
Server gate is `requireMastermind` — a configured instance of
`requireSub(["basic","pro","premium"], { bypassRoles: ["admin","owner","relationship-manager","member"] })`
exported from `server/middleware/requireMastermind.ts`, alongside `isMastermindEligible(userId)`
(the boolean form, used for the WebSocket upgrade handshake). Channel management
(create/rename/archive/delete) is admin/owner only via `requireRole(["admin","owner"])`.

| Action | Subscriber (basic/pro/premium) | Member / RM | Admin / Owner |
|---|---|---|---|
| List & read channels | ✓ | ✓ | ✓ |
| Read & send messages | ✓ | ✓ | ✓ |
| Edit **own** message | ✓ | ✓ | ✓ |
| Delete **own** message | ✓ | ✓ | ✓ |
| Edit **another user's** message | — | — | — (never, by design) |
| Delete **another user's** message | — | — | ✓ |
| Create / rename / archive / delete channel | — | — | ✓ |

## API Surface (`server/routes/channels.routes.ts`, `server/routes/messages.routes.ts`, `server/routes/notifications.routes.ts`)
| Method | Route | Auth | Notes |
|---|---|---|---|
| GET | `/api/channels` | `requireMastermind` | Lists public, non-archived channels (ordered general → markets → others → admin-only last); admin/owner may pass `?includeArchived=true`. Admin-only channels are excluded for non-admins; every per-channel route 404s a non-admin on an admin-only channel (service-enforced) |
| POST | `/api/channels` | `requireRole(["admin","owner"])` | Create; `name` is a unique lowercase slug |
| PATCH | `/api/channels/:id` | `requireRole(["admin","owner"])` | Rename / edit description |
| POST | `/api/channels/:id/archive` | `requireRole(["admin","owner"])` | Soft archive (`is_archived = true`) |
| DELETE | `/api/channels/:id` | `requireRole(["admin","owner"])` | Hard delete (cascade); `409` unless already archived |
| GET | `/api/channels/:id/members` | `requireMastermind` | Mention candidates — all Mastermind-eligible users (Phase 1); returns `{ users }` |
| GET | `/api/channels/:id/messages` | `requireMastermind` | History (`?cursor=&limit=`) → `{ messages, nextCursor }`; backfill (`?since=`) → `{ messages, hasMore }`. Soft-deleted = blank tombstones |
| POST | `/api/channels/:id/messages` | `requireMastermind` | Send; content sanitized server-side; `parentMessageId` ignored (Phase 1); `403` if channel archived |
| PATCH | `/api/channels/:id/read` | `requireMastermind` | Advance caller's read-state (lazy `channel_members` upsert) → `204` |
| PATCH | `/api/messages/:id` | `requireMastermind` (+ author-only) | Edit own message (text **and** attachments — `attachments[]` is the full desired set, reconciled by `fileUrl`); admins **cannot** edit others'; sets `isEdited` |
| DELETE | `/api/messages/:id` | `requireMastermind` (+ author-or-admin) | Soft delete (author or admin/owner); also clears its attachments/reactions/pin |
| POST | `/api/messages/:id/reactions` | `requireMastermind` | Add a fixed-set reaction (idempotent); broadcasts `reaction.changed` |
| DELETE | `/api/messages/:id/reactions` | `requireMastermind` | Remove own reaction; broadcasts `reaction.changed` |
| GET | `/api/channels/:id/pin` | `requireMastermind` | The channel's single pinned message (or `null`), with who pinned it |
| POST | `/api/channels/:id/pin` | `requireRole(["admin","owner"])` | Set/replace the one pin; broadcasts `message.pinned` |
| DELETE | `/api/channels/:id/pin` | `requireRole(["admin","owner"])` | Clear the pin; broadcasts `message.pinned` (null) |
| POST | `/api/mastermind/attachments` | `requireMastermind` | Multipart upload (10MB; JPEG/PNG/PDF/CSV/TXT) → metadata for the message `attachments[]` |
| GET | `/api/notifications` | `requireMastermind` | Bell feed (newest-first, capped at 30) + `unreadCount`; self-scoped to the caller |
| PATCH | `/api/notifications/read-all` | `requireMastermind` | Marks all of the caller's unread read → `{ updated }` |
| PATCH | `/api/notifications/:id/read` | `requireMastermind` | Marks one read → `204`; `404` if not found **or owned by another user** |

Full request/response detail: `.claude/docs/api.md` §12. Permission tables:
`.claude/docs/access-control.md` §5.12–§5.14.

## Backend
Routes `server/routes/channels.routes.ts` · controller `server/controllers/channels/` ·
service `server/services/channels/` (`ChannelServiceError` carries `statusCode`, mirroring
`DealServiceError`; duplicate-name writes are mapped to `409`) · gate
`server/middleware/requireMastermind.ts`.

Membership is **implicit** in Phase 1: every eligible user can read every public channel — no
`channel_members` row is required, and that table is not consulted for authorization. It exists
to carry per-user read-state (`last_read_at`) later (unread badges, Part 7).

**Mention persistence:** `POST /api/channels/:id/messages` and `PATCH /api/messages/:id` both
parse `@user` mention marks from the sanitized TipTap HTML after the message is saved. On
create, a `message_mentions` row is inserted for each unique mentioned user. On edit, the
existing mention rows for the message are deleted and re-inserted from the updated content
(full rebuild). The UNIQUE constraint on `(messageId, mentionedUserId)` prevents duplicates.

**Broadcast mentions (`@channel` / `@announcement`):** both are non-UUID sentinel chips that fan
out to everyone (admins/owners only in an admin-only channel) and are skipped by user-mention
parsing. `@channel` is open to every sender and notifies as `channel_mention`. `@announcement` is
**admin/owner-only** — the chip is only offered to admins/owners in the composer, and the server
**strips it from a non-privileged author's content** (create and edit) so it can't be spoofed or
trigger a fan-out; it notifies as the distinct `announcement` type. Both behave identically today
(everyone fan-out); `announcement` is kept separate because its behavior diverges with email
(Part 10). When a message carries both, the notification type precedence is
`mention` (direct) > `announcement` > `channel_mention`.

## Real-Time (`server/websocket/`, `/ws`)
A WebSocket layer attached to the same HTTP server delivers live messages. **REST is the source
of truth; the socket is only a notifier** — the message controllers broadcast
`message.created/updated/deleted` after each REST write, and a dropped socket is reconciled by the
`?since=` backfill. One socket per tab, opened **app-wide** for eligible users; the upgrade is
authenticated by the session cookie + `isMastermindEligible` (no Express middleware runs on a raw
upgrade). The client subscribes to the one channel it is viewing (the "firehose"); a per-user
'doorbell' stream delivers `notification.created` (same object as `GET /api/notifications`) to
**every connected tab of the recipient**, independent of channel subscription, so mentions surface
on any page (cross-channel unread delivery remains a Phase 2 TODO). The in-memory connection registry is single-instance — horizontal scaling later needs
Redis pub/sub (see `.claude/docs/mastermind.md` Known Limitation). Vite's HMR socket is unaffected
(upgrades routed by path). Client cache: live events and history both write a flat ascending
`MastermindMessageWire[]` under `messagesQueryKey(channelId)`, de-duplicated by id.

## Database Schema (`database/schemas/mastermind.schema.ts`)
Enums: `channel_type` (`public`/`private`/`dm`/`group_dm` — Phase 1 uses only `public`),
`channel_member_role` (`owner`/`admin`/`member`), `notification_type`
(`mention`/`channel_mention`/`announcement`/`deal_bid`).

| Table | Key Columns | Notes |
|---|---|---|
| `channels` | id (uuid), name (unique), description, type, createdBy (FK users, set null), isArchived | Seeded with starter channels |
| `channel_members` | id, channelId, userId, role, lastReadAt, lastReadMessageId, isMuted | UNIQUE(channelId, userId); written lazily for read-state |
| `messages` | id, channelId, senderId, parentMessageId (self-FK, threads/Phase 2), content (HTML), isEdited, isDeleted | Soft-delete only; index (channelId, createdAt DESC) |
| `message_attachments` | id, messageId, fileUrl, fileName, fileType, fileSizeBytes | Supabase Storage URLs |
| `message_reactions` | id, messageId, userId, emoji | UNIQUE(messageId, userId, emoji); fixed emoji set |
| `message_mentions` | id, messageId, mentionedUserId | UNIQUE(messageId, mentionedUserId); index (mentionedUserId, createdAt DESC) |
| `pinned_messages` | id, messageId, channelId, pinnedBy | UNIQUE(channelId) — one pin per channel |
| `notifications` | id, userId (recipient), type, channelId, messageId, dealId (FK deals, cascade), metadata (jsonb), actorId, isRead, emailedAt | Bell feed; mention rows use channel/message, `deal_bid` rows use dealId + metadata `{ amount, address }`; index (userId, isRead, createdAt DESC) |

Deleting a channel cascades to its messages, members, reactions, mentions, pins, and
notifications. See `.claude/docs/database.md` (Mastermind section) for full column detail.

## Validation (`database/validation/mastermind.validation.ts`, `database/inserts/mastermind.insert.ts`)
Request schemas: `createChannelSchema`, `updateChannelSchema`, `createMessageSchema` (accepts
optional `attachments[]`), `updateMessageSchema` (also accepts optional `attachments[]` — the full desired set), `reactionSchema`, `messageAttachmentSchema`,
`pinMessageSchema`. `MASTERMIND_REACTION_EMOJIS` is the fixed reaction set (👍 👎 😀 😢 😂 ✅) and
`MAX_ATTACHMENTS_PER_MESSAGE` (5) the per-message cap. drizzle-zod insert schemas live in
`database/inserts/mastermind.insert.ts`; types in `database/types/mastermind.d.ts`.

## Key Files
Gate `server/middleware/requireMastermind.ts` · routes `server/routes/channels.routes.ts`,
`server/routes/messages.routes.ts`, `server/routes/notifications.routes.ts` · controllers
`server/controllers/channels/channels.controllers.ts`,
`server/controllers/messages/messages.controllers.ts`,
`server/controllers/notifications/notifications.controllers.ts` · services
`server/services/channels/channels.services.ts`, `server/services/messages/messages.services.ts`,
`server/services/notifications/notifications.services.ts` ·
HTML sanitizer `server/utils/sanitizeHtml.ts` · real-time `server/websocket/` (`index.ts` bootstrap,
`auth.ts` upgrade auth, `registry.ts` connections+broadcast, `connection.ts` per-socket handler),
protocol `shared/mastermind/events.ts`, client socket `client/src/hooks/use-mastermind-socket.tsx`
+ `client/src/lib/mastermind-messages.ts`, `client/src/lib/mastermind-notifications.ts` · page
`client/src/pages/Mastermind.tsx`, bell `client/src/components/mastermind/NotificationBell.tsx`
(rendered in the global `client/src/components/Header.tsx`), feed hook
`client/src/hooks/use-notifications.ts` · schema `database/schemas/mastermind.schema.ts` ·
validation `database/validation/mastermind.validation.ts` · tests
`tests/server/api/channels/`, `tests/server/api/messages/`, `tests/server/api/notifications/`,
`tests/server/websocket/` · design doc `.claude/docs/mastermind.md`.
