# Pipeline Redesign — Store Every Transaction

**Status:** Draft for review · **Owner:** Neil · **Last updated:** 2026-07-02

## 0. Decisions locked in

| Decision | Choice |
|---|---|
| Scope | **Full redesign** — every SFR transaction in supported MSAs gets a fully enriched property (batch lookup + full transaction history + child tables) |
| Visibility | **Stored but hidden** — default API views keep showing exactly what they show today; new properties exist for code violations, audits, and future features |
| Backfill | **Forward only** — new rules apply from cutover; scan windows E / init stay available for later backfill if needed |
| New construction | **Store all, hide builder-active** — ingest every property; hide from default views only while the most recent transaction is New Construction |

Core principle: **transactions are the source of truth; classification happens at read time.**
Today, classification (corporate-party detection, status resolution, new-construction detection)
happens at *ingest* time, where a wrong answer means the data is never stored — permanent loss.
After the redesign, a wrong answer is a display-filter bug, fixable retroactively because the
underlying data exists.

---

## 1. How the pipeline works today

Two-stage producer/consumer split around the `market_scan_queue` table
(`database/schemas/sync.schema.ts` — one row per `(msa_id, sfr_property_id)` via
`uq_msq_msa_property`; completed rows purged after 90 days by `clean-market-cache.ts`, nightly 23:50).

### 1.1 Producer — scan windows (`server/jobs/data_v2/scan-window-*.ts`)

Five near-identical jobs, each covering a sale-date range over all MSAs in the `msas` table:

| Window | Range | Cron | Status |
|---|---|---|---|
| A | 0–15d | nightly 00:00 | active |
| B | 15–30d | every 2 days 01:00 | active |
| C | 30–60d | Mondays 02:00 | active |
| D | 60–90d | 1st + 15th 03:00 | active |
| E | 90–180d | — | **disabled** |
| init | all windows (backfill) | — | **disabled** (manual) |

Per MSA, each window runs:

1. **`getMarket`** — pages SFR `/buyers/market` for the date range (100/page, 1s pacing, 3 retries).
   No filtering.
2. **`cleanMarket`** — **keeps a record only if buyer or seller looks corporate**
   (`record.isCorporate === true` for buyer, `isFlippingCompany()` name-pattern matching for both
   sides). Individual↔individual sales are discarded and never reach the queue.
3. **`insertQueue`** — drops malformed records (missing either ID or either date); dedupes by
   `sfr_property_id` keeping newest `recording_date`; **skips** a candidate when the queue already
   has that property with `recording_date >=` incoming (any status, including `complete`); deletes
   superseded non-processing rows; inserts `pending` rows with
   `onConflictDoNothing({ target: sfrMarketId })`.

### 1.2 Consumer (`server/jobs/data_v2/consumer.ts`)

Cron `*/30 5-22` PT = **36 runs/day**. `MAX_PROPERTIES_PER_MSA = 5` per run
→ throughput cap **180 properties/MSA/day** (~1,620/day across 9 MSAs). Per batch:

| # | Step | What it does |
|---|---|---|
| 1 | `resetStaleProcessing` | resets `processing` rows older than 60 min (proxy: `enqueuedAt`) |
| 2 | `fetchQueue` | DISTINCT ON `sfr_property_id`, newest `recording_date` first, LIMIT = remaining |
| 3 | `markProcessing` | flips all matching rows (no status guard) |
| 4 | `batchLookup` | SFR `/properties/batch` by address; overlays market record's sale/buyer/seller onto `last_sale`/`current_sale`; NOT_FOUND items dropped → later marked `failed` |
| 5 | `getTransactions` | SFR `/properties/transactions` per property — **full history, all types** (arms length, non-arms length, REFI, HELOC, new construction) |
| 6 | **New Construction gate** | drops the whole property if **any** transaction in history is type `New Construction` → `failed` |
| 7 | `cleanTransactions` | harvests corporate names + counties from all transactions |
| 8 | `insertCompanies` | upserts companies + `company_msas` + `company_counties` (loads full companies table into memory) |
| 9 | `resolvePropertyIds` | name → company UUID on property + each transaction (loads full companies table again) |
| 10 | `resolveStatuses` | wholesale / sold / in-renovation via chain-aware `sortTransactionsDesc`; `On Market` listing short-circuits to in-renovation |
| 11 | **Unresolved-status gate** | drops properties with zero statuses (both parties individual) → `failed` |
| 12 | `cleanBeforeInsert` + `resolveArvFunded` | county/type normalization; ARV-lender annotation |
| 13 | `insertProperties` | upsert property + 11 child tables (address, structure, assessments, tax, valuations, parcel, school, exemption, pre-foreclosure, last/current sale); delete-and-replace all pipeline transactions, preserving user-created rows, recomputing `sort_order` |
| 14 | SBT (CA) / ARV-client flags / purchase-to-ARV ratios | post-insert derived data |
| 15 | `markComplete` / `markFailed` | no status guard on the UPDATE |

