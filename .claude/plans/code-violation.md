# Property Code-Violation Alerts — MVP Design & Build Plan

> **Status:** Plan / pre-build. No code written yet.
> **Companion:** [`code-violation-scraper.md`](code-violation-scraper.md) automates only the
> **ACQUIRE** stage of the pipeline designed here; it depends on this MVP existing first. Where the
> two disagree, **this doc is canonical for the pipeline, data model, and notifications.**
>
> **Scope discipline (read this first):** this document designs **Version 1** — *manual CSV upload by
> an admin → match → notify by email*. Everything that is explicitly a later iteration is collected in
> **§8 (Future iterations)** and must **not** be built in V1: the headless scraper (§8.1), the in-app
> notification layer (§8.2), and auto-ingesting properties we don't yet have (§8.3). V1 ships the
> smallest thing that delivers the core value: *"a company we have a user for got a code complaint —
> email that user within a day."*

---

## 1. Feature summary & goal

**What it is.** San Diego publishes code-enforcement complaints/violations on a public Accela portal.
We can export the recent complaints as a CSV. This feature lets an **admin/owner upload that CSV in
the admin panel**, then the app:

1. parses the CSV,
2. matches each complaint's address to a property we already track,
3. resolves the property's **current owning company** (from transaction data),
4. checks whether any of **our users are associated with that company**, and
5. **emails those users** that a property tied to their company has a new code complaint.

Every complaint that matches a property in our DB is **stored** (whether or not anyone is notifiable),
so we accumulate a code-violation history keyed to our properties.

**Goal.** Be the first to tell an investor "the city just opened a complaint on one of your
properties." Speed-to-alert (within a day) is the whole value proposition; manual daily uploads are
more than fast enough for V1. **No scraping, no external API calls** in V1 — a human downloads the CSV
and uploads it.

**Explicit non-goals for V1** (see §8): automated scraping, in-app/bell notifications, adding
properties we don't already have, and a polished email template.

---

## 2. The relationships that make this work

This feature is a join across four things we already model. Understanding the chain is the design:

```
  complaint address ──match──► properties (+ addresses 1:1)
                                   │
                                   ├─ most-recent arms-length tx (property_transactions, sortOrder=1)
                                   │        └─ buyerId ──► companies            (the current owner)
                                   │                          │
                                   │                          └─ company_members ──► users (emails)
                                   └─ if no matching property, or owner is an individual,
                                      or the company has no associated user  →  store, don't notify
```

Concrete anchors (verified in the codebase):

| Step | Where | Notes |
|---|---|---|
| Property + address | `properties` (uuid PK) + 1:1 `addresses` | match on `addresses.formatted_street_address`, `city`, `state`, `zip_code` |
| Current owner | `property_transactions` ordered by `sortOrder` **ASC** (`sortOrder = 1` = most recent) | the **buyer** of the most recent arms-length tx is the current owner; service `propertyTransactions.services.ts` |
| Owner identity | `companies` (uuid PK, `companyName` unique) | linked via `property_transactions.buyerId`; if only `buyerName` (string, no FK) → treat as **individual/unlinked**, don't notify |
| User association | `company_members` (`userId`, `companyId`, `role`, `isPrimary`) | a company can have **multiple** members → notify them all; service `claims.services.ts → getCompanyMembers(companyId)` |
| User email | `users.email` | required at signup, so always present for a member |

There is **no `entity_type` column** distinguishing companies from individuals; the signal we use is
"did the most-recent arms-length transaction resolve to a `companies` FK (`buyerId`) that has at least
one `company_members` row." That is the only gate for "notifiable."

---

## 3. The data source

### 3.1 Where it comes from
San Diego Code Enforcement, Accela Citizen Access portal — **General Search → Search → Download
results**:

`https://aca-prod.accela.com/SANDIEGO/Cap/CapHome.aspx?module=CE&TabName=CE&TabList=Home%7C0%7CDSD%7C1%7CCE%7C2%7CCurrentTabIndex%7C2`

A human opens this, clicks Search (most-recent-first), and downloads the CSV. In V1 that human is an
admin who then uploads the file to our admin panel. (Automating this download is §8.1.)

### 3.2 CSV shape
Header (note the **trailing comma** → an 8th, empty-named column that must be ignored):

```
"Date","Record Number","Record Type","Address","Application Name","Status","Description",
```

