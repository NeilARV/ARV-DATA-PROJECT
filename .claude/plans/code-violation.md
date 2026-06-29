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

**How it runs (V1):** the upload itself only archives + parses + **enqueues** the complaints and returns
instantly; a **cron consumer** then processes them a batch at a time (match → owner → notify) with a
per-complaint status, mirroring the existing `data_v2` queue/consumer pattern. This decoupling is part
of V1 — see §4–§5.

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

> **⚠️ Use `company_members`, NOT `company_contacts`.** These are different tables and confusing them
> would break the feature:
> - **`company_members`** = the access/ownership roster — *actual platform users* associated with a
>   company. This is the one we join to `users` to get real, deliverable emails to notify. **This is
>   the only association we notify through.**
> - **`company_contacts`** = public display roster sourced from the **OpenCorporates** enrichment
>   (manually inputted). These people are usually **not users on our platform**, and their email is
>   **often absent** these days. **Never** use `company_contacts` for notification recipients.

There is **no `entity_type` column** distinguishing companies from individuals; the signal we use is
"did the most-recent arms-length transaction resolve to a `companies` FK (`buyerId`) that has at least
one **`company_members`** row." That is the only gate for "notifiable." Individual owners are not a
concern — our company only services corporations — but we still **store** their violations (§4.4).

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

## 4. The pipeline (decoupled: fast ingest + queue-driven consumer)

The pipeline is split into **two phases connected by a DB queue**, mirroring the `data_v2` design
(`market_scan_queue` + `runConsumer`). The upload request does almost nothing and returns instantly;
all the heavy per-complaint work happens later in a **cron consumer** that processes a few rows at a
time with a visible per-complaint status. This is a V1 feature (the queue makes V1 run smoother and is
cheap because the pattern already exists).

```
  PHASE 1 — INGEST (synchronous, in the HTTP request, milliseconds)
    ACQUIRE ──► UPLOAD ──► PARSE ──► ENQUEUE
    admin downloads CSV    archive raw      papaparse +        insert one cv_violations row per
    from Accela            to Supabase +    header-validate    complaint with processing_status
                           cv_uploads row                      = 'pending'  (dedup by record_number)
                                                               ── returns immediately ──

  PHASE 2 — CONSUMER (async cron, every few minutes, a batch at a time)
    FETCH pending ──► MATCH ──► RESOLVE OWNER ──► DIFF ──► NOTIFY ──► MARK STATUS
    pull N 'pending'   §4.3      §4.4              §4.5    §4.6 gate    pending → processing →
    rows, mark                                                          matched/no_match/awaiting_review
    'processing'                                                        /complete/failed
```

| Stage | Phase | V1 implementation |
|---|---|---|
| **ACQUIRE** | — | Manual: admin downloads the CSV from Accela (out of app). *(Scraper replaces this — §8.1.)* |
| **UPLOAD** | 1 (sync) | Admin uploads via the admin panel; archive the raw file to Supabase Storage, open a `cv_uploads` audit row. |
| **PARSE** | 1 (sync) | `parseCsv(buffer)` → normalized rows; **validate the header** and fail the upload on mismatch (never enqueue garbage). |
| **ENQUEUE** | 1 (sync) | Upsert one `cv_violations` row per complaint with `processing_status = 'pending'` (dedup by `record_number`, §4.5). **Return the `cv_uploads` id immediately.** |
| **FETCH** | 2 (cron) | Consumer pulls a batch of `pending` rows, marks them `processing` (stale-lock recovery like `resetStaleProcessing`, §5.3). |
| **MATCH** | 2 (cron) | `matchAddress(row)` → a `properties.id`, `unmatched`, or `ambiguous` (§4.3). |
| **RESOLVE OWNER** | 2 (cron) | `resolveOwner(propertyId)` → current owning `companyId` (or individual/unlinked) (§4.4). |
| **DIFF** | 2 (cron) | secondary `##TMP→CE` dedup before notifying (§4.5); write the `cv_matches` row. |
| **NOTIFY** | 2 (cron) | Owner company with members → email each member via `sendPlainEmail`; record `cv_notifications_sent`. **Gated by the review step (§4.6).** |
| **MARK STATUS** | 2 (cron) | Set the row's terminal `processing_status` (§6); update `cv_uploads` counters. |