### 1.3 Where data is lost today (the four gates)

| Gate | Where | What's lost |
|---|---|---|
| Corporate-party filter | `cleanMarket` (producer) | any property whose triggering sale was individual↔individual — never enters the queue |
| Malformed record | `insertQueue.toRow` | records missing IDs or dates (logged count only, raw data discarded) |
| New Construction | consumer step 6 | whole property if **any** historical transaction is New Construction — including decades-old builder sales on since-flipped homes |
| Unresolved status | consumer step 11 | properties whose most recent arms-length transaction has no corporate party |

Plus the implicit gate: a property whose corporate transactions all fall outside scanned windows
never enters the system — the root cause of the ~2-in-500 code-violation match rate.

**Important framing:** for properties that pass the gates, we already store *every* transaction of
*every* type. The pipeline drops whole *properties*, not individual transactions.

### 1.4 Known bugs in the current pipeline

| # | Bug | Where | Fate under redesign |
|---|---|---|---|
| B1 | New Construction gate uses `.some()` over full history — any historical builder sale permanently excludes the property | `consumer.ts:231-246` | **Obsoleted** — gate removed; §3.3 handles builder-active |
| B2 | `isTrust` runs before `KNOWN_CORPORATE_NAMES` and the known-names check is exact-match — "OPENDOOR PROPERTY TRUST 1" classified as a trust and rejected | `dataSyncHelpers.ts:97-110` | **Still matters** (company creation + status resolution) — fix in Phase 1 |
| B3 | `onConflictDoNothing({ target: sfrMarketId })` on an ID SFR *reassigns every run* — a new transaction can silently collide with a stale row's ID and be dropped | `insert-queue.ts:176-181` | Fixed by §3.2 conflict-target change |
| B4 | Multi-row insert can abort a whole MSA's scan: conflict target is `sfrMarketId` only, so a candidate colliding with an in-flight `processing` row violates `uq_msq_msa_property` and throws | `insert-queue.ts:156-181` | Fixed by §3.2 |
| B5 | Same-recording-date skip (`>=`): a double-close second leg published later by SFR never re-enqueues the property | `insert-queue.ts:135-147` | Fixed by §3.2 dedupe rule |
| B6 | `markProcessing`/`markComplete`/`markFailed` have no status guard — a pending row inserted mid-batch gets marked `complete` unprocessed, and B5's `>=` check then blocks re-enqueueing forever | `mark-queue.ts` | Fixed in Phase 1 |
| B7 | `resetStaleProcessing` uses `enqueuedAt` (rows are enqueued at midnight, processed hours later — everything is always "stale"); an overlapping consumer run resets in-flight rows and double-processes | `mark-queue.ts:17-27` | Fixed in Phase 1 (`processingStartedAt` + run-overlap guard) |
| B8 | `resolvePropertyIds` + `insertCompanies` each load the **entire companies table** per batch, every 30 min | `resolve-ids.ts:48`, `insert-companies.ts:64` | Must fix before volume increases (Phase 2) |
| B9 | `insertProperties` deletes-then-reinserts transactions with no DB transaction wrapper — crash mid-loop leaves a property with zero transactions until reprocessed | `insert-properties.ts:371-433` | Fixed in Phase 1 |
| B10 | `is-arv-funded` picks latest arms-length by a plain date-max loop, not the chain-aware sort — same-day double closes can read the wrong leg's lender | `is-arv-funded.ts:35-41` | Fixed in Phase 1 |
| B11 | `batchLookup` overlay sets `seller_1` unconditionally (buyer uses `??`) — a market record with no seller nulls out batch data | `batch-lookup.ts:236` | Fixed in Phase 1; matters more for the address-intake path (§6) |
| B12 | Read layer defaults missing statuses to `'in-renovation'` — harmless today, catastrophic after the redesign (every unclassified property would masquerade as in-renovation) | `properties.services.ts:661-662`; legacy `properties.status` column defaults `'in-renovation'` (`properties.schema.ts:42`) | Fixed in Phase 3 — **must ship before ingest changes** |

