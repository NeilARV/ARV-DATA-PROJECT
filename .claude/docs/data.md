# Data App — Overview & Reference

## What It Is
The Data app (the Home page) is the core of ARV — a property intelligence platform for real estate investors. It surfaces transaction data from the SFR data pipeline organized by MSA (Metropolitan Statistical Area) and lets users explore properties by status, location, price, company, and more. The primary use case is researching which investors are buying and selling in a given market, what prices they're transacting at, and who the active operators are.

It is the most data-dense part of the application. Everything is filtered, paginated, and synchronized through URL state so deep links work correctly.

---

## Page Entry Point
`client/src/pages/Home.tsx` — wraps `HomeContent` in 5 context providers:
`MapProvider → FiltersProvider (defaultCounty) → CompaniesProvider → PropertiesProvider → PropertyProvider`

Before rendering, `Home.tsx` waits for auth to resolve when there's no `?county=` in the URL. This prevents a double-fetch caused by `useDataNav` pushing the user's default county after the initial render.

---

## Layout

CSS Grid: `grid-cols-[375px_1fr] grid-rows-[auto_1fr]`

```
[ Row 1, Col 1 ] "Investor Profiles" sidebar header (height auto-tracks Row 1 Col 2)
[ Row 1, Col 2 ] FilterHeader
[ Row 2, Col 1 ] CompanyDirectory  (scrollable, 375px fixed width)
[ Row 2, Col 2 ] Content Area (view-dependent)
```

Content Area renders based on `view`:
- `"map"` → `PropertyDetailPanel` (sidebar) + `PropertyMap`
- `"table"` → `TableView`
- `"grid"` / `"buyers-feed"` / `"wholesale"` → `GridView`

---

## Component Tree

```
HomeContent
├── Header (county passed for display)
├── FilterHeader
│   ├── Status tag filters (In-Renovation, Wholesale, Sold)
│   ├── State selector
│   ├── County combobox
│   ├── Zip / City autocomplete (with property counts)
│   ├── Date range selector (60d, 90d, 6mo, 1yr, all-time)
│   ├── Price range slider ($0–$10M, $50K steps)
│   ├── Bedrooms select
│   ├── Bathrooms select
│   ├── Property type multi-select
│   └── Clear Filters button (when active)
├── CompanyDirectory
│   ├── Search input (debounced 300ms)
│   ├── Sort select (7 sort options)
│   ├── Company list (infinite scroll, 50 per page)
│   │   └── CompanyCard (expandable)
│   │       ├── Rank badge (gold/silver/bronze for top 3)
│   │       ├── Company name + contact name
│   │       ├── Property count badges (varies by sort)
│   │       └── Expanded section:
│   │           ├── Properties owned, YTD/all-time sold/bought
│   │           ├── Market ranking
│   │           ├── Principal/contact details
│   │           ├── 90-day acquisition chart (recharts BarChart)
│   │           └── Action buttons: View Properties, Enrich, Edit, Copy
│   └── Ensured company slot (if selected company not in paginated list)
├── [map view] PropertyDetailPanel + PropertyMap
│   ├── PropertyDetailPanel (w-96 right sidebar)
│   │   └── PropertyContent (variant="panel")
│   └── PropertyMap (React Leaflet)
│       └── Colored pins (status + company role based)
├── [table view] TableView → PropertyTable (infinite scroll, 20/page)
├── [grid/buyers-feed/wholesale] GridView → PropertyCard grid (infinite scroll, 10/page)
│   └── PropertyCard → PropertyContent (variant="card")
├── AppDialog → LeaderboardDialog
├── AppDialog → InfoDialog
└── AppDialog → PropertyModalContent
    └── PropertyContent (variant="modal")
```

---

## State Management

### `useFilters()` — property filters
```ts
filters: {
  minPrice, maxPrice: number
  bedrooms: "Any" | "1" | "2" | "3" | "4" | "5+"
  bathrooms: "Any" | "1" | "1.5" | "2" | "2.5" | "3" | "3.5" | "4"
  propertyTypes: string[]
  zipCode: string
  city?: string
  county?: string      // Default: user.county ?? "San Diego"
  statusFilters: string[]
  dateRange?: DateRange
}
sortBy: "recently-sold" | "days-held" | "price-high-low" | "price-low-high"
hasActiveFilters: boolean
clearFilters(overrides?)  // Preserves county by default
```

