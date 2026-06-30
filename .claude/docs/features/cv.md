# Code Violations — Feature Reference

> **Audience:** an engineer who needs to change, debug, or extend this feature. This documents
> **what shipped** (V1), where each piece lives, and how the moving parts connect. For the original
> design rationale and the V2+ roadmap, see [.claude/plans/code-violation.md](.claude/plans/code-violation.md)
> (the scraper companion is [.claude/plans/code-violation-scraper.md](.claude/plans/code-violation-scraper.md)).
> Where this doc and the plan disagree, **this doc reflects the actual code** and wins.

---

## 1. What it is

San Diego publishes code-enforcement complaints on a public **Accela** portal and lets you export
recent complaints as a CSV. This feature lets an **admin/owner upload that CSV** in the admin panel,
and the app then:

1. parses + archives the CSV and **enqueues** each complaint,
2. **matches** each complaint's address to a property we already track,
3. resolves the property's **current owning company** from transaction data,
4. checks whether any of **our users belong to that company**, and
5. **emails those users** that a property tied to their company has a new code complaint.

Every complaint that resolves to a property we track is **stored** (notifiable or not), so the `cv_`
tables become a complete code-violation ledger keyed to our properties.

**The value prop is speed-to-alert:** be the first to tell an investor "the city just opened a
complaint on one of your properties." A daily manual upload is fast enough for V1 — **no scraping, no
external API calls.**

**By default, nothing emails automatically.** Matched complaints park at `awaiting_review` and an
admin must click **Approve & Notify** before any email fires (the `CV_REQUIRE_REVIEW` gate, §6).

---

## 2. The core relationship chain

The feature is a join across four things already modeled. Understanding the chain is the design:

```
  complaint address ──match──► properties (+ addresses 1:1)
                                   │
                                   ├─ most-recent arms-length tx (property_transactions)
                                   │        └─ buyerId ──► companies            (current owner)
                                   │                          │
                                   │                          └─ company_members ──► users (emails)
                                   └─ if no matching property, or owner is an individual,
                                      or the company has no member  →  store, don't notify
```

| Step | Where | Notes |
|---|---|---|
| Property + address | [database/schemas/properties.schema.ts](database/schemas/properties.schema.ts) — `properties` (uuid PK) + 1:1 `addresses` | match on the normalized `addresses.formatted_street_address` + `city`/`state` (+ `zip` tiebreak) |
| Current owner | `property_transactions`, re-sorted by recording date | the **buyer** of the most-recent arms-length tx is the current owner |
| Owner identity | `companies` (uuid PK) | linked via `property_transactions.buyerId`; only `buyerName` (no FK) → **individual/unlinked**, don't notify |
| User association | `company_members` (`userId`, `companyId`, `role`, `isPrimary`) | a company can have multiple members → notify them all |
| User email | `users.email` | filtered by the master notifications kill-switch before sending |

> ⚠️ **Notify only through `company_members`, never `company_contacts`.** `company_members` is the
> roster of *actual platform users* tied to a company (real, deliverable emails). `company_contacts`
> is the public OpenCorporates display roster — usually not platform users, email often absent. The
> entire notify path ([resolve-owner.ts](server/jobs/code-violations/processes/resolve-owner.ts),
> [notify.ts](server/jobs/code-violations/processes/notify.ts)) joins `company_members` only.

There is **no `entity_type` column.** The only "notifiable" gate is: *did the most-recent arms-length
transaction resolve to a `companies` FK (`buyerId`) that has ≥1 `company_members` row.*

---

## 3. Architecture at a glance

The pipeline is **decoupled into two phases connected by a DB queue**, mirroring the `data_v2`
(`market_scan_queue` + consumer) pattern. The upload request does almost nothing and returns
instantly; all the heavy per-complaint work happens later in a cron consumer.