---

## 2. How the pipeline works after the upgrade

Same architecture — scan windows → queue → consumer — with the gates removed and classification
moved to annotations:

```
/buyers/market (ALL records, no cleanMarket)
        │
        ▼
market_scan_queue  (one row per property, newest transaction wins — unchanged shape,
        │           fixed dedupe rules, fixed conflict targets)
        ▼
consumer (throughput raised, overlap-guarded)
        │  batchLookup → getTransactions (unchanged — full history, all types)
        │  cleanTransactions / insertCompanies    ← STILL corporate-gated (see §3.4)
        │  resolvePropertyIds                     ← individuals simply resolve to null
        │  resolveStatuses v3                     ← statuses now OPTIONAL (see §3.3)
        │  insertProperties                       ← inserts even with zero statuses
        ▼
properties + property_transactions + child tables
        │
        ▼
READ LAYER = the new gatekeeper (see §4)
   default views: only properties with ≥1 status row (what users see today)
   code violations / audits / future features: query everything
```

What changes for each gate:

| Today's gate | After |
|---|---|
| `cleanMarket` corporate filter | **Removed.** All records enter the queue. (Keep the corporate/individual ratio as a log line for monitoring.) |
| Malformed-record drop | Kept (a record with no IDs/dates is unprocessable), but log the raw record so nothing disappears invisibly. |
| New Construction gate | **Removed.** Builder-active homes get zero statuses (§3.3) → hidden from default views. Once flipped, they surface with correct statuses. Fixes B1. |
| Unresolved-status gate | **Removed.** Zero-status properties insert normally, marked `complete`, hidden by the read layer. |

What deliberately does **not** change:

- Full transaction history per property (already stored for kept properties).
- Chain-aware ordering (`sortTransactionsDesc`), spread, wholesale detection, SBT, ARV-funded,
  purchase-to-ARV ratios.
- The queue's one-row-per-property shape and the 90-day purge of completed rows.
- Company creation stays corporate-only (§3.4).

---

## 3. Ingest design details

### 3.1 Producer

- `scan-window-a..e.ts`: delete the `cleanMarket` call; pass `getMarket` results straight to
  `insertQueue`. Keep `cleanMarket`'s counting as a pure stats log (corporate vs individual ratio
  per window) — free monitoring signal, no filtering.
- Re-enable nothing new: E/init stay disabled (forward-only decision).

### 3.2 `insertQueue` v2 — dedupe and conflict rules

- **Conflict target:** `(msa_id, sfr_property_id)` (the real uniqueness), not `sfr_market_id`.
  Drop the unique constraint on `sfr_market_id` — it's a vendor ID that SFR reassigns per scan and
  it can only cause false-conflict data loss (B3) or batch-aborting violations (B4). Keep the
  column for reference/debugging.
- **Skip rule (replaces `>=`):** skip a candidate iff the queue already has the property with
  - `recording_date >` incoming, **or**
  - `recording_date =` incoming **and** same `sale_value` **and** same buyer `nameKey`.
  An equal-date record with a different price/buyer is a double-close second leg → re-enqueue
  (fixes B5). Reprocessing is idempotent — the consumer refetches full history.
