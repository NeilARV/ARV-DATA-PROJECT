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
4. checks whether that company belongs to an **operator group with members** (§9, re-pointed off
   `company_members` in #93), and
5. **emails those group members** that a property tied to their operator has a new code complaint.

Every complaint that resolves to a property we track is **stored** (notifiable or not), so the `cv_`
tables become a complete code-violation ledger keyed to our properties.

**The value prop is speed-to-alert:** be the first to tell an investor "the city just opened a
complaint on one of your properties." A daily manual upload is fast enough for V1 — **no scraping, no
external API calls.**

**Alerts send automatically — no per-complaint approval step.** Right after upload, the consumer
matches, resolves owners, and emails inline. It emails only **sendable** complaints: a
code-enforcement `CE-*` record with an open Accela status (`New` or `Active …`). Closed `CE-*`
complaints and all temporary `##TMP-*` records are still matched and stored — they just never email
(§6.3). **Every operator group with members is notified** — there is no per-group opt-out (a per-user
opt-out is planned to replace the retired per-group gate, #93).

---

## 2. The core relationship chain

The feature is a join across four things already modeled. Understanding the chain is the design:

```
  complaint address ──match──► properties (+ addresses 1:1)
                                   │
                                   ├─ most-recent arms-length tx (property_transactions)
                                   │        └─ buyerId ──► companies            (current owner)
                                   │                          │
                                   │                          └─ group_id ──► company_groups (operator)
                                   │                                             └─ group_members ──► users (emails)
                                   └─ if no matching property, or owner is an individual,
                                      or the company is ungrouped / its group has no member
                                        →  store, don't notify
```

| Step | Where | Notes |
|---|---|---|
| Property + address | [database/schemas/properties.schema.ts](database/schemas/properties.schema.ts) — `properties` (uuid PK) + 1:1 `addresses` | match on the normalized `addresses.formatted_street_address` + `city`/`state` (+ `zip` tiebreak) |
| Current owner | `property_transactions`, re-sorted by recording date | the **buyer** of the most-recent arms-length tx is the current owner |
| Owner identity | `companies` (uuid PK) | linked via `property_transactions.buyerId`; only `buyerName` (no FK) → **individual/unlinked**, don't notify |
| Operator group | `companies.group_id` → `company_groups` | null = ungrouped → don't notify; any group with members is notified (no per-group opt-out) |
| User association | `group_members` (`userId`, `groupId`, `role`, `isPrimary`) | a group can have multiple members → notify them all. Reach is **group-wide**: a member is tied to every company in the group |
| User email | `users.email` | filtered by the master notifications kill-switch before sending |

> ⚠️ **Notify through `group_members`, never `company_members` or `company_contacts`.** As of #93 the
> notify path resolves recipients through the owner's **operator group** (`companies.group_id` →
> `company_groups` → `group_members`) — the go-forward membership model. `company_contacts` is the
> public OpenCorporates display roster (usually not platform users, email often absent) and is never
> used. The whole notify path
> ([resolve-owner.ts](server/jobs/code-violations/processes/resolve-owner.ts),
> [notify.ts](server/jobs/code-violations/processes/notify.ts)) and the admin detail panel's
> would-be-recipient list join `group_members` only.

There is **no `entity_type` column.** The "notifiable" gate is: *did the most-recent arms-length
transaction resolve to a `companies` FK (`buyerId`) whose `group_id` points at a group with ≥1
`group_members` row.* **Behavior shift (#93, accepted):** notification is now **group-wide** — a
violation on any of an operator's companies notifies all the operator's group members.

---

## 3. Architecture at a glance

The pipeline is **decoupled into two phases connected by a DB queue**, mirroring the `data_v2`
(`market_scan_queue` + consumer) pattern. The upload request does almost nothing and returns
instantly; the heavy per-complaint work runs in a background drain **the upload itself fires** — there
is no cron (the consumer is triggered by ingest, not a schedule).

```
  PHASE 1 — INGEST  (synchronous, inside the HTTP request, milliseconds)
    UPLOAD ──► PARSE ──► ENQUEUE ──► (fire-and-forget) processCodeViolationQueue()
    archive raw CSV   papaparse +     upsert one cv_violations row per complaint
    to Supabase +     header-         as processing_status = 'pending', then kick off the
    cv_uploads row    validate        drain and return immediately (dedup by record_number)

  PHASE 2 — CONSUMER  (fired by the upload; drains the queue a batch at a time)
    CLAIM ──► MATCH ──► RESOLVE OWNER ──► DIFF/STORE ──► NOTIFY (if sendable) ──► MARK STATUS
    pending→  address   most-recent       write          email each member     set terminal
    processing  → prop  arms-length buyer  cv_matches +   of a sendable CE +    status +
    (SKIP LOCKED)       company            TMP→CE dedup   new/active complaint  refresh upload
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
    code-violations.services.ts                INGEST (archive+parse+enqueue), list, detail
  jobs/code-violations/
    consumer.ts                                runCodeViolationConsumer (one batch) + processCodeViolationQueue (drain loop, fired by ingest)
    processes/
      fetch-queue.ts                           atomic claim of pending rows (FOR UPDATE SKIP LOCKED)
      mark-status.ts                           status transitions, stale reset, upload roll-up
      match-address.ts                         parse + normalize + match to a property (pure-ish, batched)
      resolve-owner.ts                         most-recent arms-length buyer company + members
      diff-and-store.ts                        write cv_matches; ##TMP→CE secondary dedup
      sendable.ts                              isSendableComplaint — CE-* + New/Active send filter
      notify.ts                                resolve members → sendPlainEmail → cv_notifications_sent
  jobs/index.ts                                no CV cron — ingest fires processCodeViolationQueue directly
  lib/supabase.ts                              codeViolations bucket constant (code-violations-dev/-prod)

shared/
  utils/formatAddress.ts                       normalizeAddressForMatch + cleanAddressString (the matcher)
  constants/street-types.ts                    suffix / directional / ordinal / unit-designator maps
  types/code-violations.ts                     wire contracts (re-exports the status unions)

client/
  pages/Admin.tsx                              "Code Violations" Radix tab (gated isOwner||isAdmin)
  components/admin/CodeViolationsTab.tsx        upload + history table (polls while in-flight)
  components/admin/CodeViolationUploadDetail.tsx per-complaint results dialog (matches + who was emailed)
  api/code-violations.api.ts                   typed fetch wrappers
  constants/codeViolations.constants.ts        status→badge maps + isUploadInFlight()

scripts/
  cv-test-generate.ts                          dev: build a self-checking test CSV from real DB data
  cv-run-consumer.ts                           dev: re-drain the queue / clear stragglers (ingest already auto-drains on upload)
  cv-test-cleanup.ts                           dev: remove all `…-TEST-…` rows so you can re-test
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
| `first_seen_upload_id` | uuid FK cv_uploads (set null) | the upload that enqueued it (the detail panel groups by it) |
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
| `no_match` | processed cleanly, address is not a property we track | yes |
| `ambiguous` | matched **more than one** property → needs a human | yes |
| `complete` | finished through-and-through (emailed or not) | yes |
| `failed` | something threw; see `error_message` (no auto-retry) | yes |

> `awaiting_review` is **retired.** The pipeline no longer produces it (nor the `review` upload status)
> now that alerts send inline instead of waiting on an Approve step. Both value strings are kept in the
> Zod value-sets and the badge maps only so any pre-change rows still render — nothing writes them.

### 6.2 `notified` (boolean) — read alongside the status
- `complete` + `notified=true` → matched, **sendable** (new/active `CE-*`), owner is in a group with
  members, **email sent**.
- `complete` + `notified=false` → matched but not emailed: not sendable (closed `CE-*` or a `##TMP-*`
  record), **nobody to email** (individual owner, ungrouped or member-less-group company), or a
  `##TMP→CE` duplicate already alerted.
- `no_match` / `ambiguous` / `failed` → `notified` stays false.

### 6.3 The send filter (`isSendableComplaint`)
Alerts fire inline during processing — there is no approval step. What gates an email is not a status
stop but a pure predicate on the complaint itself,
[`isSendableComplaint`](server/jobs/code-violations/processes/sendable.ts): a complaint is emailed only
when **both** hold —

- **it's a code-enforcement record** — `record_number` starts with `CE` (San Diego's `CE-*` codes).
  Temporary `##TMP-*` records (and any other prefix) are never emailed.