```
  PHASE 1 — INGEST  (synchronous, inside the HTTP request, milliseconds)
    UPLOAD ──► PARSE ──► ENQUEUE
    archive raw CSV   papaparse +     upsert one cv_violations row per complaint
    to Supabase +     header-         as processing_status = 'pending'
    cv_uploads row    validate        (dedup by record_number) ── returns immediately ──

  PHASE 2 — CONSUMER  (cron every ~5 min in prod, a batch at a time)
    CLAIM ──► MATCH ──► RESOLVE OWNER ──► DIFF/STORE ──► (REVIEW gate) ──► NOTIFY ──► MARK STATUS
    pending→  address   most-recent       write          hold at         email each   set terminal
    processing  → prop  arms-length buyer  cv_matches +   awaiting_review  member +     status +
    (SKIP LOCKED)       company            TMP→CE dedup   OR notify inline cv_notif…    refresh upload
```

`cv_violations` is **both the system of record and the work queue** — its `processing_status` column
is what the consumer reads (`pending` rows = the work list). There is no separate `*_queue` table
(unlike `market_scan_queue`) because a complaint and its stored violation are the same entity, so a
status column is the cleaner queue and dedup-by-`record_number` doubles as queue idempotency.

### The producer seam
**ENQUEUE is the seam.** V1 has one producer — the manual admin upload. The future scraper (plan
§8.1) becomes a second producer that enqueues the same `pending` rows with `source = 'scraper'` and
changes nothing downstream; the consumer doesn't know or care who enqueued a row. `cv_uploads.source`
(`'manual' | 'scraper'`) records which producer a batch came from.

---

## 4. File map

HTTP-facing work lives in `services/`; per-step processing lives in `jobs/` — the same split as
`properties.services.ts` vs `server/jobs/data_v2/`.

```
database/
  schemas/code-violations.schema.ts            cv_uploads, cv_violations, cv_matches, cv_notifications_sent
  drizzle/0007_code_violations.sql             the additive ALTER migration (apply directly; NOT db:push)
  inserts/code-violations.insert.ts            drizzle-zod insert schemas
  validation/code-violations.validation.ts     status/source value-sets + parsed-row + upload-request Zod
  types/code-violations.ts                     derived $inferSelect + z.infer types + status unions

server/
  routes/code-violations.routes.ts             admin-only routes + multer config; mounted at /api/code-violations
  controllers/code-violations/                 HTTP layer (parse req → service → res)
  services/code-violations/
    code-violations.services.ts                INGEST (archive+parse+enqueue), list, detail, approve
  jobs/code-violations/
    consumer.ts                                cron entry: claim a batch → process each → mark status
    processes/
      fetch-queue.ts                           atomic claim of pending rows (FOR UPDATE SKIP LOCKED)
      mark-status.ts                           status transitions, stale reset, upload roll-up
      match-address.ts                         parse + normalize + match to a property (pure-ish, batched)
      resolve-owner.ts                         most-recent arms-length buyer company + members
      diff-and-store.ts                        write cv_matches; ##TMP→CE secondary dedup
      notify.ts                                resolve members → sendPlainEmail → cv_notifications_sent
  jobs/index.ts                                registers the CV consumer cron (prod-gated)
  lib/supabase.ts                              codeViolations bucket constant (code-violations-dev/-prod)

shared/
  utils/formatAddress.ts                       normalizeAddressForMatch + cleanAddressString (the matcher)
  constants/street-types.ts                    suffix / directional / ordinal / unit-designator maps
  types/code-violations.ts                     wire contracts (re-exports the status unions)

client/
  pages/Admin.tsx                              "Code Violations" Radix tab (gated isOwner||isAdmin)
  components/admin/CodeViolationsTab.tsx        upload + history table (polls while in-flight)
  components/admin/CodeViolationUploadDetail.tsx dry-run review dialog + Approve & Notify
  api/code-violations.api.ts                   typed fetch wrappers
  constants/codeViolations.constants.ts        status→badge maps + isUploadInFlight()

scripts/
  cv-test-generate.ts                          dev: build a self-checking test CSV from real DB data
  cv-run-consumer.ts                           dev: drain the queue locally (cron is prod-gated)
```