- Keep the stale-row delete (skip `processing`), now safe because the insert conflict-targets the
  per-property constraint.

### 3.3 `resolveStatuses` v3 — statuses become optional annotations

Inputs and helpers unchanged (chain-aware `sortTransactionsDesc`, `isArmsLength`, token matching).
New rules:

1. **Builder-active override (implements the New Construction decision):** if the most recent
   transaction overall (chain-sorted, any type) is type `New Construction` → `statuses = []`.
2. **`On Market` guard:** today `listing_status === 'On Market'` unconditionally yields
   `in-renovation`. New: apply only when the most recent arms-length buyer is corporate. Otherwise
   an individual homeowner's listing (or a builder's) would surface as in-renovation. Without a
   corporate buyer → contribute no status.
3. Wholesale / sold / in-renovation checks: **unchanged**.
4. `statuses = []` is a **valid outcome** — no `markFailed`, no exclusion. Remove the
   `"Couldn't Resolve Status"` failure path in the consumer.
5. Remove the `primaryStatus = statuses[0] ?? 'in-renovation'` fallback; `property.status` may be
   null/absent.

`insertProperties` change: with `statuses = []`, delete stale `property_statuses` rows and insert
none. Everything else identical.

### 3.4 Companies — the classifier moves, it doesn't die

- `isFlippingCompany` **remains the gate for company creation** (`cleanTransactions` →
  `insertCompanies`). Individuals never get company rows — their names are already stored on every
  transaction row (`buyer_name` / `seller_name`), so they stay fully queryable without polluting
  the companies table, the directory, or rankings.
- Fix B2 while here: check `KNOWN_CORPORATE_NAMES` *before* `isTrust`, and match known names by
  prefix/containment (`opendoor property trust 1` → Opendoor), not exact equality.
- The win: a misclassified name is now recoverable. Re-run classification over stored
  `buyer_name`/`seller_name` values offline (one SQL pass + `insertCompanies` + a targeted
  `resolvePropertyIds` re-run) — no rescraping, no lost transactions.
- B8 fix is a prerequisite for volume: replace both full-table loads with targeted
  `inArray(companies.companyName, batchNames)` lookups.

### 3.5 Consumer throughput and safety

- **Overlap guard:** module-level `isRunning` flag (cron fires in-process) + `processingStartedAt`
  column on the queue; `resetStaleProcessing` keys off it (fixes B7).
- **Status guards** on `markProcessing` (`pending` only), `markComplete`/`markFailed`
  (`processing` only) (fixes B6).
- **Throughput:** keep `MAX_PROPERTIES_PER_MSA` as a per-run cap but raise it, and add a
  wall-clock budget (e.g. stop pulling new batches after ~20 min). Make both env-tunable
  (`PIPELINE_MAX_PER_MSA`, `PIPELINE_TIME_BUDGET_MS`). Sizing math in §7 — final numbers depend on
  the Phase 0 measurement.
- **Kill switch:** `PIPELINE_INGEST_ALL` env flag gating the removal of the corporate filter
  (producer) — flipping it off restores today's behavior without a deploy revert.
- Wrap each property's `insertProperties` work in `db.transaction()` (fixes B9).

---

## 4. Application changes — living with 3–6× more properties

The read layer becomes the gatekeeper. The invariant to preserve: **every default view shows
exactly what it shows today.**

> ⚠️ **This section ships BEFORE the ingest change** (Phase 3 before Phase 4). The app must be
> safe for unclassified properties before any exist.

### 4.1 The visibility rule

**Visible** = property has ≥1 `property_statuses` row (already indexed; the `EXISTS` subquery
pattern is already used by the status filter). The default predicate:

- Applied when a request carries **neither** a status filter **nor** a company filter:
  `EXISTS (SELECT 1 FROM property_statuses ps WHERE ps.property_id = properties.id)`.
- **Empty status filter = "all classified", not "everything."** Today every stored property is
  classified, so this preserves current semantics exactly.