### `useView()` — active view and sidebar
```ts
view: "map" | "grid" | "table" | "buyers-feed" | "wholesale"
sidebarView: "directory" | "filters" | "none"
```
View is persisted to `?view=` in the URL.

### `useDataNav()` — URL params
```ts
county: string          // ?county=
propertyId: string | null   // ?property=
companyId: string | null    // ?company=
```
`Home.tsx` has 4 sync effects that keep these URL params ↔ filter/selection state in sync:
1. URL county → filters.county (on mount and when `nav.county` changes)
2. URL propertyId → `fetchProperty(id)` (on mount)
3. URL companyId → `handleCompanyClick(id)` (on mount)
4. `property.id` change → `nav.setPropertyId` (reverse sync)
5. `company.id` change → `nav.setCompanyId` (reverse sync)

### `useGeoMap()` / `useMap()` — map center and pins
```ts
mapCenter: [lat, lng] | undefined
mapZoom: number | undefined
mapPins: MapPin[]          // when fetchMapPins: true
filteredMapPins: MapPin[]  // pins after filter + company application
```
- Map pins fetched from `/api/properties/map` only when view === "map"
- Filter changes trigger geocoding (zippopotam.us) to recenter map:
  - Zip → zoom 16, City → zoom 15, County → zoom 12
- Company selection recalculates bounding box of company pins, auto-fits zoom (8–20)

### `useCompanies()` — company directory
```ts
company: CompanyContactWithCounts | null  // Currently selected company
companies: CompanyContactWithCounts[]     // Paginated directory list
total: number
hasMore: boolean
directorySort: DirectorySortOption
directorySearch: string
loadCompanies(overrides?)
loadMoreCompanies()
handleCompanyClick(name, id)    // Expands filters to ALL statuses + all-time date range
ensuredCompany: CompanyContactWithCounts | null  // Selected company when not in list
companySelectionInProgressRef   // Prevents loadCompanies during company selection
```

### `useProperties()` — property list
```ts
properties: Property[]
totalProperties: number
stablePropertyCount: number      // Retained during loading to prevent flicker
isLoading, isFetching: boolean
propertiesHasMore: boolean
loadMorePropertiesRef: RefObject  // Infinite scroll sentinel
```
- Not active when view === "map" (map uses useGeoMap instead)
- Page resets to 1 on any filter, sort, company, or view change
- Page 1 replaces list; page > 1 appends with deduplication by ID
- Page size: 10 (grid), 20 (table)

### `useProperty()` — single selected property
```ts
property: Property | null
setProperty(p)
fetchProperty(propertyId)   // GET /api/properties/:id
```

---

## API Surface