---

## 5. Data model (`cv_` tables)

All additive. Defined in [database/schemas/code-violations.schema.ts](database/schemas/code-violations.schema.ts);
applied via the hand-written [database/drizzle/0007_code_violations.sql](database/drizzle/0007_code_violations.sql).

> **Migration rule: do NOT `npm run db:push`.** push currently wants to truncate `market_scan_queue`
> (known unrelated drift). The migration is hand-written, every object uses `IF NOT EXISTS` (safe to
> re-run), and FKs/uniques are inlined. Apply it directly.

**Status columns are plain `text`, not `pgEnum`** — the value sets are expected to grow and we don't
want a migration per addition. Allowed values are enforced at the edges by the Zod value-sets in
[code-violations.validation.ts](database/validation/code-violations.validation.ts), which are the
single source of truth (re-exported by the DB types and the shared wire types).

### `cv_uploads` — one row per ingest run (audit + admin panel source)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `source` | text | `'manual'` (default) \| `'scraper'` |
| `uploaded_by` | uuid FK users (set null) | null for scraper |
| `file_name` | text | |
| `raw_ref` | text | Supabase Storage path of the archived CSV |
| `status` | text | `'enqueued'` \| `'processing'` \| `'review'` \| `'completed'` \| `'failed'` |
| `rows_total` / `rows_matched` / `rows_unmatched` / `violations_new` / `notifications_sent` | int | counters (derived/refreshed as the consumer drains) |
| `error_message` | text | nullable |
| `created_at` / `finished_at` | timestamptz | |