**Notify scope (decided):** **every matched new violation** notifies — no Record-Type / Status
allowlist in V1. If a matched property's current owner is a company we have a user for, that user gets
emailed regardless of complaint type. (A type/severity allowlist is a possible later refinement, not V1.)

### 4.1 Same queue, two thin producers
The queue cleanly separates **producers** (what puts complaints on the queue) from the **one consumer**
(what processes them). V1 has one producer — the manual upload (PARSE+ENQUEUE). §8.1's scraper becomes
a **second producer** that enqueues the same `cv_violations` `pending` rows and changes nothing
downstream; the consumer doesn't know or care which producer enqueued a row. The match/owner/diff/notify
**process functions live in `server/jobs/code-violations/processes/`** (mirroring `data_v2/processes/`)
and are pure where possible so they're trivially testable.

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
3. Collapse repeated whitespace to single spaces; trim; drop a trailing `UNITED STATES`/`USA`.
4. **Standardize the street suffix and directionals** via `formatAddress` / `STREET_TYPE_ABBREVIATIONS`
   (`shared/utils/formatAddress.ts`).

**Expand the normalizer coverage (decided — go broad, not minimal).** The existing util has gaps
beyond `Av`, and real data will keep surfacing more. Audit `STREET_TYPE_ABBREVIATIONS` and extend it to
collapse every common variant to a single canonical token, both directions (e.g. `AV`/`AV.`/`AVE`/
`AVE.`/`AVENUE` → one form). At minimum cover:
- **Suffixes:** AVE/AV/AVENUE, ST/STREET, RD/ROAD, DR/DRIVE, BLVD/BOULEVARD, LN/LANE, CT/COURT,
  PL/PLACE, WAY, TER/TERRACE, CIR/CIRCLE, PKWY/PARKWAY, HWY/HIGHWAY, TRL/TRAIL, SQ/SQUARE,
  LOOP, ROW, PATH, PASS, WALK, PT/POINT, MNR/MANOR, PLZ/PLAZA, XING/CROSSING.
- **Directionals:** N/S/E/W/NE/NW/SE/SW ↔ NORTH/SOUTH/EAST/WEST/… (both pre- and post-direction).
- **Unit noise:** strip/normalize `#`, `APT`, `UNIT`, `STE`/`SUITE` so unit differences don't block a
  street match (the CSV rarely includes units; our `addresses` may).
- **Numeric/ordinal streets:** `1ST`/`FIRST`, `2ND`/`SECOND`, … so `43RD ST` ≡ `43RD STREET`.

Centralize this in **one shared normalizer** so the same canonicalization runs on both sides and the
list is a single place to extend as misses appear. This is the main supporting code change the feature
adds; treat broad coverage here as part of V1 quality, not a follow-up.

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
**Reuse the Data app's existing transaction-resolution logic** (`properties.services.ts` /
`propertyTransactions.services.ts`) rather than reinventing it — it already encodes the
arms-length/assignment/assignor handling. The ordering is trustworthy: the **consumer sorts each
property's transactions correctly at ingest** and writes `property_transactions.sortOrder`, so reading
ordered by `sortOrder` ASC (most recent first) is reliable.

Given a matched `propertyId`: take the most recent **arms-length** transaction's `buyerId`:
- `buyerId` present → that `companyId` is the current owner. Proceed to NOTIFY if it has **`company_members`** (§2 warning: members, not contacts).
- `buyerId` null (only `buyerName`) → **individual / unlinked owner** → store the match with `owner_company_id = null`, **no email**. (Individuals aren't our market, but we still record the violation so the property's history accrues.)
- Company present but **no `company_members`** → store, **no email** (nobody to tell yet).

> The point of storing every match regardless of notifiability: the `cv_` tables become a complete
> code-violation ledger across **all** our properties — we stack up the full complaint history per
> property even when there's currently no one to email.