| Column | Example | Maps to |
|---|---|---|
| `Date` | `06/26/2026` (MM/DD/YYYY) | `cv_violations.violation_date` |
| `Record Number` | `CE-0542079` | `cv_violations.record_number` — **the idempotency key (§4.5)** |
| `Record Type` | `Complaint` | `cv_violations.record_type` |
| `Address` | `991 Worthington St, San Diego CA 92114 United States` | parsed for matching (§4.3) |
| `Application Name` | `Noise-Barking Dogs Noise-Barking Dogs` (often doubled) | `cv_violations.application_name` |
| `Status` | `New` | `cv_violations.status_text` |
| `Description` | free text | `cv_violations.description` |

**Real-data quirks the parser must survive (seen in `temp.csv`):**
- Descriptions contain **embedded `""` quotes and newlines** → use a real CSV parser (**papaparse**, already a dependency), not a line split.
- Address has a **comma between street and city**, but no comma before state, and **zip and `United States` are sometimes absent** (`3750 Torrey View Ct, San Diego CA United States` has no zip; `3029 Broadway, San Diego CA 92102` has no country).
- The trailing header comma yields a `""`-keyed field → drop it.
- File can be large (the example is ~480 KB) and covers a rolling window, so **the same `Record Number` recurs across daily uploads** — dedup is mandatory (§4.5).

---

## 4. The pipeline (shared design)

One pipeline, seven stages, built as **small pure functions** so a second trigger (the scraper, §8.1)
can reuse them unchanged:

```
  ACQUIRE ──► INGEST ──► PARSE ──► MATCH ──► RESOLVE OWNER ──► DIFF ──► NOTIFY
```

| Stage | V1 implementation |
|---|---|
| **ACQUIRE** | Manual: admin downloads the CSV from Accela (out of app). *(Scraper replaces this — §8.1.)* |
| **INGEST** | Admin uploads via the admin panel; we archive the raw file to Supabase Storage and open a `cv_uploads` audit row. |
| **PARSE** | `parseCsv(buffer)` → normalized rows; **validate the header** and quarantine + fail the upload on mismatch (never feed garbage downstream). |
| **MATCH** | `matchAddress(row)` → a `properties.id` or "unmatched" (§4.3). |
| **RESOLVE OWNER** | `resolveOwner(propertyId)` → current owning `companyId` (or "individual/unlinked") (§4.4). |
| **DIFF** | `diffNewViolations(rows)` → drop `record_number`s already stored/notified (§4.5). |
| **NOTIFY** | For each new violation on a company with members → email each member via `sendPlainEmail`; record `cv_notifications_sent`. **Gated by a review step in V1 (§4.6).** |

**Notify scope (decided):** **every matched new violation** notifies — no Record-Type / Status
allowlist in V1. If a matched property's current owner is a company we have a user for, that user gets
emailed regardless of complaint type. (A type/severity allowlist is a possible later refinement, not V1.)

### 4.1 Same core, two thin triggers
The pipeline is deliberately split into **trigger** (how the CSV arrives) and **core** (INGEST→NOTIFY).
V1 has one trigger (manual upload). §8.1 adds a second (scraper). Both drop a raw CSV at the **same
INGEST seam** and reuse PARSE…NOTIFY verbatim. Keep PARSE/MATCH/RESOLVE/DIFF as pure,
side-effect-free functions in the service layer so neither trigger owns business logic.

### 4.2 Migration note (do NOT use `db:push`)
The new `cv_` tables must be added with a **targeted `ALTER`/SQL migration**, **not** `npm run db:push`
— push currently wants to truncate `market_scan_queue` (known unrelated drift; see the
`arv-db-push-unrelated-drift` memory). Write the additive SQL by hand (or `drizzle-kit generate` +
review) and apply it directly.

### 4.3 Address matching (decided approach)
Matching is **string-based** — there is no geocoder in the codebase — so the whole game is
**normalize both sides identically, then compare.** The Accela address field is inconsistent; real
examples seen in the export:

```
3095 W CANYON Av, SAN DIEGO United States          ← no state, no zip
3421 Adams Av, San Diego CA 92116 United States    ← full
3790 Mount Abraham Av, San Diego CA 92111 United States
United States                                       ← junk row, no address
3426 Adams Av, San Diego CA United States          ← no zip
```