### `cv_violations` — every distinct complaint **+ the work queue**
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `record_number` | text **UNIQUE NOT NULL** | the idempotency key (§7) |
| `record_type` / `application_name` / `status_text` / `description` | text | from CSV (`status_text` = Accela's status, e.g. `New` — distinct from `processing_status`) |
| `violation_date` | date | parsed from the `Date` column |
| `raw_address` | text NOT NULL | original CSV address |
| `normalized_address` | text | canonical street key; set by the consumer at MATCH time (null at enqueue) |
| `processing_status` | text | **the queue state** (§6.1). Index `(processing_status, created_at)` powers the consumer fetch |
| `notified` | boolean | hard "an email actually fired" flag, independent of `processing_status` |
| `error_message` | text | reason when `failed` |
| `first_seen_upload_id` | uuid FK cv_uploads (set null) | the upload that enqueued it (review/approve is per-upload) |
| `processed_at` | timestamptz | when it reached a terminal status |
| `created_at` / `updated_at` | timestamptz | `updated_at` doubles as the soft-lock age for stale recovery |

### `cv_matches` — violation ↔ property (+ owner snapshot), only when resolvable
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `violation_id` | uuid FK cv_violations (cascade) **UNIQUE** | one match per violation |
| `property_id` | uuid FK properties (cascade) | |
| `owner_company_id` | uuid FK companies (set null) | **null** when owner is individual/unlinked |
| `owner_name` | text | snapshot of `buyerName` at match time |
| `matched_at` | timestamptz | |

### `cv_notifications_sent` — delivery audit (the double-send backstop)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `violation_id` | uuid FK cv_violations (cascade) | |
| `user_id` | uuid FK users (cascade) | recipient |
| `company_id` | uuid FK companies (cascade) | the company that linked them |
| `channel` | text | `'email'` in V1 (`'in_app'` reserved for V2) |
| `sent_at` | timestamptz | |
| | | **UNIQUE(`violation_id`, `user_id`, `channel`)** — hard double-send guard |

---

## 6. The status model

Two **independent** facts per complaint: *where it is in the work* (`processing_status`) and *whether
an email went out* (`notified`). Keeping them separate makes `notified` an unambiguous confirmation.

### 6.1 `processing_status` — the work lifecycle (set by the consumer)
| Value | Meaning | Terminal? |
|---|---|---|
| `pending` | enqueued, waiting for the consumer | no |
| `processing` | the consumer is working this row | no |
| `awaiting_review` | matched + recipients identified, **email held for admin Approve** (only when the review gate is on) | no → `complete` on Approve |
| `no_match` | processed cleanly, address is not a property we track | yes |
| `ambiguous` | matched **more than one** property → needs a human | yes |
| `complete` | finished through-and-through | yes |
| `failed` | something threw; see `error_message` (no auto-retry) | yes |

### 6.2 `notified` (boolean) — read alongside the status
- `complete` + `notified=true` → matched, owner is a company with users, **email sent**.
- `complete` + `notified=false` → matched, but **nobody to email** (individual owner, member-less company, or a `##TMP→CE` duplicate already alerted).
- `awaiting_review` + `notified=false` → matched and ready, **waiting on Approve**; flips to `complete`+`notified=true` once the email fires.
- `no_match` / `ambiguous` / `failed` → `notified` stays false.

### 6.3 The review gate (`CV_REQUIRE_REVIEW`)
A wrong address match emailing the wrong investor is worse than a slight delay, so the gate is a state
in the status machine, not a separate code path:

- **Gate ON (default):** the consumer runs MATCH→RESOLVE→DIFF, writes `cv_matches`, and parks each
  matched + notifiable complaint at `awaiting_review` **without emailing**. The admin panel shows the
  dry-run: every match, resolved owner, and **exactly which users would be emailed**. The admin clicks
  **Approve & Notify** (`POST …/uploads/:id/approve`) → the held rows run NOTIFY → each becomes
  `complete`+`notified=true`, upload advances `review → completed`.
- **Gate OFF** (`CV_REQUIRE_REVIEW=false`/`0`/`off`/`no`): the consumer notifies inline; rows go
  straight `processing → complete`, no `awaiting_review` stop.

Gate parsing lives in [consumer.ts `isReviewRequired()`](server/jobs/code-violations/consumer.ts) —
**only an explicit off value flips it**; anything else (including unset) defaults ON.

---

## 7. Idempotency & dedup (the part most likely to bite you)

Daily uploads overlap heavily; the rule is **never notify twice for the same complaint.** Three layers:

1. **`record_number` UNIQUE + upsert** ([ingestCodeViolationCsv](server/services/code-violations/code-violations.services.ts)).
   A brand-new record inserts as `pending`; an already-seen one does `ON CONFLICT DO UPDATE` that
   refreshes `status_text`/`description`/`raw_address` and **nulls `normalized_address`** (so the
   consumer recomputes it) but **never resets `processing_status`** — a processed complaint is never
   re-queued or re-notified. New-row count comes from `xmax = 0` in the upsert's own `RETURNING`, so
   concurrent uploads of the same record can't both count it new. (Rows are also de-duped *within* one
   file first, because a batch upsert hitting the same `record_number` twice would error.)
2. **`##TMP → CE` secondary dedup** ([diff-and-store.ts](server/jobs/code-violations/processes/diff-and-store.ts)).
   Accela sometimes issues a temporary `##TMP-*` number later replaced by a permanent `CE-*` — the
   *same physical complaint under two record numbers*, which dodges the `record_number` UNIQUE. Before
   notifying, we look for another complaint with the **same normalized street + violation date +
   `md5(description)`** that is already `awaiting_review` or `complete`+`notified`. If found, this row
   is stored but marked `complete`+`notified=false`. Logged when it triggers. Needs both a normalized
   street and a date to be reliable — without both, the key is too weak and we don't dedup.
   - The DB check can't see a sibling **still `processing` in the same batch**, so the consumer also
     keeps an in-memory `alertedKeysThisRun` set, so a `##TMP`/`CE` pair arriving in one batch is also
     caught ([consumer.ts](server/jobs/code-violations/consumer.ts)).