- **Company-scoped queries deliberately skip the predicate.** A company's portfolio/sale history
  must keep showing a property even after its current status empties out (e.g. the company sold
  it, then it resold individual↔individual — the company's history is still real). This is
  *more* correct than today, where that resale is invisible and the stale status lingers.
- An explicit `includeUnclassified` escape hatch for internal/admin/code-violations callers.

Today's classification lives client-side: `DEFAULT_STATUS_FILTERS = ['in-renovation']`
(`client/src/constants/propertyStatus.constants.ts:15`) — the client always sends a status, so the
backend default is defense-in-depth, not a behavior change. **No client changes needed.**

### 4.2 Read-path audit (full checklist for Phase 3)

Every code path reading `properties` / `property_transactions` / `addresses` /
`property_statuses` was audited. Results:

**Must fix — would leak or misprice individual-owned properties:**

| Path | Location | Problem → fix |
|---|---|---|
| Main grid/table feed | `properties.services.ts:118-714` (`getProperties`) | Status `EXISTS` only applied when `statusesToUse` non-empty → apply default predicate; remove `?? 'in-renovation'` fallbacks (lines 661–662) |
| Map pins | `maps.services.ts:303-421` (`getMapProperties`) | Status constraint only when filter provided → default predicate in `buildMapIdConditions` |
| Map extent (bbox) | `maps.services.ts:431-460` (`getMapExtent`) | Same — extent would otherwise span all properties on first load |
| Zip counts | `zipCounts.services.ts:17-124` (`getZipCounts`) | Same |
| **Email campaigns** | `emailUpdates.ts:306-381` (`sendEmailUpdatesForMsa`) | Filters by MSA **only** — would start mailing individual home sales. Add status predicate to the WHERE clause |
| Search autocomplete | `property.services.ts:31-74` (`getPropertySuggestions`) | No property filter at all → add visibility predicate |
| Directory "most-properties" sort | `companies.services.ts:231-248` vs `:314-335` | One branch checks `property_statuses`, the other doesn't → unify (both status-checked) |

**Performance, not correctness:**

| Path | Location | Note |
|---|---|---|
| Global ratio recompute | `purchaseArvRatio.services.ts:130-150` (`recomputeAllPurchaseToArvRatios`) | Scans **all** properties → 3–6× slower. Ratios stay correct (keyed by resolved `seller_id`, null for individuals). Restrict the scan to properties with ≥1 non-null-seller transaction |

**Safe by construction (verify, don't change):** single-property lookups
(`getPropertyById`, `patchProperty`, `getPropertyTransactions`, `reprocessProperty`, SBT compute);
all company-filtered queries (`getProperties`/maps/zip-counts with company filter — predicate
deliberately skipped per §4.1); most-sold/most-bought rankings (`companies.services.ts:249-308`,
`buyer_id`/`seller_id` non-null); deals top-buyers (`deals.services.ts:127-139`, arms-length +
`buyerId` non-null); CV notify (scoped by match rows); enrich-companies (company-scoped).

**Intentionally unfiltered — do NOT add the predicate:** code-violations `match-address.ts`
(matching against *all* addresses is the entire point of this redesign) and `resolve-owner.ts`
(individual-owned matches resolve to `isNotifiable = false` — the correct outcome; the violation
still gets stored and linked).

### 4.3 Legacy `properties.status` column

`mapPropertyRow` never writes it but the schema default stamps `'in-renovation'` on every insert
(`properties.schema.ts:42`). Audit remaining readers, drop the default, and (if unread) drop the
column — a phantom status that contradicts `property_statuses` is a bug waiting to be displayed.

### 4.4 Performance guardrails

- The visibility `EXISTS` rides `idx_property_statuses_property_id`. If default-view query plans
  degrade at 5× table size, the fallback design is a materialized `properties.is_classified`
  boolean maintained by `insertProperties` (flip when statuses go 0↔n) with a partial index.
  Don't build it preemptively — measure first.
- `addresses.street_number` is already indexed (code-violation prefilter scales fine).
- Watch: map bbox aggregates, `DISTINCT ON` in `fetchQueue`, and admin count queries — all scale
  with total rows, not visible rows.

---

## 5. Storage & cost model

Per new property: 1 `properties` row + ~1 row in each of up to 11 child tables + 5–15
`property_transactions` rows + geocoded address. Rough multiplier on all property-family tables:
**3–6×** (the inverse of `cleanMarket`'s keep rate — measured in Phase 0, not guessed).

Neon is the cost surface: storage grows linearly; compute grows with consumer runtime (36
runs/day doing more work each). No new table shapes are introduced by the core redesign (§6 adds
one small queue table).

---

## 6. Code-violations integration

Motivating feature. Current state: violations upload → parse → match against `addresses` →
`no_match` for most (property not in our universe) → terminal.

**After the redesign,** every property that *transacted* in a supported MSA exists, so match rates
rise immediately. The remainder (long-held, never-transacted properties) needs an address-driven
intake:

1. **New table `address_scan_queue`:** `id`, `raw_address`, parsed parts, `source`
   (`code_violation` | `manual`), `source_ref` (cv_violation id), `status`
   (`pending`/`processing`/`complete`/`not_found`/`failed`), `sfr_property_id?`, timestamps.
   Dedupe on normalized address.
2. **Producer:** when the CV consumer marks a violation `no_match`, also enqueue its parsed
   address. (Plus an admin/manual enqueue path for arbitrary address lists.)
3. **Consumer:** batch pending addresses → `/properties/batch` (address-keyed, exactly like
   `batchLookup`) → for found properties, run the standard enrichment chain
   (`getTransactions → cleanTransactions → insertCompanies → resolvePropertyIds →
   resolveStatuses → insertProperties`) with a synthesized record (no market overlay — B11's
   `seller_1` fix matters here). NOT_FOUND → `not_found` for review. MSA comes from the SFR batch
   response.
4. **Rematch:** after inserting, flip the source violations from `no_match` back to `pending` so
   the CV consumer re-matches them. Result: **every violation is stored and permanently linked**
   to a property; notification still fires only when owner → company → user resolves (unchanged).

Individual-owned matched properties won't notify anyone (no company/user link) — expected; the
violation history accrues for future use.

---

## 7. Capacity math (finalized in Phase 0)

- Current consumer capacity: 5/MSA/run × 36 runs = **180 properties/MSA/day** (~1,620 total).
- Cost per property ≈ 1 `/properties/transactions` call + 1/100th of a `/properties/batch` call,
  at 0.5–1s pacing → ~1.5–3s/property observed. A 30-min slot could sustain several hundred
  properties/run per MSA — **wall clock is not the binding constraint; SFR quota is.**
- Post-redesign steady-state inflow = today's inflow ÷ keep-rate. `cleanMarket` already logs
  `kept/removed` per window — Phase 0 harvests those numbers.
- Cutover transient: the first post-cutover scans re-enqueue previously-filtered properties from
  the active windows (0–90d), producing a temporary backlog spike. The queue absorbs it
  (`pending` rows just wait); raise throughput before flipping the flag.

**Phase 0 measurements (do first, ~1 hr):**
1. Keep-rates per MSA/window from recent scan logs (`Clean market: X kept, Y removed`).
2. Current DB baseline: `SELECT count(*) FROM properties; SELECT count(*) FROM
   property_transactions;` + table sizes (`pg_total_relation_size`) for the property family.
3. SFR contract check: rate limit and per-call/monthly pricing → sets the throughput ceiling and
   the real dollar cost of the multiplier.

---

## 8. Implementation plan

Each phase = one PR, independently shippable, `npm run check` + tests green.

### Phase 0 — Measure (no code)
Keep-rates, DB baseline, SFR quota/pricing (§7). Output: final numbers for Phase 5 sizing.

### Phase 1 — Correctness fixes (valuable regardless of redesign)
- B2: known-corporate before trust check, prefix matching (`dataSyncHelpers.ts`)
- B6: status guards in `mark-queue.ts`
- B7: `processingStartedAt` column + overlap guard (consumer + schema + migration)
- B9: `db.transaction()` around per-property insert (`insert-properties.ts`)
- B10: chain-aware latest-arms-length in `is-arv-funded.ts`
- B11: `seller_1 ?? currentSale.seller_1` in `batch-lookup.ts`
- Tests: unit coverage for each fix (esp. B2 name-classification table, B10 same-day ordering).

### Phase 2 — Queue & scale prep
- B3/B4/B5: `insertQueue` v2 dedupe + conflict target (§3.2); migration dropping the
  `sfr_market_id` unique constraint
- B8: targeted company lookups in `resolve-ids.ts` / `insert-companies.ts`
- Tests: dedupe-rule unit tests (double-close same-date case explicitly).

### Phase 3 — Read-layer guardrails (**before any ingest change**)
- All seven "must fix" items from §4.2 (visibility predicate in `getProperties`, maps, extent,
  zip counts; email WHERE clause; suggestions; directory-sort unification) + the
  `recomputeAllPurchaseToArvRatios` scan restriction.
- Remove the in-renovation fallbacks; legacy `status` column audit/drop (§4.3).
- Tests: integration tests asserting each default view (grid, map pins, extent, zip counts,
  suggestions, email selection) excludes a seeded zero-status property, includes it with
  `includeUnclassified`, and that company-scoped queries still return it (§4.1 semantics).
- **Verification gate:** deploy; confirm zero behavior change in prod (data still 100% classified).

### Phase 4 — Ingest cutover
- Remove `cleanMarket` filtering (keep ratio logging) behind `PIPELINE_INGEST_ALL`
- Remove New Construction gate; `resolveStatuses` v3 (§3.3); statuses-optional insert
- Remove the two `markFailed` exclusion paths
- Tests: resolve-status v3 unit suite (builder-active, on-market individual, individual↔individual
  → `[]`; existing wholesale/sold/in-renovation cases unchanged).
- **Verification gate:** flag on in prod for 48h; watch queue depth, failure rate, and that
  default API responses are byte-identical for a sampled property set.

### Phase 5 — Throughput raise
- `PIPELINE_MAX_PER_MSA` + time budget (§3.5), sized from Phase 0; queue-depth per MSA logged
  each run.
- **Verification gate:** backlog drains; steady-state queue depth ~0 by end of each day.

### Phase 6 — Code-violations address intake
- `address_scan_queue` schema + producer hook in CV consumer + intake consumer + rematch (§6).
- Tests: intake consumer integration test (address → property → violation rematches).

### Phase 7 — Docs
- Update `.claude/docs/apps.md` (Data pipeline section — already stale: points at
  `server/jobs/consumer.ts` instead of `data_v2/`), `.claude/docs/database.md` (new
  column/table, dropped constraint), and this plan's status.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| SFR quota/pricing makes 3–6× volume expensive | Phase 0 before any code; throughput knobs are env-tunable; kill switch reverts ingest instantly |
| An unfixed read path leaks individual homes into the UI | Phase 3 ships first with its own verification gate; read-path audit checklist |
| Default-view query plans degrade at 5× rows | `EXISTS` rides an existing index; measured fallback = materialized `is_classified` flag (§4.2) |
| Cutover backlog spike overwhelms consumer | Phase 5 sizing before flag flip; queue absorbs pressure by design |
| Status semantics drift (e.g. builder sales typed Arms Length in some counties would read as "sold") | resolve-status v3 unit suite + 48h prod sampling in Phase 4 gate |

## 10. Open questions

1. **SFR quota and pricing** — the one true blocker for Phase 5 sizing. What's the rate limit,
   and is billing per-call or flat?
2. **Queue retention** — keep the 90-day purge of completed rows, or extend now that the queue
   doubles as an ingest audit trail? (Cheap either way; `property_transactions` is the permanent
   record.)
3. **Legacy `properties.status` column** — drop entirely (preferred) or keep null-defaulted for
   one release as a safety net?
4. **Admin visibility** — should the admin panel get an "unclassified properties" view/count in
   Phase 3, or is DB access enough for now?