### Properties (`/api/properties`)
| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/properties` | Public | List with filters (county, zip, city, status, price, beds, baths, type, company, sort, page, limit) |
| GET | `/api/properties/map` | Public | Map pins (id, lat, lng, address, status, companyId, etc.) |
| GET | `/api/properties/suggestions` | Public | Address autocomplete |
| GET | `/api/properties/streetview` | Public | Google Street View proxy |
| GET | `/api/properties/:id` | Public | Single property |
| GET | `/api/properties/:id/transactions` | Public | Full transaction history |
| PATCH | `/api/properties/:id` | relationship-manager+ | Update isArvFunded, status |
| POST | `/api/properties` | admin/owner | Add property |
| DELETE | `/api/properties/:id` | admin/owner | Delete property |

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

### Geocoding (`/api/geocoding`)
| Method | Route | Description |
|---|---|---|
| GET | `/api/geocoding/county` | Reverse geocode lat/lng → county (US Census Bureau proxy) |

---

## Backend

### Properties Service (`server/services/properties/properties.services.ts`)

**`getProperties(filters)`** — the core query
- Builds SQL dynamically: full-text search on address fields, EXISTS subqueries for company/status filters, date range calculation, price/bed/bath comparisons
- **Transaction display logic:** determines what company to show on each property card
  - Company selected: shows most recent Arms Length or Assignment tx involving that company
  - No company: shows most recent Arms Length tx
  - Detects "assignor" pattern: Assignment tx seller between two Arms Length txs — surfaces separately
- Sorting: recently-sold, days-held, price-high-low, price-low-high

**`getMapProperties(county, status, dateRange, companyId)`**
- Returns lightweight `MapPin[]` (id, lat/lng, address, status, companyId, buyerId, sellerId)
- Pin color on the frontend is determined by status + company role

### Companies Service (`server/services/companies/companies.services.ts`)

**`getContacts(params)`** — directory listing
- 7 sort modes each use different count aggregates over `property_transactions`
- County filtering via EXISTS subquery on `company_counties`
- Returns `CompanyContactWithCounts` with all count fields populated

**`getCompanyById(id, county)`** — full company detail
- All property counts (owned, sold YTD/all-time, bought YTD/all-time, wholesale)
- 90-day acquisition by month: `[{ key: "2024-10", count: 3 }, ...]`
- Contacts list with sort order

---

## Database Schema (key tables)

### Properties
| Table | Purpose |
|---|---|
| `properties` | Core property record; status, MSA, county, isArvFunded, sfrPropertyId |
| `addresses` | One-to-one with properties; lat/lng, street, city, state, zip |
| `structures` | One-to-one; beds, baths, sqft, year built, condition |
| `assessments` | One-to-many; assessed/market value by year |
| `property_transactions` | The heart of the data; buyerId/sellerId (FK→companies), price, dateSold, transactionType (arms length / assignment), sortOrder |
| `property_statuses` | Many-to-many with `statuses` (in-renovation, on-market, sold, wholesale) |
| `statuses` | Lookup table for status names |

### Companies
| Table | Purpose |
|---|---|
| `companies` | companyName (unique), isArvClient |
| `company_contacts` | Contacts per company; name, email, phone, title, sortOrder |
| `company_counties` | Which counties a company has activity in |
| `company_details` | OpenCorporates enrichment data (20+ fields) |
| `company_addresses` | Registered/mailing/head office addresses |

---

## Views

### Map View
- All filtered properties rendered as color-coded pins on a Leaflet map
- Pin colors: blue (in-renovation), green (on-market), red (sold), purple (wholesale), orange (selected)
- Clicking a pin opens `PropertyDetailPanel` in the left sidebar
- Company selection re-centers map to company's property bounding box
- Filter changes recenter to zip/city/county coordinates via zippopotam.us

### Grid View
- Responsive card grid: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`
- 10 properties per page, infinite scroll
- Click card → property modal
- Buyers-feed and wholesale are grid variants with different status filter presets

### Table View
- Full-width property table
- 20 properties per page, infinite scroll
- Click row → property modal

---

## Property Display Logic

### Which transaction is shown
The card shows the most recent relevant transaction (not all of them):
- **No company filter active:** most recent Arms Length transaction → buyer + seller company names
- **Company selected:** most recent tx where that company is buyer or seller
- **Assignor pattern:** when a company appears as seller in an Assignment tx between two Arms Length txs, it's surfaced as "assignor" separately from the main buyer/seller

### Spread (wholesale)
Shown only for Arms Length transactions: `buyer price − seller price`. Displayed in green/red based on sign.

### Company enrichment
Admin/owner can trigger OpenCorporates enrichment from the company card. This fills `company_details` with incorporation date, officers, addresses, alternate names, etc. Requires a valid 2-letter state code.

---

## Company Membership & Claiming

Users can be **associated with companies** so they can see their company's transaction
portfolio, market ranking, and acquisition activity. Membership is recorded in the
`company_members` join table — a slim access/ownership roster kept deliberately separate
from `company_contacts` (the public display roster sourced from the data pipeline). A user
being a member does **not** automatically make them a public-facing contact.

There are **two ways** a user becomes associated with a company:

1. **User request → approval.** From the Company Directory, an authenticated user submits a
   request to join a company. This creates a `company_claims` row with `status: 'pending'`.
   An admin or owner reviews it in the **Claims** tab of the Admin Panel and approves or
   rejects it. On approval, a `company_members` row links the user to the company. Multiple
   users can request to join the same company — each is reviewed independently, so a company
   can have several approved members. If a company already has an approved member, additional
   requests surface as a **dispute** but flow through the same queue.

2. **Direct admin assignment.** An admin or owner can open a user in the **Users** table of
   the Admin Panel and directly add the companies that user is associated with — bypassing the
   request/approval flow entirely.

Approved memberships appear in the user's Profile under "My Companies."