3. **`cv_notifications_sent` UNIQUE(`violation_id`,`user_id`,`channel`)** — the hard backstop. NOTIFY
   **claims the row (insert `onConflictDoNothing`) before sending**; if the claim returns nothing, a
   concurrent/previous pass already has it → skip. If the send then throws, the claim is **deleted** so
   a later pass retries. This is what makes re-run / re-approve safe.

---

## 8. Address matching (`match-address.ts` + `formatAddress.ts`)

There's no geocoder, so matching is **string equality after identical normalization of both sides.**
The Accela address field is inconsistent (`3095 W CANYON Av, SAN DIEGO United States` — no state/zip;
`United States` — pure junk), so normalization does all the work.

**Parse** ([parseCsvAddress](server/jobs/code-violations/processes/match-address.ts)): split the raw
address on the **first comma** (street vs locality), then peel the locality's trailing tokens as zip
(5-digit) then state (2-letter), leaving the rest as city. Missing pieces stay `null` rather than
being guessed. A bare-junk row yields an empty street → never matches.

**Normalize** ([normalizeAddressForMatch](shared/utils/formatAddress.ts)): uppercase → strip `.` →
drop trailing `UNITED STATES`/`USA` → treat `,` as a separator → strip unit designators + their value
(`APT 4`, `STE 200`, `#5`) → reduce a leading house number to bare digits (`123B`/`123-125` → `123`)
→ **canonicalize the street body positionally**, not by mapping every token:
- a **trailing** suffix (`AVENUE`→`AVE`),
- a **trailing** post-directional + a **leading** pre-directional, but only while a name token still
  sits beside it (so `E ST`, `N ST` — where the directional *is* the whole name — are left alone, and
  pre/post directionals stay distinct: `N MAIN ST` ≠ `MAIN ST N`),
- spelled-out ordinals anywhere in the remaining name (`FIRST`→`1ST`).

The canonical maps are in [shared/constants/street-types.ts](shared/constants/street-types.ts)
(`STREET_TYPE_ABBREVIATIONS`, `DIRECTIONAL_ABBREVIATIONS`, `ORDINAL_WORDS`, `UNIT_DESIGNATORS`).
`normalizeAddressForMatch` is run **identically on both sides** — never assume the stored address is
already clean. Notable gotchas baked into the maps: `PLZ`→Plaza (not Place), and `FL` (floor) is only
dropped when followed by a unit value, so a trailing state `FL` survives.

**Match key** ([matchParsedAddress](server/jobs/code-violations/processes/match-address.ts)): the
normalized street (number + name + suffix) must be **exactly equal**; **city and state must match
when the CSV carries them**; **zip is a tiebreaker only** (used only to break a multi-property tie).
Outcomes: exactly one property → `matched`; >1 → `ambiguous` (never guess); 0 / unparseable →
`unmatched` → `no_match`.

**Batched, N+1-free** ([matchViolationBatch](server/jobs/code-violations/processes/match-address.ts)):
parse the whole batch, collect distinct street numbers, load all candidate `addresses` in **one
query** (prefiltered by `street_number`), normalize each stored address **once**, then match each
complaint against the candidates sharing its number.

---

## 9. Owner resolution (`resolve-owner.ts`) — ⚠️ deviation from the plan

> **Important:** the plan said to trust `property_transactions.sort_order`. The implementation
> **deliberately does NOT.** It re-sorts with `sortTransactionsDesc` (recording-date DESC with
> same-day ownership-chain reconstruction) and picks the most-recent **arms-length** tx via
> `isArmsLength` — both from [server/utils/orderTransactions.ts](server/utils/orderTransactions.ts),
> the Data app's canonical owner logic. Reason: user-appended transactions (`insertAtEnd`) and
> assignments leave `sort_order` out of recency order, so trusting it would resolve a stale owner and
> alert the wrong company.