### 4.5 Idempotency & dedup (critical)
Daily uploads overlap heavily, so **never notify twice for the same complaint.**
- `cv_violations.record_number` is **UNIQUE**. ENQUEUE upserts on it: a **brand-new** `record_number` inserts with `processing_status = 'pending'`; an **already-seen** one does `ON CONFLICT DO UPDATE` for `status_text`/`description` (a complaint's Accela status can change `New → Closed`) but **does NOT reset `processing_status`** — so a complaint already processed is never re-queued or re-notified. This makes overlapping daily uploads naturally idempotent.
- `cv_notifications_sent` has **UNIQUE(`violation_id`, `user_id`, `channel`)** — a hard backstop against double-emailing even if the queue logic is bypassed.
- **`##TMP` → `CE` edge:** Accela sometimes issues a temporary `##TMP-*` record number that is later
  replaced by a permanent `CE-*` number — the *same physical complaint under two record numbers*,
  which would dodge the `record_number` dedup and double-alert. V1 mitigation: a **secondary dedup**
  on `(normalized_address + violation_date + hash(description))` before notifying, so a TMP→CE swap is
  caught. Log when it triggers so we can measure how often it happens.

---

### 4.6 Review gate / dry-run (decided)
For the **initial rollout, notifications do not auto-fire** — a wrong address match emailing the wrong
investor is worse than a slight delay. The review gate is just a **state in the consumer's status
machine**, not a separate code path:

- With `CV_REQUIRE_REVIEW` **on** (default): the consumer runs MATCH→RESOLVE→DIFF, writes `cv_matches`,
  and parks each matched complaint at `processing_status = 'awaiting_review'` **without emailing**. The
  admin panel shows the dry-run: every match, the resolved owner company, exactly **which users would
  be emailed**, plus the unmatched/ambiguous rows.
- The admin clicks **Approve** for an upload (`POST /api/code-violations/uploads/:id/approve`) → a
  notify pass runs NOTIFY for that upload's `awaiting_review` rows → each becomes `complete`. The
  `cv_uploads.status` advances `review → completed`.
- With `CV_REQUIRE_REVIEW` **off**: the consumer runs NOTIFY inline and rows go straight
  `processing → complete` (no `awaiting_review` stop). "Dry-run first, then auto" is a single flag flip.

> Because the gate is a status, the per-complaint queue and the review step are the *same* mechanism —
> no extra machinery.

---

## 5. Architecture & code layout

### 5.1 Files (new) — HTTP side in `services/`, processing in `jobs/` (mirrors `data_v2`)
The split follows the existing convention: the **cron consumer + per-step process functions live under
`server/jobs/`** (exactly like `server/jobs/data_v2/`), while `server/services/` holds only the
HTTP-facing work — the ingest endpoint and the admin read queries.
```
database/
  schemas/code-violations.schema.ts        # cv_uploads, cv_violations (incl. processing_status), cv_matches, cv_notifications_sent
  validation/code-violations.validation.ts # Zod: parsed-row schema, upload request schema
  types/code-violations.d.ts               # derived types ($inferSelect)

server/
  routes/code-violations.routes.ts         # admin-only: upload, list uploads/violations, approve
  controllers/code-violations/code-violations.controllers.ts
  services/code-violations/
    code-violations.services.ts            # HTTP side: ingest (archive + parse + ENQUEUE), list, approve→trigger notify pass
                                           #   parse helper + the shared address normalizer it calls

  jobs/code-violations/                    # ── processing, mirroring server/jobs/data_v2/ ──
    consumer.ts                            # cron entry: fetch a 'pending' batch → process each → mark status
    processes/
      fetch-queue.ts                       # pull N 'pending' cv_violations rows; resetStaleProcessing
      mark-status.ts                       # markProcessing/markComplete/markFailed/markAwaitingReview/resetStale
      match-address.ts                     # normalize + match to a property         (pure-ish)
      resolve-owner.ts                     # most-recent arms-length buyer company    (reuses Data app logic)
      diff-and-store.ts                    # ##TMP→CE secondary dedup; write cv_matches
      notify.ts                            # resolve company_members → sendPlainEmail → cv_notifications_sent

  jobs/index.ts                            # register the CV consumer cron (every few minutes) — EDIT existing file

client/
  components/admin/CodeViolationsTab.tsx     # new admin tab (upload + per-complaint status + dry-run review)
  api/code-violations.api.ts                 # typed fetch wrapper
```

The **shared address normalizer** (§4.3) is extended in `shared/utils/formatAddress.ts` (the existing
`STREET_TYPE_ABBREVIATIONS` home) so both ENQUEUE-time storage and MATCH-time comparison use one
canonicalization.

### 5.2 The producer seam
ENQUEUE is the seam: `enqueueComplaints({ rows, uploadId, source })` upserts `cv_violations` rows as
`pending`. **V1's manual upload is the only producer.** §8.1's scraper becomes a second producer that
calls the same enqueue with `source: 'scraper'` and changes nothing about the consumer — the "same
queue, two producers" rule (§4.1) made concrete. `cv_uploads.source` (`'manual' | 'scraper'`) records
which producer a given batch came from.

### 5.3 Consumer mechanics (copy `data_v2`'s proven bits)
- **Registration:** a `node-cron` entry in `server/jobs/index.ts` runs `runCodeViolationConsumer()`
  every few minutes (`CV_CONSUMER_CRON`), gated on `NODE_ENV === 'production'` like the other jobs.
- **Batching:** each run processes up to `CV_BATCH_SIZE` `pending` rows, then exits — small, frequent
  passes rather than one long job (§4 Phase 2).
- **Soft lock + recovery:** mark rows `processing` before work so overlapping runs don't double-process;
  reset rows stuck in `processing` past a timeout back to `pending` (the `resetStaleProcessing(60)`
  pattern from `data_v2/consumer.ts`).
- **Failure policy:** a row that errors is marked `failed` with the message and **left for admin review
  — no automatic retry** (mirrors `data_v2`: "failed rows stay in the queue"). A capped auto-retry is a
  possible later refinement (§10).
- **Per-complaint isolation:** one bad complaint marks only that row `failed` and the batch continues
  (mirrors `data_v2`'s per-batch try/catch).

---

## 6. Data model (new `cv_` tables)

All additive; apply via targeted migration (§4.2). `cv_violations` is the system of record (every
parsed complaint, property-agnostic) **and the work queue** — its `processing_status` column is what
the consumer reads (`pending` rows = the work list). `cv_matches` records the property/owner resolution
only when we can make it — this cleanly supports V2 backfill (an unmatched violation already exists;
when its property is later added we just insert a `cv_matches` row and notify).

> **Why one table, not a separate `cv_*_queue` (vs. `market_scan_queue`):** the scan queue is separate
> from `properties` because its input shape (raw SFR scan rows) differs from its output (properties).
> Here a *complaint* and the *stored violation* are the **same entity**, so a `processing_status`
> column on `cv_violations` is the cleaner queue — no duplicate table, dedup-by-`record_number` doubles
> as queue idempotency. We still mirror `data_v2`'s **job structure** (consumer + `processes/` + cron),
> just over one table.

**`cv_uploads`** — one row per ingest run (audit + admin results panel)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `source` | text | `'manual'` (default) \| `'scraper'` — included from V1 so §8.1 needs no migration |
| `uploaded_by` | uuid FK users | nullable (null for scraper) |
| `file_name` | text | |
| `raw_ref` | text | Supabase Storage path of the archived CSV |
| `status` | text | upload-level: `'enqueued'` \| `'processing'` (consumer working its rows) \| `'review'` (dry-run awaiting approval, §4.6) \| `'completed'` \| `'failed'` |
| `rows_total` / `rows_matched` / `rows_unmatched` / `violations_new` / `notifications_sent` | int | result counters (updated as the consumer drains the batch) |
| `error_message` | text | nullable |
| `created_at` / `finished_at` | timestamp | |

**`cv_violations`** — every distinct complaint we've ever parsed **+ the work queue** (`processing_status`)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `record_number` | text | **UNIQUE NOT NULL** — idempotency key (§4.5) |
| `record_type` / `application_name` / `status_text` / `description` | text | from CSV (`status_text` = Accela's status, e.g. `New` — distinct from `processing_status`) |
| `violation_date` | date | parsed from `Date` |
| `raw_address` | text NOT NULL | original CSV address |
| `normalized_address` | text | for matching + TMP→CE secondary dedup |
| **`processing_status`** | text | **the queue state:** `'pending'` → `'processing'` → `'awaiting_review'` (§4.6) / `'no_match'` / `'ambiguous'` / `'complete'` / `'failed'`. Index `(processing_status, created_at)` so the consumer fetch is cheap |
| `processing_error` | text | nullable — message when `failed` |
| `first_seen_upload_id` | uuid FK `cv_uploads` | the upload that enqueued it (review approval is per-upload) |
| `processed_at` | timestamp | when it reached a terminal status |
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
- Add the four `cv_` tables in `database/schemas/code-violations.schema.ts` (incl. `cv_violations.processing_status` — the queue column — and its `(processing_status, created_at)` index); derive types in `database/types/`.
- Write the **targeted ALTER/SQL** migration (§4.2). Do **not** `db:push`.
- Zod: a parsed-row schema + the upload request schema in `database/validation/code-violations.validation.ts`.

### Chunk B — Ingest endpoint (Phase 1: archive + parse + ENQUEUE, returns fast)
- Route `POST /api/code-violations/uploads` guarded by **`requireRole(ADMIN_ROLES)`** (admin + owner only — *not* `PRIVILEGED_ROLES`, so relationship-managers/members are excluded).
- multer **memoryStorage**, `fileFilter` to `text/csv` / `application/vnd.ms-excel`, `limits.fileSize` ≈ **1–2 MB** (the Accela export is capped around ~500 KB and typically ~480 KB). Use the `MulterRequest` type (`server/middleware/multerTypes.ts`).
- `code-violations.services.ts → ingestCodeViolationCsv(...)`: archive buffer to Supabase Storage (new bucket env `SUPABASE_CODE_VIOLATION_STORAGE_BUCKET`, names only) → create `cv_uploads` row (`status='enqueued'`) → **papaparse** (`header: true`, drop the `""` column, validate header, coerce `Date`) → **ENQUEUE** one `cv_violations` row per complaint as `pending` (dedup by `record_number`, §4.5). **Return the `cv_uploads` id immediately — no matching or emailing in the request.** Fail the upload + `cv_uploads.status='failed'` on header mismatch.
- Also `GET /api/code-violations/uploads` and `GET /api/code-violations/uploads/:id` (admin) to back the panel, and `POST /api/code-violations/uploads/:id/approve` (admin) to run the notify pass for an upload's `awaiting_review` rows (§4.6).
- Run the new-route ceremony via the **`/new-route`** skill so `api.md` / `access-control.md` / tests are scaffolded together.

### Chunk C — Consumer job (Phase 2: the cron processor — the "background job")
- `server/jobs/code-violations/consumer.ts` + `processes/`, **mirroring `server/jobs/data_v2/`**. Register a `node-cron` entry in `server/jobs/index.ts` (`CV_CONSUMER_CRON`, prod-gated) and apply the §5.3 mechanics (batch size, soft-lock, `resetStaleProcessing`, per-row try/catch, no auto-retry).
- `fetch-queue.ts` + `mark-status.ts`: pull a `CV_BATCH_SIZE` batch of `pending` rows → mark `processing`; status transitions + stale reset.
- `match-address.ts`: implement §4.3 — the **uppercase + strip `.`/`,` + suffix/directional-normalize** scheme applied to both sides; exact street number+name, city/state when present, zip optional. Return `matched | unmatched | ambiguous`. **Supporting change:** extend `STREET_TYPE_ABBREVIATIONS` broadly (§4.3) in `shared/utils/formatAddress.ts` (incl. `AV`/`AV.`). Unmatched → `processing_status='no_match'`; ambiguous → `'ambiguous'`.
- `resolve-owner.ts`: implement §4.4, reusing the Data app's transaction-resolution logic (`property_transactions` by `sortOrder` ASC).
- `diff-and-store.ts`: TMP→CE secondary dedup (§4.5); insert the `cv_matches` row. Route each row to `awaiting_review` (gate on) or straight to NOTIFY (gate off).

### Chunk D — Notify (email), as a consumer step + approve-triggered pass
- `notify.ts`: for a matched violation whose owner company has **`company_members`** (§2 warning: members, not contacts): resolve members → emails via `getCompanyMembers` + `users.email`; send with **`sendPlainEmail`** (raw HTML; no template in V1) from `server/services/postmark/email.services.ts`. Respect the master `users.notifications` kill-switch (reuse `getEmailRecipientsByUserIds`).
- Write `cv_notifications_sent` rows (idempotent UNIQUE) and set `processing_status='complete'`. Update `cv_uploads` counters. Per-recipient fire-and-forget with logged failures (mirror existing email jobs).
- Two entry points, **same function:** the consumer calls it inline when `CV_REQUIRE_REVIEW` is off; the **approve** endpoint (Chunk B) calls it for an upload's `awaiting_review` rows when review is on (§4.6).

### Chunk E — Admin UI (upload + per-complaint status + dry-run review)
- New `CodeViolationsTab.tsx` in `client/src/components/admin/`, added to `Admin.tsx` Radix `Tabs`, gated on `isOwner || isAdmin`.
- File input → `FormData` → `POST /api/code-violations/uploads` (TanStack Query mutation, `credentials: 'include'`) → returns immediately; the panel then **polls** `GET /api/code-violations/uploads/:id` as the consumer drains the batch (per-complaint statuses + counters visible).
- **Dry-run review (§4.6):** when an upload is in `review`, show its matched violations with resolved owner company and **the exact recipients who would be emailed**, plus unmatched/ambiguous/failed rows; an **Approve & Notify** button hits the approve endpoint. Follow design-guidelines tokens.

### Chunk F — Tests & docs
- Integration tests for the upload + approve routes (auth matrix: admin/owner allowed; RM/member/anon rejected). Unit tests for the pure pieces: CSV parse, address normalizer + `matchAddress`, `resolveOwner`, the TMP→CE dedup (use `temp.csv` quirks as fixtures). A consumer test that drives `pending → complete`/`no_match`/`awaiting_review`. See `.claude/docs/standards/testing.md` / `/test`.
- Run the **Agent Updater** so `api.md`, `access-control.md`, `database.md`, and `apps.md` reflect the new route, tables, consumer job, and admin tab.

---

## 8. Future iterations (V2+) — DO NOT build in V1

### 8.1 Automate acquisition — scrape Accela
Replace the manual ACQUIRE step with a headless-browser worker (Playwright) that downloads the same CSV
and becomes a **second producer on the same queue** (§5.2) — it parses + ENQUEUEs `cv_violations`
`pending` rows with `source='scraper'`, and the **existing consumer processes them unchanged**.
**Already fully designed** in [`code-violation-scraper.md`](code-violation-scraper.md) (dedicated cloud
worker, politeness, circuit breaker, `cv_scrape_runs` telemetry). Depends on this MVP (queue + consumer)
shipping first. *(Note: only the **scraper** needs headless Chrome — the V1 consumer is plain DB work,
no browser.)*

### 8.2 Internal (in-app / bell) notifications
Add a second notification channel alongside email:
- Add `'code_violation'` to `notification_type` (`database/schemas/mastermind.schema.ts`).
- A `createCodeViolationNotification(...)` in `notifications.services.ts` → insert `notifications` row → `broadcastToUser` over the WebSocket (same path as mentions/deal bids).
- Record `cv_notifications_sent` with `channel = 'in_app'`.
- Build the **user-facing Code Violations UI** (none in V1): surface violations on the property detail panel and/or a dashboard, and add a code-violations toggle to `user_notification_preferences`.

### 8.3 Ingest properties we don't have yet
An unmatched complaint is still **stored** in `cv_violations` (the ledger is property-agnostic, §6) —
it just has no `cv_matches` row, so nobody is notified. V2: when MATCH returns "unmatched," enqueue the
bare address into `market_scan_queue` so the data pipeline ingests the property, then **retry the
match** until the property exists and backfill the `cv_matches` row + notify. This needs a durable
retry mechanism — a **message queue (e.g. SQS)** — rather than naive re-polling, because the property
may take time to appear. Goal: grow coverage and convert today's unmatched violations into notifiable
ones. (Because the violation already lives in `cv_violations`, no data is lost in the meantime.)

### 8.4 Polished email template
V1 sends simple inline HTML via `sendPlainEmail`. V2: a Postmark template
(`POSTMARK_CODE_VIOLATION_TEMPLATE_ALIAS`) and `sendTemplateToUsers`, consistent with deal/property emails.

### 8.5 V3 — move processing to AWS (DB queue → SQS)
The V1 DB queue is deliberately the **pre-SQS shape**, so the V3 migration is a transport swap, not a
redesign:
- Each `cv_violations` `pending` row becomes an **SQS message**; the cron consumer becomes an **SQS
  consumer** (Lambda or a worker) processing one complaint per message with native retry/dead-letter.
- The scraper (§8.1) and the manual upload both **produce SQS messages** instead of (or in addition to)
  DB rows. The `process functions` (match/owner/diff/notify) move with the worker essentially as-is.
- This is the moment the **scraper's isolated cloud compute** and the **processing** consolidate on AWS
  in one coherent migration — which is why V3, not earlier. Keeping each complaint's processing
  **idempotent and self-contained** in V1 (keyed on `record_number`) is the one discipline that makes
  this swap cheap.

---

## 9. Tools, dependencies & env vars

**Already installed — no new packages for V1:** `multer` (upload), `papaparse` (+ `@types/papaparse`)
(CSV parse), `@supabase/supabase-js` (raw-file archive), `postmark` (email), `node-cron` (consumer
schedule — same as `data_v2`), Drizzle, TanStack Query, Radix Tabs.

**New env vars (NAMES ONLY — per ARV.SECRET-ACCESS; never read/print values):**
| Name | Purpose | When |
|---|---|---|
| `SUPABASE_CODE_VIOLATION_STORAGE_BUCKET` | bucket for archived raw CSVs (public, allow `text/csv`) | V1 |
| `CV_REQUIRE_REVIEW` | when on (default), matched rows hold at `awaiting_review` until an admin approves before emails fire (§4.6) | V1 |
| `CV_CONSUMER_CRON` | consumer schedule (e.g. every few minutes) — like the `data_v2` cron entries | V1 |
| `CV_BATCH_SIZE` | max `pending` complaints processed per consumer run (§5.3) | V1 |
| `POSTMARK_CODE_VIOLATION_TEMPLATE_ALIAS` | Postmark template for the violation email | V2 (§8.4) |

Reuses existing `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `POSTMARK_SERVER_API_KEY`,
`DEFAULT_FROM_EMAIL`.

---

## 10. Open questions / risks

**Decided (rolled into the plan):**
- **Review before notify** → **yes** for rollout: dry-run + admin Approve, gated by `CV_REQUIRE_REVIEW` (§4.6).
- **Notify scope** → **every matched new violation** (no type/status allowlist) (§4 NOTIFY note).
- **Match strictness** → normalize both sides (uppercase, strip `.`/`,`, suffix-normalize), exact street number+name, city/state when present, zip optional, country ignored (§4.3).
- **Normalizer coverage** → **expand broadly** now (full suffix + directional + unit + ordinal map in one shared normalizer), not a minimal `Av` patch (§4.3).
- **Owner resolution** → **reuse the Data app's existing transaction-resolution logic**; `sortOrder` is reliable (consumer sets it at ingest) (§4.4).
- **Recipients source** → **`company_members` only**, never `company_contacts` (§2 warning).
- **Processing model** → **decoupled DB queue + cron consumer in V1** (`cv_violations.processing_status` is the queue; processing in `server/jobs/code-violations/`, mirroring `data_v2`). Upload returns instantly; the consumer drains a batch every few minutes (§4, §5.3).
- **Where the logic lives** → **processing in `jobs/`** (consumer + `processes/`), **HTTP reads/ingest in `services/`** — matching the `data_v2` vs `properties.services.ts` split.
- **Upload size** → small and stable (~480 KB typical, ~500 KB export cap); 1–2 MB multer limit. Parsing/enqueue is trivially fast in-request; matching/notify is the consumer's job.

**Still open / risks:**
- **Normalizer long tail.** Even with broad coverage, real data will surface more variants — the unmatched/ambiguous admin lists are how we find and fix them. Budget for ongoing tuning.
- **`##TMP → CE` frequency** (§4.5) — unknown until we see real data; the secondary dedup logs occurrences so we can measure and revisit later.
- **Ambiguous matches.** Same street number+name in the same city (apartment complexes, re-used names) → goes to the admin review list rather than a guess; volume unknown until real data.
- **Failure retry policy.** V1 mirrors `data_v2` (failed rows stay `failed`, surfaced for admin review, **no auto-retry**). If transient DB/email errors prove common, add a capped auto-retry (attempt counter on the row) — a small refinement, not V1.
- **Consumer cadence / batch size.** Start conservative (`CV_CONSUMER_CRON` every few minutes, modest `CV_BATCH_SIZE`); tune once we see real volume and per-complaint cost.
- **Individual owners we *do* have a user for.** V1 only notifies via the company link. If a user is associated with a property some other way in future, that path doesn't exist yet.

---

### Sources
- Live target: Accela ACA — San Diego Code Enforcement General Search (`module=CE`), "Download results" export.
- Example export: `temp.csv` (repo root) — defines the §3.2 CSV shape and real-data quirks.
- Companion: [`code-violation-scraper.md`](code-violation-scraper.md) — automates §8.1.