General shape: `street number, street name, city, state, zip, country` — but **zip is frequently
missing, state is occasionally missing, country is noise, and some rows are unparseable junk.** So we
cannot be strict, but we must be deterministic.

**Normalization (applied to BOTH the CSV address and the stored `addresses` row before comparing — we
do not assume the DB's stored case; identical normalization makes case moot):**
1. **Uppercase** everything.
2. **Strip `.` and `,`** (so `Av.` ≡ `Av`, and missing commas don't matter).
3. Collapse whitespace; drop a trailing `UNITED STATES`.
4. **Standardize the street suffix** via `formatAddress` / `STREET_TYPE_ABBREVIATIONS`
   (`shared/utils/formatAddress.ts`) — `ST`→street, `AVE`→avenue, etc. **Verify `AV`/`AV.` is in the
   abbreviation map and add it** (the export uses `Av` heavily; the util may only know `Ave`). This is
   the one normalizer change the feature requires.

**Match key:** `street number` + `street name` (+ suffix) must be an **exact** match after
normalization. Then:
- **City + state** must match **when present** in the CSV row (nearly always `San Diego` / `CA`).
- **Zip** is a *tiebreaker only* — used when present, never required (it's missing too often).
- **Country** ignored (US-only app).

**Outcomes:**
- Exactly one property whose normalized street+city(+state) equals the row → **match**.
- Multiple hits → **ambiguous** → admin review list, do not guess.
- Zero hits, or an unparseable row (e.g. bare `United States`) → **unmatched**: counted, raw row
  preserved in the archived file for V2 reprocessing (§8.3). Junk rows are simply skipped.

> The CE portal is San Diego-only, so nearly every row is a San Diego address — which is why
> city/state matching is reliable and zip can be optional. Expect to **tune the normalizer against
> real misses** over time; surface unmatched/ambiguous counts in the admin panel so we can see them.

### 4.4 Owner resolution
Given a matched `propertyId`: read `property_transactions` for it ordered by `sortOrder` ASC, take the
most recent **arms-length** transaction, and use its `buyerId`:
- `buyerId` present → that `companyId` is the current owner. Proceed to NOTIFY if it has `company_members`.
- `buyerId` null (only `buyerName`) → **individual / unlinked owner** → store the match with `owner_company_id = null`, **no email**.
- Company present but **no `company_members`** → store, **no email** (nobody to tell yet).

### 4.5 Idempotency & dedup (critical)
Daily uploads overlap heavily, so **never notify twice for the same complaint.**
- `cv_violations.record_number` is **UNIQUE**. PARSE upserts on it (`ON CONFLICT DO UPDATE` for `status_text`/`description`, since a complaint's status can change `New → Closed`), but DIFF only treats a row as "new" the **first** time we see its `record_number`.
- `cv_notifications_sent` has **UNIQUE(`violation_id`, `user_id`, `channel`)** — a hard backstop against double-emailing even if DIFF is bypassed.
- **`##TMP` → `CE` edge:** Accela sometimes issues a temporary `##TMP-*` record number that is later
  replaced by a permanent `CE-*` number — the *same physical complaint under two record numbers*,
  which would dodge the `record_number` dedup and double-alert. V1 mitigation: a **secondary dedup**
  on `(normalized_address + violation_date + hash(description))` before notifying, so a TMP→CE swap is
  caught. Log when it triggers so we can measure how often it happens.

---

### 4.6 Review gate / dry-run (decided)
For the **initial rollout, notifications do not auto-fire** — a wrong address match emailing the wrong
investor is worse than a slight delay. So INGEST always runs PARSE→MATCH→RESOLVE→DIFF and **stores**
`cv_violations` + `cv_matches`, but **NOTIFY is held** behind admin approval:

- An upload lands in `cv_uploads.status = 'review'` and the admin panel shows the **dry-run result**:
  every match, the resolved owner company, and exactly **which users would be emailed**, plus the
  unmatched/ambiguous lists.
- The admin clicks **Approve** (`POST /api/code-violations/uploads/:id/approve`) → NOTIFY runs →
  `status = 'completed'`.
- Whether review is required is a **single setting** (`CV_REQUIRE_REVIEW`, default **on**). Once match
  quality is trusted, flip it off and uploads go straight through to NOTIFY (`'processing'` →
  `'completed'`) — "dry-run first, then auto."

---

## 5. Architecture & code layout

### 5.1 Files (new), following existing conventions
```
database/
  schemas/code-violations.schema.ts        # cv_uploads, cv_violations, cv_matches, cv_notifications_sent
  validation/code-violations.validation.ts # Zod: parsed-row schema, upload request schema
  types/code-violations.d.ts               # derived types ($inferSelect)

server/
  routes/code-violations.routes.ts         # admin-only upload + list-uploads endpoints
  controllers/code-violations/code-violations.controllers.ts
  services/code-violations/
    ingest.services.ts                      # archive to Supabase + cv_uploads row + orchestration
    parse.services.ts                       # parseCsv + header validation   (pure)
    match.services.ts                       # matchAddress                    (pure)
    owner.services.ts                       # resolveOwner                    (mostly pure)
    notify.services.ts                      # diffNewViolations + email send + cv_notifications_sent

client/
  components/admin/CodeViolationsTab.tsx     # new admin tab (upload + results summary)
  api/code-violations.api.ts                 # typed fetch wrapper
```

### 5.2 The trigger seam
INGEST exposes one entry point — `ingestCodeViolationCsv({ buffer, fileName, source, uploadedBy })` —
that archives the file, writes a `cv_uploads` row (`source: 'manual' | 'scraper'`), then runs
PARSE→NOTIFY. **V1's manual upload controller is the only caller.** §8.1's scraper becomes a second
caller with `source: 'scraper'` and changes nothing downstream. This is the "same core, two thin
triggers" rule (§4.1) made concrete.

---

## 6. Data model (new `cv_` tables)

All additive; apply via targeted migration (§4.2). `cv_violations` is the system of record (every
parsed complaint, property-agnostic); `cv_matches` records the property/owner resolution only when we
can make it — this cleanly supports V2 backfill (an unmatched violation already exists; when its
property is later added we just insert a `cv_matches` row and notify).

**`cv_uploads`** — one row per ingest run (audit + admin results panel)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `source` | text | `'manual'` (default) \| `'scraper'` — included from V1 so §8.1 needs no migration |
| `uploaded_by` | uuid FK users | nullable (null for scraper) |
| `file_name` | text | |
| `raw_ref` | text | Supabase Storage path of the archived CSV |
| `status` | text | `'processing'` \| `'review'` (dry-run awaiting approval, §4.6) \| `'completed'` \| `'failed'` |
| `rows_total` / `rows_matched` / `rows_unmatched` / `violations_new` / `notifications_sent` | int | result counters |
| `error_message` | text | nullable |
| `created_at` / `finished_at` | timestamp | |

**`cv_violations`** — every distinct complaint we've ever parsed
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `record_number` | text | **UNIQUE NOT NULL** — idempotency key (§4.5) |
| `record_type` / `application_name` / `status_text` / `description` | text | from CSV |
| `violation_date` | date | parsed from `Date` |
| `raw_address` | text NOT NULL | original CSV address |
| `normalized_address` | text | for matching + TMP→CE secondary dedup |
| `first_seen_upload_id` | uuid FK `cv_uploads` | which upload introduced it |
| `created_at` / `updated_at` | timestamp | |

**`cv_matches`** — violation ↔ property (+ owner snapshot), only when resolvable
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `violation_id` | uuid FK `cv_violations` (cascade) | **UNIQUE** (one match per violation) |
| `property_id` | uuid FK `properties` (cascade) | |
| `owner_company_id` | uuid FK `companies` | **nullable** — null when owner is individual/unlinked |
| `owner_name` | text | snapshot of `buyerName` at match time |
| `matched_at` | timestamp | |

**`cv_notifications_sent`** — audit of each notification actually delivered
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `violation_id` | uuid FK `cv_violations` (cascade) | |
| `user_id` | uuid FK users | recipient |
| `company_id` | uuid FK companies | the company that linked them |
| `channel` | text | `'email'` in V1 (V2 adds `'in_app'` — §8.2) |
| `sent_at` | timestamp | |
| | | **UNIQUE(`violation_id`, `user_id`, `channel`)** — double-send backstop |

---

## 7. Implementation plan (chunked)

Built in dependency order; each chunk is independently reviewable. The user-facing **Code Violations
frontend does not exist in V1** (email is the only output) — it is deferred to §8.2.

### Chunk A — Data model & migration
- Add the four `cv_` tables in `database/schemas/code-violations.schema.ts`; derive types in `database/types/`.
- Write the **targeted ALTER/SQL** migration (§4.2). Do **not** `db:push`.
- Zod: a parsed-row schema + the upload request schema in `database/validation/code-violations.validation.ts`.

### Chunk B — Admin API (INGEST)
- Route `POST /api/code-violations/uploads` guarded by **`requireRole(ADMIN_ROLES)`** (admin + owner only — *not* `PRIVILEGED_ROLES`, so relationship-managers/members are excluded).
- multer **memoryStorage**, `fileFilter` to `text/csv` / `application/vnd.ms-excel`, sane `limits.fileSize` (~10 MB). Use the `MulterRequest` type (`server/middleware/multerTypes.ts`).
- Controller: validate `req.file` present → archive buffer to Supabase Storage (new bucket env `SUPABASE_CODE_VIOLATION_STORAGE_BUCKET`, names only) → create `cv_uploads` row → call `ingestCodeViolationCsv(...)`.
- `GET /api/code-violations/uploads` (admin) to back the results panel, and `POST /api/code-violations/uploads/:id/approve` (admin) to run NOTIFY for a `review`-status upload (§4.6).
- Run the new-route ceremony via the **`/new-route`** skill so `api.md` / `access-control.md` / tests are scaffolded together.

### Chunk C — Pipeline core (PARSE → MATCH → RESOLVE OWNER → DIFF)
- `parse.services.ts`: papaparse with `header: true`, drop the `""` column, validate header, coerce `Date`, return normalized rows. Quarantine + fail the `cv_uploads` row on header mismatch.
- `match.services.ts`: implement §4.3 — the **uppercase + strip `.`/`,` + suffix-normalize** scheme applied to both sides; exact street number+name, city/state when present, zip optional. Return `matched | unmatched | ambiguous`. **One supporting change:** ensure `AV`/`AV.` maps to avenue in `STREET_TYPE_ABBREVIATIONS` (`shared/utils/formatAddress.ts`).
- `owner.services.ts`: implement §4.4 against `property_transactions` (`sortOrder` ASC).
- Upsert into `cv_violations` (ON CONFLICT `record_number`); insert `cv_matches` for matched rows; `diffNewViolations` computes the notify set (§4.5, incl. the TMP→CE secondary dedup).

### Chunk D — Notify (email), behind the review gate
- NOTIFY runs at upload time only if `CV_REQUIRE_REVIEW` is off; otherwise it runs on **Approve** (§4.6). Same function either way.
- For each new violation whose owner company has `company_members`: resolve members → emails via `getCompanyMembers` + `users.email`; send with **`sendPlainEmail`** (raw HTML; no template in V1) from `server/services/postmark/email.services.ts`. Respect the master `users.notifications` kill-switch (reuse `getEmailRecipientsByUserIds`).
- Write `cv_notifications_sent` rows (idempotent UNIQUE). Update `cv_uploads` counters + `status='completed'`. Fire-and-forget per recipient; log per-recipient failures (mirror existing email jobs).

### Chunk E — Admin UI (with dry-run review)
- New `CodeViolationsTab.tsx` in `client/src/components/admin/`, added to `Admin.tsx` Radix `Tabs`, gated on `isOwner || isAdmin`.
- File input → `FormData` → `POST /api/code-violations/uploads` (TanStack Query mutation, `credentials: 'include'`).
- **Dry-run review screen (§4.6):** after upload, show the matched violations with resolved owner company and **the exact recipients who would be emailed**, plus unmatched/ambiguous lists; an **Approve & Notify** button hits the approve endpoint. Also a recent-uploads list from `GET /api/code-violations/uploads` with the result counters. Follow design-guidelines tokens.

### Chunk F — Tests & docs
- Integration tests for the upload route (auth matrix: admin/owner allowed; RM/member/anon rejected) + unit tests for `parseCsv`, `matchAddress`, `resolveOwner`, `diffNewViolations` (use `temp.csv` quirks as fixtures). See `.claude/docs/standards/testing.md` / `/test`.
- Run the **Agent Updater** so `api.md`, `access-control.md`, `database.md`, and `apps.md` reflect the new route, tables, and admin tab.

---

## 8. Future iterations (V2+) — DO NOT build in V1

### 8.1 Automate acquisition — scrape Accela
Replace the manual ACQUIRE step with a headless-browser worker that downloads the same CSV and feeds
the **same INGEST seam** (§5.2). **Already fully designed** in
[`code-violation-scraper.md`](code-violation-scraper.md) (Playwright, dedicated cloud worker, politeness,
circuit breaker, `cv_scrape_runs` telemetry). Depends on this MVP shipping first.

### 8.2 Internal (in-app / bell) notifications
Add a second notification channel alongside email:
- Add `'code_violation'` to `notification_type` (`database/schemas/mastermind.schema.ts`).
- A `createCodeViolationNotification(...)` in `notifications.services.ts` → insert `notifications` row → `broadcastToUser` over the WebSocket (same path as mentions/deal bids).
- Record `cv_notifications_sent` with `channel = 'in_app'`.
- Build the **user-facing Code Violations UI** (none in V1): surface violations on the property detail panel and/or a dashboard, and add a code-violations toggle to `user_notification_preferences`.

### 8.3 Ingest properties we don't have yet
Today an unmatched address is counted and its raw row is preserved (in the archived CSV) but produces
no violation record. V2: when MATCH returns "unmatched," enqueue the bare address into
`market_scan_queue` so the data pipeline ingests the property, then **retry the violation** until the
property exists and backfill `cv_matches` + notify. This needs a durable retry mechanism — a
**message queue (e.g. SQS)** — rather than naive re-polling, because the property may take time to
appear. Goal: grow coverage and capture violations we currently drop.

### 8.4 Polished email template
V1 sends simple inline HTML via `sendPlainEmail`. V2: a Postmark template
(`POSTMARK_CODE_VIOLATION_TEMPLATE_ALIAS`) and `sendTemplateToUsers`, consistent with deal/property emails.

---

## 9. Tools, dependencies & env vars

**Already installed — no new packages for V1:** `multer` (upload), `papaparse` (+ `@types/papaparse`)
(CSV parse), `@supabase/supabase-js` (raw-file archive), `postmark` (email), Drizzle, TanStack Query,
Radix Tabs.

**New env vars (NAMES ONLY — per ARV.SECRET-ACCESS; never read/print values):**
| Name | Purpose | When |
|---|---|---|
| `SUPABASE_CODE_VIOLATION_STORAGE_BUCKET` | bucket for archived raw CSVs (public, allow `text/csv`) | V1 |
| `CV_REQUIRE_REVIEW` | when on (default), uploads hold in `review` until an admin approves before emails fire (§4.6) | V1 |
| `POSTMARK_CODE_VIOLATION_TEMPLATE_ALIAS` | Postmark template for the violation email | V2 (§8.4) |

Reuses existing `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `POSTMARK_SERVER_API_KEY`,
`DEFAULT_FROM_EMAIL`.

---

## 10. Open questions / risks

**Decided (rolled into the plan):**
- **Review before notify** → **yes** for rollout: dry-run + admin Approve, gated by `CV_REQUIRE_REVIEW` (§4.6).
- **Notify scope** → **every matched new violation** (no type/status allowlist) (§4 NOTIFY note).
- **Match strictness** → normalize both sides (uppercase, strip `.`/`,`, suffix-normalize incl. `Av`→avenue), exact street number+name, city/state when present, zip optional, country ignored (§4.3).

**Still open / risks:**
- **Normalizer coverage.** `Av`/`Av.` is the known gap to fix, but other suffix/abbreviation variants will surface in real data — the unmatched/ambiguous admin lists are how we find and fix them. Budget for iterative tuning.
- **Owner-resolution accuracy.** "Most recent arms-length buyer = current owner" matches the Data app's display logic, but assignment/wholesale chains can complicate it — reuse the Data app's existing transaction-resolution logic rather than reinventing it.
- **Individual owners we *do* have a user for.** V1 only notifies via the company link. If a user is associated with a property some other way in future, that path doesn't exist yet.
- **`##TMP → CE` frequency** (§4.5) — unknown until we see real data; the secondary dedup logs occurrences so we can measure.
- **Upload size / timing.** The sample is ~480 KB; parse + match + notify should run within a request, but if uploads grow, move processing to a background job and return the `cv_uploads` id immediately (the admin panel polls for status).

---

### Sources
- Live target: Accela ACA — San Diego Code Enforcement General Search (`module=CE`), "Download results" export.
- Example export: `temp.csv` (repo root) — defines the §3.2 CSV shape and real-data quirks.
- Companion: [`code-violation-scraper.md`](code-violation-scraper.md) — automates §8.1.