Given a matched `propertyId`, [resolveOwner](server/jobs/code-violations/processes/resolve-owner.ts)
returns a discriminated union on `isNotifiable`:
- buyer is a **company with ≥1 `company_members`** → `isNotifiable: true`, `ownerCompanyId` guaranteed
  non-null, plus `memberUserIds` (reused by NOTIFY so it needn't re-query).
- buyer is a company with **no members** → `isNotifiable: false`, company id set but member-less → stored, no email.
- only a `buyerName`, no `buyerId` → **individual/unlinked** → `ownerCompanyId: null` → stored, no email.

The consumer resolves each property's owner **at most once per run** (`ownerByProperty` cache), so a
`##TMP`/`CE` pair on the same property doesn't repeat the transaction + member queries.

---

## 10. Notification email (`notify.ts`)

Recipients = the owner company's `company_members`, narrowed by `getEmailRecipientsByUserIds`
([server/services/postmark/email.services.ts](server/services/postmark/email.services.ts)) which drops
anyone with the master `notifications` flag off or an unverified email (the kill-switch). The dry-run
panel uses the **same** filter, so "would email" matches exactly who gets emailed.

The email is **plain inline HTML** built in `buildViolationEmail` (no Postmark template in V1 — that's
V2 §8.4) and sent via `sendPlainEmail`. Every interpolated value is escaped
([server/utils/escapeHtml.ts](server/utils/escapeHtml.ts)); description newlines become `<br>`. Company
names are title-cased through `formatCompanyName` (**ARV.RAW-COMPANY-NAME**).

`notifyViolation` does **not** set the violation's `processing_status` — the caller owns that
transition, so all status writes stay in one place (the consumer inline, or the approve pass). Two
callers, **one function**:
1. **Consumer inline** (gate off) — passes `memberUserIds` from `resolveOwner`.
2. **`notifyAwaitingReviewForUpload(uploadId)`** (the approve endpoint) — re-queries members, drains an
   upload's `awaiting_review` rows, flips each to `complete`, refreshes the upload roll-up. Per-row
   try/catch (a throw → `failed`, batch continues), and re-running is safe (already-`complete` rows
   aren't re-fetched; already-emailed recipients are skipped).

---

## 11. Consumer mechanics (`consumer.ts` + `fetch-queue.ts` + `mark-status.ts`)

`runCodeViolationConsumer()` is registered as a `node-cron` job in
[server/jobs/index.ts](server/jobs/index.ts), **prod-gated** (`NODE_ENV === 'production'`), schedule
from `CV_CONSUMER_CRON` (falls back to `*/5 * * * *`; an invalid expression warns and falls back rather
than throwing at startup).

Each run:
1. **Stale recovery** — `resetStaleProcessing(30)`: rows stuck in `processing` past **30 minutes**
   (orphaned by a crash) reset to `pending`. `updated_at` is the lock age.
2. **Atomic claim** — `claimPendingViolations(batchSize)`: a single
   `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED)` flips up to `CV_BATCH_SIZE` (default
   **25**) oldest `pending` rows to `processing` and returns them. `SKIP LOCKED` makes two overlapping
   runs grab **disjoint** sets — a real lock, not the advisory SELECT-then-UPDATE the plan sketched.
3. **Process each row** — MATCH → (if matched) RESOLVE OWNER → DIFF/STORE → route by status
   (`no_match` / `ambiguous` / `complete`+notified=false for non-notifiable or duplicate /
   `awaiting_review` or inline NOTIFY for notifiable). The review gate is read **once per run** so it
   can't flip mid-batch.
4. **Per-row isolation** — a row that throws is `markFailed` with the message (truncated 500 chars,
   **no auto-retry**) and the batch continues.
5. **Upload roll-up** — `refreshUploadStatus(uploadId)` for every affected upload: recomputes status +
   counters **purely from the rows** (idempotent, never incremented in place). Any in-flight rows →
   `processing`; else any `awaiting_review` → `review`; else `completed` (+ `finished_at`).
   `notifications_sent` is counted from the `cv_notifications_sent` ledger so it survives retries. A
   `failed` (ingest-error) upload is never resurrected.

---

## 12. HTTP API

Mounted at `/api/code-violations` ([server/routes/index.ts](server/routes/index.ts)). **All routes are
`requireRole(ADMIN_ROLES)`** — admin + owner only, *not* `PRIVILEGED_ROLES` (relationship-managers and
members are excluded). See [.claude/docs/access-control.md](.claude/docs/access-control.md).

| Method & path | Purpose | Response |
|---|---|---|
| `POST /uploads` | Phase-1 ingest. multipart `file`; multer **memoryStorage**, fileFilter `text/csv` / `application/vnd.ms-excel`, **2 MB** limit. Archives + parses + enqueues; returns immediately. | `CvIngestResponse` `{ uploadId, rowsTotal, violationsNew, skipped }` |
| `GET /uploads` | List ingest runs, most recent first. | `CvUploadListResponse` |
| `GET /uploads/:id` | One run + its per-complaint breakdown (status, resolved owner, would-be recipients) for the detail/dry-run panel. Invalid uuid → 404. | `CvUploadDetailResponse` |
| `POST /uploads/:id/approve` | Approve the dry-run: fire held emails, advance `review → completed`. Only a run currently in `review` can be approved (else **409**). | `CvApproveResponse` `{ upload, violationsNotified, emailsSent }` |

Ingest opens the `cv_uploads` row **before** any fallible work (storage/parse/insert), so a storage
outage or bad header still leaves a retrievable row the catch marks `failed`. A bad CSV header throws
`InvalidCsvError` → **400**. An upload that enqueues nothing new (all duplicates / empty) is finalized
to `completed` in-request, since the consumer never visits an upload with no `pending` rows of its own.

Wire contracts: [shared/types/code-violations.ts](shared/types/code-violations.ts) (dates are ISO
strings; the status/source unions are re-exported from the DB types so they can't drift).

---

## 13. Admin UI

A **"Code Violations"** Radix tab in [client/src/pages/Admin.tsx](client/src/pages/Admin.tsx), rendered
only when `canManageRoles` (`isOwner || isAdmin`).

- **[CodeViolationsTab.tsx](client/src/components/admin/CodeViolationsTab.tsx)** — file picker →
  `POST /uploads` (TanStack Query mutation). Returns immediately; on success it opens the new run's
  detail dialog. The history table **polls every 4 s while any upload is in-flight**
  (`isUploadInFlight` = `enqueued`/`processing`) and stops once all settle.
- **[CodeViolationUploadDetail.tsx](client/src/components/admin/CodeViolationUploadDetail.tsx)** — the
  per-complaint dry-run dialog. Polls every 3 s while in-flight. Sorts rows so ones needing a human
  (`awaiting_review`, then `ambiguous`/`failed`) surface first. Shows each complaint's identity,
  resolved owner, **the exact recipients an approve would email**, and its status badge. While the run
  is in `review`, an **Approve & Notify** button (with a confirm step — "this sends real emails and
  cannot be undone") hits the approve endpoint.

Status→badge maps and `isUploadInFlight` live in
[client/src/constants/codeViolations.constants.ts](client/src/constants/codeViolations.constants.ts)
(typed as `Record<CvProcessingStatus, …>`, so a new status is a compile error until it gets a badge).

---

## 14. Config & dependencies

**No new packages** — reuses `multer`, `papaparse`, `@supabase/supabase-js`, `postmark`, `node-cron`,
Drizzle, TanStack Query, Radix Tabs.

**Storage bucket (NOT an env var):** `codeViolations` in `DEV_BUCKETS` (`code-violations-dev`) /
`PROD_BUCKETS` (`code-violations-prod`) in [server/lib/supabase.ts](server/lib/supabase.ts), selected
by `NODE_ENV`, exported as `codeViolationStorageBucket`. The bucket must exist and allow `text/csv`.

**Env vars (names only):**
| Name | Purpose | Default if unset |
|---|---|---|
| `CV_REQUIRE_REVIEW` | review gate (§6.3) — hold matched rows at `awaiting_review` until Approve | **on** (only an explicit off value disables) |
| `CV_CONSUMER_CRON` | consumer schedule | `*/5 * * * *` |
| `CV_BATCH_SIZE` | max `pending` rows per consumer run | `25` |
| `POSTMARK_CODE_VIOLATION_TEMPLATE_ALIAS` | (V2 §8.4) Postmark template — not used in V1 | — |

Reuses `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `POSTMARK_SERVER_API_KEY`,
`DEFAULT_FROM_EMAIL`.

> Note: this branch also changed the dev server default port `5000 → 4000` in
> [server/index.ts](server/index.ts) — incidental, but relevant when running the dev scripts below.

---

## 15. Testing & local dev

**Automated tests** (under [tests/server/](tests/server/)):
- `jobs/code-violations/` — unit tests for `match-address`, `resolve-owner`, `diff-and-store`,
  `notify`, and a `consumer` test driving `pending → complete`/`no_match`/`awaiting_review`.
- `services/code-violations/` — CSV parse, ingest integration, detail.
- `validation/code-violations.validation.test.ts`, `controllers/`, and `api/…integration.test.ts`
  (the auth matrix: admin/owner allowed; RM/member/anon rejected).

**Manual E2E harness** (the queue cron is prod-gated, so dev needs a manual drain):
1. `npm run cv:test-generate [recipientEmail]` — [scripts/cv-test-generate.ts](scripts/cv-test-generate.ts)
   works the pipeline **backwards**: reads real dev-DB properties, runs the **same `resolveOwner`** to
   find company-owned ones, links the recipient into those companies, and emits a self-checking
   `cv-test-upload.csv` + `cv-test-expected.md`. It deliberately includes edge rows: a `no_match`, a
   parse-skip (blank record number), and a `##TMP→CE` pair (CE uses an abbreviated address variant, so
   it exercises the normalizer *and* the secondary dedup at once). Ensures the recipient has
   `notifications=true` + a verified email (else NOTIFY drops them). Test record numbers are stamped
   `…-TEST-…`; cleanup SQL is documented in the script header.
2. Upload `cv-test-upload.csv` in the admin panel.
3. `npm run cv:run-consumer` — [scripts/cv-run-consumer.ts](scripts/cv-run-consumer.ts) calls
   `runCodeViolationConsumer()` in a loop until the queue drains. With the gate on, matched+notifiable
   rows land at `awaiting_review` (no emails); hit **Approve** in the panel to fire them.

---

## 16. Known limitations & future work (V2+, NOT built)

Per [.claude/plans/code-violation.md](.claude/plans/code-violation.md) §8:
- **§8.1 Scrape Accela** — a headless Playwright worker becomes a second producer (`source='scraper'`)
  on the same queue; the consumer is unchanged. Designed in the scraper companion doc.
- **§8.2 In-app / bell notifications** — add `'code_violation'` to `notification_type`, a
  `createCodeViolationNotification` → WebSocket broadcast, `cv_notifications_sent.channel='in_app'`,
  plus a user-facing Code Violations UI (none in V1 — email is the only output).
- **§8.3 Ingest properties we don't have** — an unmatched complaint is already stored (no `cv_matches`
  row); V2 enqueues its address into `market_scan_queue`, retries the match once the property exists,
  and backfills + notifies. Needs a durable retry mechanism (e.g. SQS).
- **§8.4 Polished email template** — Postmark template instead of inline HTML.
- **§8.5 Move processing to SQS** — the V1 DB queue is intentionally the pre-SQS shape; each `pending`
  row becomes an SQS message and the cron consumer becomes an SQS consumer. Keeping per-complaint
  processing idempotent and keyed on `record_number` is what makes this a transport swap, not a redesign.

**Ongoing tuning:** the normalizer has a long tail — real data will surface more address variants. The
`no_match` / `ambiguous` admin lists are how you find and fix them; extend the maps in
[shared/constants/street-types.ts](shared/constants/street-types.ts). `##TMP→CE` frequency is unknown
until real data; the dedup logs every occurrence so it can be measured.