| Table | Purpose |
|---|---|
| `company_claims` | Pending/approved/rejected join requests; admin review queue |
| `company_members` | Access/ownership roster — which users belong to which companies (`role`, `is_primary`) |

---

## Access Control

| Action | Public | Relationship Manager | Admin/Owner |
|---|---|---|---|
| Browse properties and companies | ✓ | ✓ | ✓ |
| View property transactions | ✓ | ✓ | ✓ |
| Update property isArvFunded / status | — | ✓ | ✓ |
| Add / delete property | — | — | ✓ |
| Edit company / contacts | — | — | ✓ |
| Enrich company from OpenCorporates | — | — | ✓ |
| Request to join a company | authenticated users | ✓ | ✓ |
| Approve / reject claims, assign user↔company | — | — | ✓ (+ relationship-manager for review) |

---

## Key Files

| Layer | Path |
|---|---|
| Page | `client/src/pages/Home.tsx` |
| Layout content | `client/src/components/data/` (15 component files) |
| Filter hook | `client/src/hooks/useFilters.tsx` |
| View hook | `client/src/hooks/useView.ts` |
| Nav hook | `client/src/hooks/useDataNav.ts` |
| Map hook | `client/src/hooks/useMap.tsx` |
| Companies hook | `client/src/hooks/useCompanies.tsx` |
| Properties hook | `client/src/hooks/useProperties.tsx` |
| Property hook | `client/src/hooks/useProperty.tsx` |
| Property routes | `server/routes/properties.routes.ts` |
| Company routes | `server/routes/companies.routes.ts` |
| Properties service | `server/services/properties/properties.services.ts` |
| Maps service | `server/services/properties/maps.services.ts` |
| Companies service | `server/services/companies/companies.services.ts` |
| Properties schema | `database/schemas/properties.schema.ts` |
| Companies schema | `database/schemas/companies.schema.ts` |

---

## Data Pipeline

The Data app displays what the pipeline ingests. The pipeline runs as a cron job and syncs property transaction data from the external SFR (Single Family Rental) API into the database, organized by MSA.

### Entry Point
`runConsumer()` in `server/jobs/consumer.ts` — orchestrates the full pipeline. Reads pending rows from `market_scan_queue` in batches, processes them through the steps below, and marks rows complete or failed.

### Pipeline Steps (per batch)
1. **`fetchQueue`** — Pulls pending rows from `market_scan_queue` for a given MSA (capped at `MAX_PROPERTIES_PER_MSA` unique properties per run)
2. **`markProcessing`** — Marks fetched rows as `processing` to prevent duplicate processing in concurrent runs
3. **`batchLookup`** — Calls `/properties/batch` on the SFR API to enrich raw queue records with full property details
4. **`getTransactions`** — Calls `/properties/transactions` on the SFR API for each property to retrieve full transaction history
5. **`cleanTransactions`** — Parses transaction data to extract company names and county associations
6. **`insertCompanies`** — Upserts buyer/seller companies into the `companies` table and associates them with the MSA
7. **`resolvePropertyIds`** — Looks up `buyer_id` and `seller_id` foreign keys by resolving company names against the `companies` table
8. **`resolveStatuses`** — Determines each property's status: `on-market`, `in-renovation`, `sold`, or `wholesale`
9. **`cleanBeforeInsert`** — Final normalization pass (county, property_type, etc.) before DB insert
10. **`resolveArvFunded`** — Annotates each property with `is_arv_funded` based on lender patterns in transaction history
11. **`insertProperties`** — Upserts properties and all child records (transactions, statuses, associations)
12. **`updateArvClientCompanies`** — Marks companies as ARV clients based on their resolved transaction involvement
13. **`markComplete` / `markFailed`** — Updates queue row status; failed rows stay in the queue for manual review and are not retried automatically

### Key Behaviors
- Properties flagged as **New Construction** are excluded and marked failed: `"Property is New Construction"`
- Properties where **status cannot be resolved** are excluded and marked failed: `"Couldn't Resolve Status"`
- A failed batch does **not** abort the rest of the MSA — errors are caught per-batch and processing continues
- `MAX_PROPERTIES_PER_MSA` controls throughput (currently 5); each property makes ~2 external API calls

### Relevant Files
- `server/jobs/consumer.ts` — Main consumer orchestrator
- `server/jobs/processes/` — Individual pipeline step functions
- `database/schemas/msas.schema.ts` — MSA table schema