- **its Accela status is open** — `status_text` is `New` or starts with `Active` (`Active Investigation`,
  `Active Enforcement`). Every closed disposition's status starts with `Closed`, so all closed cases are
  excluded.

Non-sendable complaints still run the full MATCH → RESOLVE → DIFF pipeline and get their `cv_matches`
row — they just land at `complete`+`notified=false` instead of emailing.

**No per-group approval gate.** Every operator group with members is notified: the consumer emails
any **sendable, notifiable, non-duplicate** complaint (see the routing in
[consumer.ts](server/jobs/code-violations/consumer.ts)). The old per-group opt-in
(`company_groups.code_violation_notifications_enabled`, #93) is retired; a per-user opt-out is planned
to replace it. The column remains in the DB, unused, pending the final-cleanup drop.

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
   `md5(description)`** that is already alerted (`complete`+`notified`, or a legacy `awaiting_review`).
   If found, this row is stored but marked `complete`+`notified=false`. Logged when it triggers. Needs
   both a normalized street and a date to be reliable — without both, the key is too weak and we don't dedup.
   - The DB check can't see a sibling **still `processing` in the same batch**, so the consumer also
     keeps an in-memory `alertedKeysThisRun` set, so a `##TMP`/`CE` pair arriving in one batch is also
     caught ([consumer.ts](server/jobs/code-violations/consumer.ts)).
3. **`cv_notifications_sent` UNIQUE(`violation_id`,`user_id`,`channel`)** — the hard backstop. NOTIFY
   **claims the row (insert `onConflictDoNothing`) before sending**; if the claim returns nothing, a
   concurrent/previous pass already has it → skip. If the send then throws, the claim is **deleted** so
   a later pass retries. This is what makes a re-run (e.g. re-uploading an overlapping export) safe.

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
resolves notifiability through the owner's **operator group** (#93) via
`getCompanyGroupNotificationTarget` in
[groups.services.ts](server/services/groups/groups.services.ts) — the single seam that replaced
`getCompanyMembers` (`companies.group_id` → `company_groups` → `group_members`). It returns a
discriminated union on `isNotifiable`:
- buyer is a company **in a group with ≥1 `group_members`** → `isNotifiable: true`, `ownerCompanyId`
  guaranteed non-null, plus `memberUserIds` (group-wide, reused by NOTIFY so it needn't re-query).
- buyer is a company that is **ungrouped, or grouped but member-less** → `isNotifiable: false`,
  company id set → stored, no email.
- only a `buyerName`, no `buyerId` → **individual/unlinked** → `ownerCompanyId: null` → stored, no email.

The consumer resolves each property's owner **at most once per run** (`ownerByProperty` cache), so a
`##TMP`/`CE` pair on the same property doesn't repeat the transaction + member queries.

---

## 10. Notification email (`notify.ts`)

Recipients = the owner company's **operator-group members** (#93), narrowed by
`getEmailRecipientsByUserIds`
([server/services/postmark/email.services.ts](server/services/postmark/email.services.ts)) which drops
anyone with the master `notifications` flag off or an unverified email (the kill-switch). The detail
panel's would-be-recipient list uses the **same** group resolution + filter, so it matches who a sent
alert reached.

The email is **plain inline HTML** built in `buildViolationEmail` (no Postmark template in V1 — that's
V2 §8.4) and sent via `sendPlainEmail`. Every interpolated value is escaped
([server/utils/escapeHtml.ts](server/utils/escapeHtml.ts)); description newlines become `<br>`. Company
names are title-cased through `formatCompanyName` (**ARV.RAW-COMPANY-NAME**).

`notifyViolation` does **not** set the violation's `processing_status` — the consumer owns that
transition, so all status writes stay in one place. It only sends: the caller passes the resolved
`memberUserIds` (from `resolveOwner`) and `notifyViolation` never re-resolves recipients, so the
notifiability decision lives in exactly one place (the consumer). It's called inline for each
sendable, notifiable, non-duplicate complaint. Re-running is safe: a recipient already in
`cv_notifications_sent` isn't re-emailed (§7).

---

## 11. Consumer mechanics (`consumer.ts` + `fetch-queue.ts` + `mark-status.ts`)

**No cron.** Ingest fires `processCodeViolationQueue()` (in
[consumer.ts](server/jobs/code-violations/consumer.ts)) **fire-and-forget** right after enqueuing — see
`ingestCodeViolationCsv` in
[code-violations.services.ts](server/services/code-violations/code-violations.services.ts). That drain
calls `runCodeViolationConsumer()` in a loop until a pass claims nothing (a single upload can exceed one
batch), capped at 50 passes; terminal rows are never re-claimed, so it always converges. It runs in
**all environments** (no `NODE_ENV` gate), so an upload auto-processes in dev too. The HTTP request
still returns immediately and the admin panel polls `GET /uploads/:id` for progress.

> **Tradeoff:** with no scheduled tick, there is no automatic recovery if a drain dies mid-run — any
> leftover `pending` (or orphaned `processing`) rows wait until the **next upload**, whose drain calls
> `resetStaleProcessing` and re-claims all pending. To clear stragglers on demand, run
> `npm run cv:run-consumer`.

Each `runCodeViolationConsumer()` pass:
1. **Stale recovery** — `resetStaleProcessing(30)`: rows stuck in `processing` past **30 minutes**
   (orphaned by a crash) reset to `pending`. `updated_at` is the lock age.
2. **Atomic claim** — `claimPendingViolations(batchSize)`: a single
   `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED)` flips up to `CV_BATCH_SIZE` (default
   **25**) oldest `pending` rows to `processing` and returns them. `SKIP LOCKED` makes two overlapping
   runs grab **disjoint** sets — a real lock, not the advisory SELECT-then-UPDATE the plan sketched.
3. **Process each row** — MATCH → (if matched) RESOLVE OWNER → DIFF/STORE → route to `complete`,
   emailing inline via NOTIFY only when the complaint is sendable ({@link isSendableComplaint}),
   notifiable, and not a duplicate; otherwise `complete`+notified=false. Unmatched → `no_match`,
   multi-match → `ambiguous`.
4. **Per-row isolation** — a row that throws is `markFailed` with the message (truncated 500 chars,
   **no auto-retry**) and the batch continues.
5. **Upload roll-up** — `refreshUploadStatus(uploadId)` for every affected upload: recomputes status +
   counters **purely from the rows** (idempotent, never incremented in place). Any in-flight rows →
   `processing`; else `completed` (+ `finished_at`). `notifications_sent` is counted from the
   `cv_notifications_sent` ledger so it survives retries. A `failed` (ingest-error) upload is never
   resurrected.

---

## 12. HTTP API

Mounted at `/api/code-violations` ([server/routes/index.ts](server/routes/index.ts)). **All routes are
`requireRole(ADMIN_ROLES)`** — admin + owner only, *not* `PRIVILEGED_ROLES` (relationship-managers and
members are excluded). See [.claude/docs/access-control.md](.claude/docs/access-control.md).

| Method & path | Purpose | Response |
|---|---|---|
| `POST /uploads` | Phase-1 ingest. multipart `file`; multer **memoryStorage**, fileFilter `text/csv` / `application/vnd.ms-excel`, **2 MB** limit. Archives + parses + enqueues; returns immediately. | `CvIngestResponse` `{ uploadId, rowsTotal, violationsNew, skipped }` |
| `GET /uploads` | List ingest runs, most recent first. | `CvUploadListResponse` |
| `GET /uploads/:id` | One run + its per-complaint breakdown (status, resolved owner, eligible recipients) for the detail panel. Invalid uuid → 404. | `CvUploadDetailResponse` |

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
  `POST /uploads` (TanStack Query mutation). Returns immediately; it holds the new run's detail dialog
  back until the drain settles (so the admin lands on final results, not the transient processing
  screen). The history table **polls every 4 s while any upload is in-flight**
  (`isUploadInFlight` = `enqueued`/`processing`) and stops once all settle.
- **[CodeViolationUploadDetail.tsx](client/src/components/admin/CodeViolationUploadDetail.tsx)** — the
  per-complaint results dialog. Polls every 3 s while in-flight. Sorts rows so ones needing a human
  (`ambiguous`/`failed`) surface first. Shows each complaint's identity, resolved owner, the owning
  company's alert recipients, its status badge, and an **Emailed** badge (the `notified` flag) — the
  record of what matched and which alerts were sent. No approval action (alerts already fired inline).

Status→badge maps and `isUploadInFlight` live in
[client/src/constants/codeViolations.constants.ts](client/src/constants/codeViolations.constants.ts)
(typed as `Record<CvProcessingStatus, …>`, so a new status is a compile error until it gets a badge).

**No per-group notification toggle.** The per-group approval opt-in (#93) is retired — every group
with members is notified — so [GroupDetailsForm.tsx](client/src/components/admin/GroupDetailsForm.tsx)
no longer carries a "Code violation email alerts" switch (§6.3). A per-user opt-out is planned to
replace it.

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
| `CV_BATCH_SIZE` | max `pending` rows claimed per consumer pass (the drain loops until empty) | `25` |
| `POSTMARK_CODE_VIOLATION_TEMPLATE_ALIAS` | (V2 §8.4) Postmark template — not used in V1 | — |

Reuses `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `POSTMARK_SERVER_API_KEY`,
`DEFAULT_FROM_EMAIL`.

> Note: this branch also changed the dev server default port `5000 → 4000` in
> [server/index.ts](server/index.ts) — incidental, but relevant when running the dev scripts below.

---

## 15. Testing & local dev

**Automated tests** (under [tests/server/](tests/server/)):
- `jobs/code-violations/` — unit tests for `match-address`, `resolve-owner`, `diff-and-store`,
  `sendable` (the CE-*/New-Active send filter), `notify`, and a `consumer` test driving
  `pending → complete`/`no_match` and the sendable/non-sendable email routing.
- `services/code-violations/` — CSV parse, ingest integration, detail.
- `validation/code-violations.validation.test.ts`, `controllers/`, and `api/…integration.test.ts`
  (the auth matrix: admin/owner allowed; RM/member/anon rejected).

**Manual E2E harness** (the upload now drives the drain in every environment, so no manual consumer run
is needed — uploading is enough):
1. `npm run cv:test-generate [recipientEmail]` — [scripts/cv-test-generate.ts](scripts/cv-test-generate.ts)
   works the pipeline **backwards**: reads real dev-DB properties, runs the **same `resolveOwner`** to
   find company-owned ones, links the recipient into those companies, and emits a self-checking
   `cv-test-upload.csv` + `cv-test-expected.md`. It deliberately includes edge rows: a `no_match`, a
   parse-skip (blank record number), and a `##TMP→CE` pair (CE uses an abbreviated address variant, so
   it exercises the normalizer *and* the secondary dedup at once). Ensures the recipient has
   `notifications=true` + a verified email (else NOTIFY drops them). Test record numbers are stamped
   `…-TEST-…`.
2. Upload `cv-test-upload.csv` in the admin panel — ingest fires the drain automatically, matching and
   emailing inline. A matched, notifiable complaint emails only when it's sendable (a `CE-*` record
   with a `New`/`Active …` status); closed CE and `##TMP-*` rows are stored, not emailed. (If a drain
   ever stalls, `npm run cv:run-consumer` re-drains, looping `runCodeViolationConsumer()` until empty.)
3. `npm run cv:test-cleanup` — removes every `…-TEST-…` row (and the test uploads) so you can re-test
   from a clean slate; pass `-- --unlink <email>` to also drop the recipient's test company links.

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
  row becomes an SQS message and the consumer becomes an SQS consumer. Keeping per-complaint
  processing idempotent and keyed on `record_number` is what makes this a transport swap, not a redesign.

**Ongoing tuning:** the normalizer has a long tail — real data will surface more address variants. The
`no_match` / `ambiguous` admin lists are how you find and fix them; extend the maps in
[shared/constants/street-types.ts](shared/constants/street-types.ts). `##TMP→CE` frequency is unknown
until real data; the dedup logs every occurrence so it can be measured.
