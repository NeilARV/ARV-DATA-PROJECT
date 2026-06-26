# Property Code-Violation Alerts — MVP Plan

> **Status:** Plan / pre-build. Scope = **City of San Diego code-enforcement complaints**, acquired
> via **manual CSV upload**, delivered as **email + in-app (bell) alerts**, and stored permanently
> in dedicated **`cv_` tables** that are the system of record.
>
> **Build target — decided:** the **MVP is built in the monorepo** (Express) for speed and to
> validate match quality fast; **AWS is kept as the production / automated-scraping home** (§7) and
> is a near-lossless port later because the pipeline is written as portable pure functions. The
> AWS↔monorepo trade-off analysis is preserved in §5.
>
> **Notifications — decided:** a dedicated `cv_violations`/`cv_matches` store is the **permanent
> record**; the existing **notification/bell system (new `code_violation` type) is the delivery
> layer**; **email** is the push channel. These are complementary, not either/or (§4.7).
>
> **Three-day prototype:** upload → process → match → **email + bell**, sending to an **internal
> recipient** first so the full pipeline is demoable without exposing real clients to fuzzy matches.
> Going live to real owners is then a config flip, not more building.

---

## 1. The idea in one paragraph

The City of San Diego publishes code-enforcement complaints (barking dogs through
substandard-housing and unpermitted-work cases) on its public Accela portal. We already know, in
our own database, **which company owns which property** and **which users belong to which
company**. So we take the city's complaint feed, **match each complaint's address to a property we
track**, resolve that property to its **owning company → linked users**, **store the violation
permanently**, and **alert those users by email + in-app the moment a complaint is filed** —
potentially before the city itself notifies the owner. The driver: we lend to companies renovating
properties, and a code violation can blow up a flip or a loan; warning them early is real value.

---

## 2. Scope

**In scope (the 3-day MVP)**
- One city: **San Diego** (Accela "Code Enforcement" tab).
- Acquisition: **admin downloads the CSV, uploads it through our admin panel** (no scraping/API — §3).
- **Address-string matching** against our `addresses` table (the CSV has no APN — §3).
- **Permanent storage** of every ingested violation in `cv_` tables — matched *and* unmatched (§4.2, §4.6).
- **Notifications on new matches:** **email** (Postmark) + **in-app bell** (new `code_violation`
  type), with a `cv_notifications_sent` idempotency ledger.
- **Admin UI:** an upload screen and a review screen (inspect matches, confirm/dismiss, send alerts).
- **Safety:** prototype emails an **internal/test recipient**; an admin **"Send alerts"** button
  gates the first sends.

**Out of scope (post-MVP — §8)**
- Automated acquisition (scraping Accela / official feed).
- A user-facing, always-visible violations view (property-detail section / dedicated page) —
  the data model supports it now; the UI comes later.
- APN-first matching, status-change alerts, retroactive matching of new properties.
- Other cities/MSAs; nearby-property radius; entity-standing (SOS/FTB); tax-delinquency monitors.

---

## 3. Verified findings (checked against live sources + our schema, 2026-06-26)

### 3.1 There is **no live public API** for *current* San Diego CE data
An earlier draft claimed the OpenDSD API backs the Accela portal and should be the primary source.
**That is wrong / unsafe to rely on:**
- The official open-data set ([data.sandiego.gov](https://data.sandiego.gov/datasets/code-enforcement-violations/))
  is **frozen** — cases *"reported… prior to January 2018… closed out between 2015 and 2018"* — and
  itself defers to OpenDSD for newer data. (It *does* carry `apn`/`lat`/`lng`, but it's 8 years stale.)
- **OpenDSD** ([opendsd.sandiego.gov](https://opendsd.sandiego.gov/web/cecases/)) carries a
  `2023_1220` version stamp and uses **integer** case numbers (`/CECases/Details/232744`). Our live
  records are `CE-0542079` / `26TMP-050225` — a **different numbering scheme**: the signature of a
  system the city migrated *off* when code enforcement moved to the **Accela ACA portal** we use.

**Conclusion:** the live source is **Accela**, exposing only a **CSV download**. Manual download →
upload is the pragmatic MVP. The eventual automation target is **scraping Accela**, not "call OpenDSD."

### 3.2 CSV shape (from a real export)
Columns: `Date, Record Number, Record Type, Address, Application Name, Status, Description,`
(trailing comma → an 8th empty column). Quirks the parser must survive:
- **Two record-number formats:** `CE-#######` (sequential cases) and `##TMP-######` (intake/temp —
  often missing Application Name/Status/Description). A `##TMP` may later reappear as a `CE` →
  **dedup risk** (§4.5).
- **Long descriptions with embedded commas, quotes, smart-quotes, doubled `""`, newlines** → use a
  real CSV parser (`csv-parse`/`papaparse`), never `split(',')`.
- **Messy addresses:** missing zip, `" United States"` suffix, units (`Apt 101`, `, 5,`,
  `299 16TH St, 109`), ALL-CAPS, ordinals (`06Th`, `02nd`), `(Sb)`, `Av`→Ave, `Bl`→Blvd.

### 3.3 Our DB already has the building blocks (confirmed in schema)
| Need | Exists? | Where |
|---|---|---|
| Structured, geocoded addresses | ✅ | `addresses` — `streetNumber/streetName/streetSuffix/pre+postDirection/unitType/unitNumber/city/county/state/zipCode` + `latitude/longitude` ([properties.schema.ts:53](../../database/schemas/properties.schema.ts#L53)) |
| Current owner = most-recent buyer | ✅ **indexed** | `propertyTransactions.buyerId` where `sortOrder = 1`; partial index `idx_pt_buyer_sort1` ([properties.schema.ts:357](../../database/schemas/properties.schema.ts#L357)) |
| Company ↔ user links | ✅ | `companyMembers` (userId, companyId, role); `companyClaims` (claim→approve) |
| Email (Postmark) + RM sender routing | ✅ | `sendTemplateToUser` / `sendTemplateToUsers` ([email.services.ts](../../server/services/postmark/email.services.ts)) |
| In-app notifications (bell, ≤10 feed, email cap) | ✅ | `notifications` table + `notifications.services.ts`; `deal_bid` is a working non-mention precedent |
| Address normalization (partial) | ✅ | `normalizeAddress`, `normalizeAddressForLookup` ([normalization.ts:203](../../server/utils/normalization.ts#L203)) |
| County-scoping index | ✅ | `idx_addresses_county_lower` — cheaply restrict the match set |

**Two caveats that shape the build:**
1. **CSV gives one address string; our DB stores components, with no street index.** Scope the
   candidate set with the indexed `county = 'San Diego'` filter, then match in memory (SD's property
   count is bounded). `normalizeAddress` only abbreviates the *last* word — an ingredient, not a matcher.
2. **APN-first matching is impossible from the CSV** (no APN column), though we store APNs
   (`parcels.apnOriginal`, `propertyTransactions.apn`). The MVP is **address matching** — fuzzy by
   nature — which is why the prototype sends to an internal recipient behind a manual gate.

---

## 4. Shared design (applies to the monorepo MVP and the AWS port alike)

```
  UPLOAD/INGEST → PARSE → MATCH → RESOLVE OWNER → DIFF → NOTIFY
  (CSV in)        (rows)  (→property)  (→users)    (new?)  (email + bell)
                          │
                          └─ store ALL violations (matched or not) in cv_ tables (permanent record)
```

### 4.1 Pipeline stages
1. **Ingest** — accept the CSV; store the **raw file** + an upload/batch row (re-parse without re-download).
2. **Parse** — real CSV parser → rows `{ recordNumber, recordType, rawAddress, applicationName,
   status, description, violationDate }`.
3. **Match** — parse `rawAddress` into components, normalize, resolve to a `property_id` (§4.4).
   **Unmatched rows are stored too** (§4.6).
4. **Resolve owner** — `property_id` → owner company (`buyerId` where `sortOrder = 1`) →
   `companyMembers` users. No members → **"unclaimed"** (internal-only).
5. **Diff** — alert only on **new** matched violations not already in `cv_notifications_sent`.
6. **Notify** — write an in-app `notifications` row (bell) **and** send a Postmark email per owning
   user; record each in `cv_notifications_sent`. (MVP: gated by the admin "Send" button; recipient =
   internal address.)

> **Architectural rule that makes the monorepo→AWS port cheap:** write stages **2–6 as pure
> functions** (`parseCsv`, `matchAddress`, `resolveOwners`, `diffNewViolations`, `notify`) with no
> knowledge of Express or Lambda. The monorepo calls them from a route; AWS calls them from a Lambda
> handler. Same core, two thin triggers — and they're unit-testable locally regardless of host.

### 4.2 Data model — `cv_` tables are the permanent system of record
New tables in our existing Neon DB, **linked to `properties` via `property_id`**. This store is the
durable truth; the notification/bell rows are a disposable projection of it (§4.7).

| Table | Purpose | Key columns |
|---|---|---|
| `cv_uploads` | one row per CSV upload (audit + re-parse + status) | `id`, `uploadedBy`, `fileName`, `rawCsv`, `rowCount`, `matchedCount`, `status` (`pending`/`processing`/`done`/`failed`), `error`, `createdAt`, `processedAt` |
| `cv_violations` | **one row per complaint, kept forever**, idempotent on `recordNumber` | `id`, `recordNumber` **UNIQUE**, `recordType`, `source`, `rawAddress`, `normalizedAddress`, parsed `streetNumber/streetName/unit/city/state/zip`, `applicationName`, `status`, `description`, `violationDate`, `firstSeenAt`, `lastSeenAt`, `sourceUploadId` |
| `cv_matches` | links a violation to a matched property (the property↔violation join) | `id`, `cvViolationId`, `propertyId` (FK `properties`), `matchMethod` (`exact`/`exact_no_zip`/`fuzzy`/`geocode`), `confidence`, `reviewStatus` (`pending`/`confirmed`/`dismissed`), `matchedAt`; **unique** `(cvViolationId, propertyId)` |
| `cv_notifications_sent` | idempotency ledger for alerts | `id`, `cvViolationId`, `propertyId`, `userId`, `channel` (`email`/`in_app`), `sentAt`; **unique** `(cvViolationId, userId, channel)` |

> **Why a dedicated store and not just notifications:** the bell feed is capped (~10) and a cleanup
> job prunes it — correct for ephemeral alerts, wrong for a permanent per-property violation history.
> `cv_violations`/`cv_matches` outlive cleanup and are queryable per property → they power the
> future property-detail "Violations" view (§8) and retroactive matching (§4.6).
>
> **Migration note:** add these with a **targeted migration**, *not* `npm run db:push` (push wants to
> truncate `market_scan_queue` — known drift). Run DB ops from the main repo (no `.env` in worktrees).

### 4.3 Address parsing (CSV string → components)
Split `rawAddress` on commas: first segment = street (+ optional unit); trailing = `City ST ZIP`
(strip `United States`). Normalize: lowercase, collapse whitespace; standardize suffix via
`STREET_TYPE_ABBREVIATIONS` (`Av→Ave`, `Bl→Blvd`, …); normalize ordinals (`06Th→6th`); strip
`(Sb)`-style noise; extract `unit`. Canonical keys: `streetNumber|normalizedStreetName|zip` and a
zip-less `streetNumber|normalizedStreetName|city`.

### 4.4 Matching algorithm (tiers — first hit wins)
1. **Scope** candidates with the indexed `lower(trim(addresses.county)) = 'san diego'`; load into memory.
2. **Tier 1 — exact:** `streetNumber` + `normalizedStreetName` + `zip` → `exact`.
3. **Tier 2 — no-zip:** `streetNumber` + `normalizedStreetName` + `city` → `exact_no_zip`.
4. **Tier 3 — fuzzy:** same `streetNumber`, street-name similarity over threshold → `fuzzy` (review).
5. **Tier 4 — geocode (later):** compare to `addresses.latitude/longitude` within a small radius.
6. **No match** → store the `cv_violations` row with no `cv_matches` (§4.6); still useful data.

### 4.5 Idempotency & dedup
- **Re-uploads overlap** (~2 weeks each) → upsert `cv_violations` on `recordNumber`; update
  `status`/`lastSeenAt`, keep `firstSeenAt`.
- **`##TMP` → `CE` promotion:** MVP accepts possible duplicate alerts; post-MVP secondary dedup key
  on `(normalizedAddress, violationDate)`.
- **Alerts fire once:** `cv_notifications_sent` unique `(cvViolationId, userId, channel)`. (Also makes
  the AWS path safe against S3's at-least-once event delivery.)

### 4.6 Coverage reality — not every property is on our platform
Most complaint addresses **won't match**, by design: our property data comes from the SFR pipeline,
which ingests **corporate/LLC transactions** (ARV-relevant buyers) in **specific MSAs**, so
owner-occupied/individually-owned homes and out-of-coverage areas simply aren't in our DB. Implications:
- **Store unmatched violations anyway** — they're valuable, and they enable the two items below.
- **Retroactive matching (post-MVP):** when a corporate purchase later brings a property into our DB
  via the SFR sync, backfill-match existing `cv_violations` to it (re-run the matcher over unmatched
  rows for that property/zip).
- **Set expectations:** match coverage will be **thin at first**; the admin review screen quantifies
  it on real data before we widen recipients beyond the internal address.

### 4.7 Notifications — three layers, one record (the decision)
| Layer | Tech | Lifetime | Role |
|---|---|---|---|
| **Record** | `cv_violations` + `cv_matches` | **permanent** | source of truth; per-property history; future UI; retroactive matching |
| **In-app** | `notifications` row, **new `code_violation` type** | ephemeral (≤10 feed + cleanup) | "something happened recently" surface in the bell |
| **Email** | Postmark `sendTemplateToUsers` | external | the push that reaches users off-platform |

- **In-app:** add `code_violation` to `notificationTypeEnum`; create a notification per owning user
  with `metadata = { recordNumber, address, violationType, status, propertyId, cvViolationId }`.
  Follows the existing `deal_bid` precedent (single/few recipients, metadata-driven).
- **Email:** new template + env var **name** `POSTMARK_CODE_VIOLATION_TEMPLATE_ALIAS`; RM-sender
  routing is automatic. Run company names through `formatCompanyName` (ARV.RAW-COMPANY-NAME).
- **MVP recipient:** an **internal/test address** (e.g. `DEFAULT_CONTACT_RECIPIENT`); flip to real
  owners post-validation. **Go-live gating** (deferred decision): confidence-tiered — auto-send
  `exact`, hold `fuzzy` for review.
- **Integration caveats to verify when wiring the bell** (§9): `notifications.actorId` may be
  `NOT NULL` (system alerts have no human actor → allow null or use a system user); adding an enum
  value needs `ALTER TYPE … ADD VALUE` (targeted migration, not `db:push`).
- **Cleanup/cap:** the bell's ~10-item cap + cleanup job are **fine as-is** — the permanent record is
  in `cv_` tables, so nothing is lost when bell rows are pruned.

### 4.8 Access control
Upload + review + send are **admin-only** (`requireRole`). User-facing alerts respect app-access
gating like the rest of the app. Document new routes in `.claude/docs/access-control.md` and
`.claude/docs/api.md`; add baseline integration tests (testing standard).

---

## 5. Stack decision — AWS vs. monorepo (analysis preserved)

**Decided: monorepo for the MVP, AWS for production/scraping (§7).** The feature is identical either
way; only *where processing runs* and *what triggers it* differ. ("We can't trigger a worker on DB
insert" is true in the monorepo — so the **upload API call invokes processing**; in AWS the **S3
object-created event is that trigger**.)

### 5.1 Dimension-by-dimension
| Dimension | Monorepo (Express) | AWS (Lambda + S3) |
|---|---|---|
| **Time to first working match** | ~0 setup; new routes/tables only | ~0.5 day infra (with in-house AWS expertise) + Lambda bundling/connection glue |
| **Dev loop** | `npm run dev` + Vitest/Supertest (seconds) | LocalStack/deploy-to-test (minutes) — but pure functions are testable locally either way |
| **Code sharing / DB access** | bare imports of `/database` + `/shared`; existing pooled connection | bundle ESM slice into Lambda; **Neon serverless driver** (§7.3) |
| **Secrets** | reuse existing env | duplicate into **SSM** + IAM read (names only) |
| **Failure isolation** | shared box (low risk for a daily human-triggered parse; run off-thread) | **true isolation** — pays off for constant scrapers (post-MVP), not a daily CSV |
| **Validation risk fit** | answer "is coverage worth it?" cheapest/fastest | over-invests infra before the value is proven |
| **Lock-in** | none — pure functions port in ~0.5 day | n/a |

### 5.2 Why monorepo wins for the MVP (recap)
The 3-day clock + unproven match coverage favor the path that spends ~0 on plumbing and reuses auth,
email, DB wiring, and the test harness. Because stages 2–6 are **pure functions**, choosing the
monorepo now is **not** a lock-in: the AWS move is "wrap the same functions in a Lambda handler + the
half-day of Terraform." Flip to building in AWS now only if the feature is already considered
validated *and* automated Accela scraping starts within days of the prototype.

---

## 6. MVP implementation (monorepo) — explicit build spec

### 6.1 Architecture / data flow
```
Admin (browser, authed via requireRole)
  │  ① upload CSV (multipart/form-data)
  ▼
POST /api/admin/code-violations/uploads ──► insert cv_uploads (status=pending, rawCsv)
  │  respond 202 { uploadId }
  ▼  ② background (off request thread): processUpload(uploadId)
  ├─ parseCsv(rawCsv)                         → normalized rows
  ├─ upsert cv_violations (key = recordNumber)
  ├─ matchAddress(row) vs addresses[county='San Diego']
  │     ├─ hit  → insert cv_matches (method, confidence, reviewStatus=pending)
  │     └─ miss → keep cv_violations row unmatched (§4.6)
  ├─ resolveOwners(propertyId) → owning company → companyMembers users
  └─ cv_uploads.status = done (rowCount, matchedCount)
  ▼  ③ admin reviews
GET /api/admin/code-violations/matches  ◄── review screen (matched + unmatched counts, fuzzy flags)
  │  confirm/dismiss fuzzy matches; click "Send alerts"
  ▼  ④ notify (new, confirmed matches only)
POST /api/admin/code-violations/notify ──► per (violation × owner user):
  ├─ in-app : insert notifications (type=code_violation, metadata)        → bell
  ├─ email  : sendTemplateToUsers(template, recipients=[internal])        → Postmark
  └─ ledger : insert cv_notifications_sent (unique violation×user×channel) → idempotent
```

### 6.2 Upload the document
- **UI** — admin-only page (`client/src/pages/admin` or `components/admin/CodeViolationsUpload.tsx`):
  `<input type="file" accept=".csv">`, submit, then show the upload's live status + a summary
  (rows parsed / matched / unmatched) by polling `GET …/uploads/:id`.
- **API** — `POST /api/admin/code-violations/uploads` (multipart, `requireRole` admin). Validate
  content-type/size, store the raw CSV in `cv_uploads.rawCsv` (text; ~1k rows is a few hundred KB —
  Supabase Storage is the alternative if files grow), set `status=pending`, respond **`202`** with
  `{ uploadId }`.
- **Trigger** — after responding, kick `processUpload(uploadId)` **off the request thread**
  (background task; flip `status` `pending→processing→done/failed`, capture `error`). A `node-cron`
  sweep that re-picks `processing` rows older than N minutes is a nice-to-have for crash recovery;
  not required for MVP since re-upload is idempotent.

### 6.3 Process the document
`processUpload` orchestrates the pure functions:
1. `parseCsv(rawCsv)` — tolerant parse (quoted/multiline fields, trailing empty column, blank
   `##TMP` fields) → normalized rows.
2. **Upsert** each into `cv_violations` on `recordNumber` (insert new; update `status`/`lastSeenAt`
   on repeats).
3. `matchAddress(row, candidates)` — candidates = addresses scoped to `county='San Diego'`, matched
   in memory by the §4.4 tiers → insert/update `cv_matches` (or leave unmatched).
4. `resolveOwners(propertyId)` — `propertyTransactions` `sortOrder=1` `buyerId` → `companyMembers`
   users; `unclaimed` if none.
5. Write `cv_uploads.matchedCount`/`rowCount`, `status=done`.
*(No emails sent here — notification is the separate, admin-gated step ④.)*

### 6.4 Send notifications
- **Trigger** — `POST /api/admin/code-violations/notify` from the review screen's **"Send alerts"**
  button (MVP gate). For each **new** matched violation × owning user not already in
  `cv_notifications_sent`:
  - **In-app:** insert a `notifications` row (`type=code_violation`, metadata per §4.7) → appears in
    the bell.
  - **Email:** `sendTemplateToUsers({ recipients: [<internal address>], templateAlias:
    POSTMARK_CODE_VIOLATION_TEMPLATE_ALIAS, templateModelForRecipient })` — company names via
    `formatCompanyName`. **Recipient is the internal/test address for the prototype.**
  - **Ledger:** insert `cv_notifications_sent` (`email` and/or `in_app`) — unique constraint makes
    re-clicks/at-least-once-safe.
- **Go-live (post-validation):** swap recipient to real owning users; optionally auto-send `exact`
  matches and keep `fuzzy` behind the button (confidence-tiered).

### 6.5 Build the UI
- **Upload page (admin)** — §6.2; file picker + status/summary.
- **Review page (admin)** — table over `cv_matches` joined to `cv_violations` + `properties`:
  columns = date, record #, address, violation type, status, matched property, method/confidence,
  owner company + recipient users, notify state. Actions: confirm/dismiss fuzzy; **Send alerts**.
  Also surface **unmatched** and **unclaimed** counts (coverage signal, §4.6).
- **Bell** — render the new `code_violation` notification type (icon + "Code violation at {address}"
  → links to the property/review). Reuses the existing bell feed; no new always-visible surface yet.
- **API wrapper** — `client/src/api/codeViolations.api.ts` (upload, get upload status, list matches,
  notify).
- **Future (post-MVP, §8):** a user-facing always-visible view — a "Violations" section on the
  property detail page and/or a dedicated list — reading from `cv_` tables (not the bell).

### 6.6 Data model — Drizzle sketch (`database/schemas/codeViolations.schema.ts`)
```ts
export const cvUploads = pgTable('cv_uploads', {
  id: uuid('id').defaultRandom().primaryKey(),
  uploadedBy: uuid('uploaded_by').references(() => users.id),
  fileName: varchar('file_name', { length: 255 }),
  rawCsv: text('raw_csv'),
  rowCount: integer('row_count'),
  matchedCount: integer('matched_count'),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  error: text('error'),
  createdAt: timestamp('created_at').defaultNow(),
  processedAt: timestamp('processed_at'),
});

export const cvViolations = pgTable('cv_violations', {
  id: uuid('id').defaultRandom().primaryKey(),
  recordNumber: varchar('record_number', { length: 40 }).notNull().unique(),
  recordType: varchar('record_type', { length: 50 }),
  source: varchar('source', { length: 30 }).notNull().default('sandiego_accela'),
  rawAddress: text('raw_address'),
  normalizedAddress: text('normalized_address'),
  streetNumber: varchar('street_number', { length: 20 }),
  streetName: varchar('street_name', { length: 120 }),
  unit: varchar('unit', { length: 20 }),
  city: varchar('city', { length: 100 }),
  state: varchar('state', { length: 2 }),
  zip: varchar('zip', { length: 10 }),
  applicationName: text('application_name'),
  status: varchar('status', { length: 60 }),
  description: text('description'),
  violationDate: date('violation_date'),
  firstSeenAt: timestamp('first_seen_at').defaultNow(),
  lastSeenAt: timestamp('last_seen_at').defaultNow(),
  sourceUploadId: uuid('source_upload_id').references(() => cvUploads.id),
}, (t) => [index('idx_cv_violations_norm_addr').on(t.normalizedAddress)]);

export const cvMatches = pgTable('cv_matches', {
  id: uuid('id').defaultRandom().primaryKey(),
  cvViolationId: uuid('cv_violation_id').notNull().references(() => cvViolations.id, { onDelete: 'cascade' }),
  propertyId: uuid('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
  matchMethod: varchar('match_method', { length: 20 }).notNull(),
  confidence: decimal('confidence', { precision: 4, scale: 3 }),
  reviewStatus: varchar('review_status', { length: 20 }).notNull().default('pending'),
  matchedAt: timestamp('matched_at').defaultNow(),
}, (t) => [unique().on(t.cvViolationId, t.propertyId), index('idx_cv_matches_property').on(t.propertyId)]);

export const cvNotificationsSent = pgTable('cv_notifications_sent', {
  id: uuid('id').defaultRandom().primaryKey(),
  cvViolationId: uuid('cv_violation_id').notNull().references(() => cvViolations.id, { onDelete: 'cascade' }),
  propertyId: uuid('property_id').notNull(),
  userId: uuid('user_id').notNull().references(() => users.id),
  channel: varchar('channel', { length: 10 }).notNull(),
  sentAt: timestamp('sent_at').defaultNow(),
}, (t) => [unique().on(t.cvViolationId, t.userId, t.channel)]);
```

### 6.7 Files to create / touch
- **DB:** `database/schemas/codeViolations.schema.ts` (+ export in `schemas/index.ts`); enum value
  `code_violation` on `notificationTypeEnum`; targeted migration.
- **Server:** `server/routes/codeViolations.routes.ts`; `server/controllers/codeViolations/`;
  `server/services/codeViolations/` (`parseCsv`, `matchAddress`, `resolveOwners`, `diffNewViolations`,
  `notify`, `processUpload`). Reuse `postmark/email.services.ts`, `notifications.services.ts`,
  `normalization.ts`, `formatCompanyName`.
- **Client:** upload page, review page, bell-type rendering, `api/codeViolations.api.ts`.
- **Deps:** a CSV parser (`csv-parse` or `papaparse`).
- **Docs/tests:** `access-control.md` + `api.md`; integration tests for the routes; unit tests for
  `matchAddress`/`parseCsv` against the §3.2 quirks.
- **Env (name only):** `POSTMARK_CODE_VIOLATION_TEMPLATE_ALIAS` (+ Postmark template).

### 6.8 Revised 3-day sequence
- **Day 1 — riskiest first:** `cv_` schema + migration; `parseCsv` + `matchAddress`; unit tests
  against the sample CSV; a throwaway local script to print match coverage on real data (answers
  "is this worth it?" before any UI).
- **Day 2 — pipeline + review:** upload route + `processUpload` (off-thread); `resolveOwners`; admin
  upload + review screens.
- **Day 3 — notify + polish:** `code_violation` enum + bell rendering; Postmark template + `notify`
  endpoint + `cv_notifications_sent` (internal recipient); docs + integration tests; `npm run check`.

### 6.9 Definition of done (MVP)
Admin uploads the Accela CSV → violations stored (matched + unmatched) → review screen shows matches
with coverage counts → "Send alerts" emails the internal recipient **and** drops a bell notification,
each recorded once in the ledger → `npm run check` clean + baseline tests pass.

---

## 7. AWS plan (production / automated-scraping home — kept)

**Refined topology (agreed in discussion):** **S3 → a single Lambda → Neon.** Skip SQS and skip
per-complaint fan-out for the CSV workload — 1k rows is a seconds-long, single-invocation job; fanning
out would re-load the candidate set per row and add pure overhead. Add SQS only when the **scraper**
(a second producer) arrives.

**Flow:** admin upload screen (still in the app) → app mints a **presigned S3 PUT URL** (admin auth
stays in our app; no AWS creds to admins) → CSV lands in a **private S3 bucket** → **S3
object-created event → one Lambda** runs the **same pure pipeline** (parse → match → resolve →
store) writing to Neon → the app's **review screen reads those rows** → notification is the same
**admin-gated** step (app endpoint or a small second Lambda). On Lambda failure, route to a
**DLQ destination** (SQS/SNS) for inspection — DLQ without putting a queue in the hot path.

### 7.1 To build (AWS-specific; everything else is identical to §6)
- **IaC: Terraform** — private S3 bucket (lifecycle-expire raw uploads), Lambda + IAM execution role,
  S3→Lambda event wiring, on-failure **DLQ** destination.
- **SSM Parameter Store** (SecureString) — `DATABASE_URL`, `POSTMARK_SERVER_API_KEY`,
  `DEFAULT_FROM_EMAIL`, `POSTMARK_CODE_VIOLATION_TEMPLATE_ALIAS` (names only) + IAM read policy.
- **Lambda packaging** — esbuild bundle of the pipeline + `/database` + `/shared`.
- **App-side** — presigned-URL endpoint (admin-only); point the upload UI at S3.
- **Observability** — CloudWatch logs + alarms on Lambda errors / DLQ depth.

### 7.2 Setup checklist
1. AWS account + Terraform state backend + credentials.
2. Private S3 bucket (lifecycle rule), Lambda + IAM role, S3→Lambda event, DLQ destination.
3. SSM params + IAM read policy.
4. Lambda bundling + first deploy; smoke-test S3-drop → Neon write end to end.
5. Presigned-URL endpoint in the app; point the upload UI at S3.
6. CloudWatch alarms (errors, DLQ depth).

### 7.3 Database connection (how the Lambda reaches Neon)
**Neon is not "an AWS database" — it's managed Postgres reached over TLS by connection string, with
no VPC/peering.** Admins never connect to it; **only the Lambda does**, reading `DATABASE_URL` from
SSM. Use the **Neon serverless driver** (`@neondatabase/serverless` + `drizzle-orm/neon-serverless`)
rather than a long-lived `node-postgres` TCP pool — Lambda's freeze/thaw lifecycle strands TCP
connections, and the serverless (WebSocket/HTTP) driver sidesteps that. At one-upload-a-day
concurrency, connection limits are a non-issue; connect inside the handler.

> Net: AWS = §6's exact logic + this infra. Processing code is ~95% identical; the delta is trigger,
> runtime, deploy, and the connection driver.

---

## 8. Post-MVP
1. **Automate acquisition — scrape Accela** (`aca-prod.accela.com/SANDIEGO`, CE tab): address search
   → "San Diego" → iterate → parse. The **fragile, constantly-running, possibly headless-browser**
   workload that genuinely benefits from isolated compute — the real reason to be on AWS/a worker.
   Per-case **detail-page** enrichment is the workload where per-target fan-out (SQS) finally fits.
2. **APN-first matching** once scraped detail pages expose APN — far more robust than address strings.
3. **Retroactive matching** — when the SFR sync adds a property, re-run the matcher over unmatched
   `cv_violations` for its zip/address to backfill `cv_matches` (§4.6).
4. **User-facing always-visible UI** — a "Violations" section on the property detail page and/or a
   dedicated list, reading from `cv_` tables (the durable record).
5. **Status-change alerts** (New → Active Investigation → Closed) via the diff stage.
6. **More sources as parsers on the same spine** — nearby-property radius, entity standing (CA
   SOS/FTB), tax delinquency / pre-foreclosure (we already store `taxDelinquentYear` +
   `preForeclosures`). Each is "one parser," not a new pipeline.
7. **Other cities / MSAs.**

---

## 9. Open questions / risks
- **Match coverage** is bounded by which properties we track and which owning companies have linked
  members — likely thin (§4.6). The review screen quantifies it before widening recipients.
- **Address-matching precision** on messy CSV strings is the core technical risk → mitigated by
  internal-recipient + manual gate + unit tests against real quirks.
- **`notifications.actorId` nullability** — system alerts have no human actor; confirm the column is
  nullable or designate a system user before wiring the bell (§4.7).
- **Enum migration** — `code_violation` needs `ALTER TYPE … ADD VALUE` (targeted migration, not `db:push`).
- **Dual-store consistency** — `cv_` tables are the record; bell rows are a projection that may be
  pruned. Don't read history from the bell.
- **`##TMP` → `CE` dedup** (§4.5) can double-alert until the secondary dedup key lands.
- **Manual cadence** lags intra-day complaint updates and depends on someone running the download —
  acceptable until automation (§8).

---

### Sources (acquisition verification, 2026-06-26)
- [data.sandiego.gov — Code Enforcement Violations dataset](https://data.sandiego.gov/datasets/code-enforcement-violations/) (frozen, 2015–2018)
- [OpenDSD — CE Case Search](https://opendsd.sandiego.gov/web/cecases/) (legacy, `2023_1220`, integer case IDs)
- [OpenDSD API — community docs](https://github.com/scoutred/opendsd)
- Live source in use: Accela ACA portal — `aca-prod.accela.com/SANDIEGO` (CSV download only)
