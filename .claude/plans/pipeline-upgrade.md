# Data Pipeline Simplification — Property-as-Root Foundation

> **Status:** Design / pre-build. No code changes yet — this is the plan we react to before
> touching the pipeline.
>
> **Goal (in the user's words):** make the data pipeline *simpler* and *get more data, more
> efficiently*, and in doing so **lock down the foundation** so the platform has a clear answer to
> "are we showing properties or transactions?"
>
> **One-line thesis:** the pipeline today fuses two unrelated jobs — *discovery* ("which properties
> are worth spending API calls to pull?") and *semantics* ("what counts as a valid property once
> pulled?"). Only the first belongs at ingestion. Pull the second job out — **stop discarding,
> start classifying** — and the foundation gets simpler, more consistent, and broader, **without**
> blowing up the rate-limited API budget.
>
> Companion to [`code-violation.md`](./code-violation.md): the coverage this unlocks is exactly what
> the code-violation matcher needs (more real property/address records to match complaints against).

---

## 1. The problem in one paragraph

A property's place in our database currently depends on **how it was discovered, not on what it
is.** `cleanMarket` discards individual-to-individual records at discovery; the consumer then
discards New Construction properties and properties whose status it can't resolve. Yet for every
property we *do* keep, we store its **entire** transaction history — including the individual and
non-arms-length rows we'd have rejected as a seed. The result is an internally inconsistent dataset
and a muddled mental model: the grid is property-centric but keyed off the latest transaction, the
company view is transaction-centric, and nobody can say in one sentence what the canonical entity
is. We want the canonical entity to be the **property**, with transactions as **classified events**
hanging off it — and we want the pipeline that builds it to be a straight line: *ingest → enrich →
classify → store*, with no mid-stream "is this worthy?" discards.

---

## 2. What the pipeline does today (verified against code, 2026-06-26)

Two scanners ([`scan-window-a.ts`](../../server/jobs/data_v2/scan-window-a.ts) et al.) fetch the SFR
`/buyers/market` feed per MSA, filter it, and enqueue rows into `market_scan_queue`. The consumer
([`consumer.ts`](../../server/jobs/data_v2/consumer.ts)) drains the queue, enriching each property.

### 2.1 The three filters (where data is dropped)

| # | Filter | Stage | File | What it drops | Cost of the drop |
|---|---|---|---|---|---|
| 1 | **`cleanMarket`** — keep only records where buyer **or** seller is a flipping company | **Discovery** (scanner, pre-queue) | [`clean-market.ts:39`](../../server/jobs/data_v2/processes/clean-market.ts#L39) | Individual-to-individual market records — they never enter the queue, never become properties | This is a **throttle**, and it's load-bearing (see §2.3) |
| 2 | **New Construction** — drop a property if **any** tx in its history is `new construction` | **Semantics** (consumer step 3) | [`consumer.ts:226`](../../server/jobs/data_v2/consumer.ts#L226) | Whole property excluded + `markFailed` | Aggressive — see §2.4 |
| 3 | **Unresolved status** — drop a property if `resolveStatuses` returns `[]` | **Semantics** (consumer step 8) | [`consumer.ts:272`](../../server/jobs/data_v2/consumer.ts#L272) | Whole property excluded + `markFailed` | Drops legitimately-tracked properties — see §2.5 |

### 2.2 What is therefore in the DB today — the hidden invariant

Because of filter #1, **every property in our database has corporate activity somewhere in its
history.** That invariant is implicit, undocumented, and **many read queries quietly depend on it**
(§8). Filters #2 and #3 then carve additional, inconsistent holes in that set.

Note the inconsistency that bothers us: an individual-to-individual or non-arms-length transaction is
**rejected as a seed** (filter #1) but **kept as history** of any property we seed for another
reason — because the consumer stores the *full* transaction chain
([`get-transactions.ts:66-82`](../../server/jobs/data_v2/processes/get-transactions.ts#L66-L82),
[`insert-properties.ts:380-433`](../../server/jobs/data_v2/processes/insert-properties.ts#L380-L433)).
The same row is "garbage" or "signal" depending only on discovery path.

### 2.3 Why `cleanMarket` is load-bearing (the API-cost reality)

The consumer makes **one serialized `/properties/transactions` call per unique property**
([`get-transactions.ts:66-82`](../../server/jobs/data_v2/processes/get-transactions.ts#L66-L82)),
plus a shared batch lookup, with rate-limit delays between calls. This is exactly why throughput is
capped at **`MAX_PROPERTIES_PER_MSA = 5` per run**
([`consumer.ts:37`](../../server/jobs/data_v2/consumer.ts#L37)). `cleanMarket` is the throttle that
keeps the per-property API budget pointed at properties worth enriching. Removing it does **not**
"just store more rows" — it multiplies an already-saturated, rate-limited API spend and builds a
queue backlog the consumer can never drain. **The classic "store everything, filter at query time"
pattern works when ingestion is cheap; ours is metered and rate-limited, so that instinct does not
transfer to discovery.** (It *does* transfer to classification — see §3.)

### 2.4 The New Construction filter is more aggressive than it looks

Filter #2 drops a property if **any** transaction in its *full* history is New Construction. So a
new-build that is later flipped by a corporation — which *would* pass `cleanMarket` discovery — is
**still** permanently excluded, because its history contains the original builder sale. This
contradicts the intuition that "if it ever sells to a corporation it'll show up anyway." For New
Construction, it won't. That's almost certainly stricter than intended.

### 2.5 The unresolved-status filter drops real properties

`resolveStatuses` looks only at the **most-recent arms-length** transaction
([`resolve-status.ts:107-110`](../../server/jobs/data_v2/processes/resolve-status.ts#L107-L110)) and
returns `[]` when that transaction is between two non-corporate parties
([`resolve-status.ts:184`](../../server/jobs/data_v2/processes/resolve-status.ts#L184)). A property a
company flipped years ago and that has since traded between individuals has **corporate history** but
an individual most-recent transfer → empty status → **discarded**, even though it's a legitimately
tracked property. The discard is purely the consumer's choice; `resolveStatuses` itself doesn't
throw and even computes a `'in-renovation'` fallback it then doesn't use.

---

## 3. The core reframe: two jobs, two classification axes

**Separate discovery from semantics.** Discovery (filter #1) stays at ingestion because it's
expensive. Semantics (filters #2, #3) move to **classification at query time**, because deciding
what to *show* among data we already paid to pull should be a `WHERE`, not a `DELETE`.

And name the two **orthogonal** classification axes explicitly — conflating them is half the muddle:

| Axis | Question it answers | Example values | Stored today? |
|---|---|---|---|
| **`transactionType`** (WHAT kind of transfer) | What happened? | `arms length`, `non arms length`, `new construction`, `assignment`, `refi`, `heloc` | ✅ Yes — [`propertyTransactions.transactionType`](../../database/schemas/properties.schema.ts#L320). Read side already filters on it. |
| **`partyType`** (WHO transacted) | Was each side corporate or individual? | `corp_to_corp`, `individual_to_corp`, `corp_to_individual`, `individual_to_individual` | ❌ No — only **implicit** in whether `buyerId`/`sellerId` resolved to a company. |

The "type" you intuited is **Axis 2 (`partyType`)**. The key point that keeps this honest: it is
**largely a denormalization of signal we already compute** — `resolvePropertyIds` already sets
`buyerId`/`sellerId` to a company id or null
([`resolve-ids.ts:71-96`](../../server/jobs/data_v2/processes/resolve-ids.ts#L71-L96)), and a
resolved id means corporate (the companies table only holds flipping companies). We're making an
implicit signal explicit and durable — not inventing data.

---

## 4. Goals / non-goals

**Goals**
1. **Simpler consumer** — a straight line *ingest → enrich → classify → store*; remove the two
   mid-stream "worthiness" discards and their `markFailed` bookkeeping.
2. **Consistent dataset** — a property's membership and its transactions no longer depend on
   discovery path. One invariant, documented.
3. **Property-as-root foundation** — property is the canonical entity; transactions are classified
   events; companies are actors that appear in transactions. Documented in `apps.md`.
4. **More retained data** — keep New Construction and corporate-touched-but-unresolved-status
   properties instead of dropping them; lay the groundwork for broader coverage (§11).
5. **Explicit, indexable classification** — `partyType` so the read side filters on intent, not on
   `buyerId IS NULL` heuristics.

**Non-goals (explicitly deferred)**
- **Removing `cleanMarket` / blanket individual-to-individual ingestion.** Out of scope for the core
  plan; its cost and blast radius are documented in §8.2/§11 as the "expensive frontier."
- **Rewriting the read/query engine.** This is additive — a column, a backfill, and explicit filters
  where an invariant is being traded away. The tuned `propertyTransactions` indexes stay relevant.
- **Building the code-violation feature.** That's [`code-violation.md`](./code-violation.md); this
  plan only makes its coverage better.
- **Changing the chain-reconstruction / spread / ratio logic** — those already filter to arms-length
  internally ([`orderTransactions.ts`](../../server/utils/orderTransactions.ts)) and are robust to
  extra rows.

---

## 5. The three levers — the decision table

| Lever | Today | Proposed (core) | Why |
|---|---|---|---|
| **#1 `cleanMarket`** (discovery) | Discards i2i at seed | **KEEP unchanged** | API throttle; preserves the corporate-activity invariant → small read-side impact (§8.1) |
| **#2 New Construction** | Discards property | **CONVERT to classify-and-keep** | NC has its own `transactionType` already excluded from arms-length views; the property is real |
| **#3 Unresolved status** | Discards property | **CONVERT to a real status + keep** | Property has corporate history; status is an *attribute*, not a gate |
| **(new) `partyType`** | Implicit in `buyerId`/`sellerId` | **Materialize on each transaction** | Explicit, durable, indexable; foundation for clean queries + CV |

Net effect: **the consumer gets simpler and the dataset gets bigger and more consistent, while the
read side barely moves** — because lever #1 stays and keeps the invariant intact.

---

## 6. Target data model

### 6.1 `partyType` on `property_transactions` (Axis 2)

Add one column, computed at insert in [`insert-properties.ts`](../../server/jobs/data_v2/processes/insert-properties.ts)
(in `mapTransactionRow`, where `buyerId`/`sellerId` are already in hand):

```
property_transactions.party_type  varchar(24) NULL   -- 'corp_to_corp' | 'individual_to_corp'
                                                      -- | 'corp_to_individual' | 'individual_to_individual'
```

Derivation (pure function, unit-testable):

```
buyerCorp  = buyerId != null   (≡ isFlippingCompany(buyerName))
sellerCorp = sellerId != null  (≡ isFlippingCompany(sellerName))

both            → 'corp_to_corp'
buyer only      → 'individual_to_corp'      // corp ACQUIRED from an individual (typical acquisition)
seller only     → 'corp_to_individual'      // corp SOLD to an individual (exit / "sold")
neither         → 'individual_to_individual'
```

- **Index:** `(propertyId, partyType, recordingDate)` to support "this property's corporate
  transactions, newest first" and property-level rollups.
- **Durability note:** prefer the materialized column over re-deriving from `buyerId` at query time —
  `companies` is `onDelete: set null`
  ([`properties.schema.ts:315-317`](../../database/schemas/properties.schema.ts#L315-L317)), so a
  deleted company would silently erase the classification if we leaned on the FK alone.
- `partyType` is **orthogonal** to `transactionType`: a row can be `('arms length', 'individual_to_corp')`
  or `('new construction', 'individual_to_corp')`. Keep both.

### 6.2 Status becomes a derived attribute, not a gate (lever #3)

Stop dropping properties when `resolveStatuses` returns `[]`. Instead assign a defined fallback so
the property is stored and still findable. Today the status set is a closed union
([`shared/types/properties.ts:17`](../../shared/types/properties.ts#L17)):
`'in-renovation' | 'wholesale' | 'on-market' | 'sold'`.

**Open decision (§14-A):** what does an unresolved (or New Construction) property get? Candidates:
- **(a)** Derive `'sold'` when there's corporate history but the current owner is individual (the
  common "completed flip, now individually owned" case) — keeps it in an existing, meaningful bucket.
- **(b)** Add a new `'off-market'`/`'unknown'` status — requires a `statuses` lookup row + extending
  the `PropertyStatus` union + status filter UI.

This matters because the **map and grid filter *by* status**
([`apps.md` Views & Display](../docs/apps.md#L179)); a property with no recognized status is invisible
under every preset filter. So the fallback choice = the visibility choice. Recommendation: start with
**(a)** (no schema/UI churn), revisit if we want unresolved properties visibly distinct.

### 6.3 New Construction handling (lever #2)

Remove the step-3 discard. New Construction rows are already typed `new construction` and are already
excluded from every arms-length computation (`isArmsLength` is exact-match,
[`orderTransactions.ts:119`](../../server/utils/orderTransactions.ts#L119)), so **storing them does
not pollute spreads, ratios, or statuses.** The property gets whatever status §6.2 resolves. Optional
nicety: a `propertyType`/flag surfacing "new construction" for display; not required for correctness.

### 6.4 (Level-3 companion, deferred) property-level rollup

Only needed **if** lever #1 is ever relaxed (§11): a denormalized
`properties.has_corporate_activity boolean` (or `current_owner_type`) so the grid can cheaply exclude
pure-individual properties without a transaction join. **With `cleanMarket` kept this is always true,
so it's unnecessary now** — listed here so the option is on record.

---

## 7. Consumer changes (before → after)

**Before** (13 steps, two of them discards):
```
fetchQueue → markProcessing → batchLookup → getTransactions
  → [step 3: DROP New Construction]         ← remove
  → cleanTransactions → insertCompanies → resolvePropertyIds → resolveStatuses
  → [step 8: DROP unresolved status]        ← remove
  → cleanBeforeInsert → resolveArvFunded → insertProperties → … → markComplete/markFailed
```

**After** (straight line — enrich, classify, store):
```
fetchQueue → markProcessing → batchLookup → getTransactions
  → cleanTransactions → insertCompanies → resolvePropertyIds
  → resolveStatuses (now returns a fallback status, never a drop-signal)
  → classifyParties (new: stamp partyType per tx — or fold into insert-properties)
  → cleanBeforeInsert → resolveArvFunded → insertProperties → … → markComplete
```

Consequences:
- The `markFailed` paths for `"Property is New Construction"` and `"Couldn't Resolve Status"`
  disappear, shrinking the `failedSfrIds` bookkeeping at
  [`consumer.ts:316-322`](../../server/jobs/data_v2/consumer.ts#L316-L322) and reducing queue noise.
- Genuine failures (NOT_FOUND, partial batch, thrown errors) still `markFailed` — we're only removing
  the *semantic* discards, not error handling.

---

## 8. Read-side impact — and the invariant that bounds it

### 8.1 With `cleanMarket` KEPT (the core plan) — impact is small

Because lever #1 stays, **every property still has corporate activity**, and the only *new*
properties are New-Construction and unresolved-status ones that **still passed corporate discovery.**
So:
- Queries that filter by a **company** or by `buyerId/sellerId IS NOT NULL` (the company leaderboards,
  counts, "most bought/sold") are **naturally unaffected** — an individual transaction has null
  company ids and drops out on its own.
- Queries that filter by `transactionType = 'arms length'` are unaffected by New Construction (its
  type isn't arms length).
- The **grid's "current state" pick** (most-recent arms-length tx per property) is unchanged in
  meaning — a corp→individual "sold" property already shows the individual as current owner; that's
  correct.
- **The one thing to verify:** the new kept-properties get a sensible status (§6.2) so they appear
  where intended (and don't appear where they shouldn't). This is a *display/status* question, not a
  query-correctness break.

**Action for the core plan:** add `partyType` to the handful of queries that today lean on
`buyerId IS NOT NULL` as a proxy for "corporate," so intent is explicit and future-proof. Re-verify
the list in §8.3 during build — but none of these are *broken* by the core plan; they're *clarified*.

### 8.2 If `cleanMarket` were ALSO removed (Level 3 — NOT in core plan)

Then the invariant breaks: pure individual-to-individual properties enter, and **every read path that
assumed "all properties are corporate-relevant" needs an explicit classification filter or it will
surface homeowner-to-homeowner sales as if they were investor activity.** A read-side sweep
(2026-06-26) flagged ~9–12 such sites — recorded here so the cost of Level 3 is on the table:

| Area | File | Risk if i2i floods in |
|---|---|---|
| Grid `alSummary` / company filter / `hasDateSold` | `server/services/properties/properties.services.ts` | Grid fills with individually-owned homes; company match widens |
| Leaderboards using `sortOrder=1` (most-properties, wholesalers, buys-wholesale, company property count, acquisition chart) | `server/services/companies/companies.services.ts` | Counts inflate with non-corporate final owners |
| Map pins (date-range + company) | `server/services/properties/maps.services.ts` | Map shows non-investor sales |
| Zip counts (date-range + company) | `server/services/properties/zipCounts.services.ts` | Zip aggregates inflate |
| Top-buyers-by-zip | `server/services/deals/deals.services.ts` | Inflated; also a latent `'Arms Length'` case-sensitivity bug noted in passing |

These line references are from a sweep and **must be re-verified** at implementation time. The point
stands regardless of exact lines: **Level 3's cost is real and broad; the core plan avoids paying it
by keeping lever #1.**

### 8.3 Minimal explicit-filter list for the core plan

Even with the invariant intact, make these read intent explicit by adding `partyType` (low-risk,
high-clarity): the `sortOrder=1` "current owner" leaderboard/count queries in `companies.services.ts`
and the acquisition chart (which has no type filter today). Treat as a clarity pass, not a fix.

---

## 9. Migration & backfill

1. **Schema:** add `property_transactions.party_type` + the index in
   [`properties.schema.ts`](../../database/schemas/properties.schema.ts). **Use a targeted
   `ALTER TABLE`, not `npm run db:push`** — push currently wants to truncate `market_scan_queue`
   (known drift; run DB ops from the main repo, no `.env` in worktrees).
2. **Backfill `party_type` for existing rows** — derivable in pure SQL from existing columns:
   ```sql
   UPDATE property_transactions SET party_type = CASE
     WHEN buyer_id IS NOT NULL AND seller_id IS NOT NULL THEN 'corp_to_corp'
     WHEN buyer_id IS NOT NULL                           THEN 'individual_to_corp'
     WHEN seller_id IS NOT NULL                          THEN 'corp_to_individual'
     ELSE 'individual_to_individual' END;
   ```
   (Name-based fallback for rows whose company was later deleted is optional; the FK is the primary
   signal.)
3. **No backfill needed for the dropped properties** — they were never stored. They re-enter
   naturally as the scanners re-encounter their MSAs, or via a one-off re-scan once levers #2/#3 are
   converted.
4. **Status backfill** only if §14-A picks option (b) (new status value) — seed the `statuses` row.

---

## 10. Rollout sequence (order matters)

Do it in this order so we never briefly show mis-tagged data:

1. **Add `party_type` column + index** (additive; nothing reads it yet).
2. **Stamp `party_type` at insert** + **backfill** existing rows. Now the column is trustworthy.
3. **Add explicit `partyType` clarity filters** to the §8.3 queries — *before* changing what's stored,
   so the read side is ready.
4. **Convert lever #2 (New Construction) to classify-and-keep.**
5. **Convert lever #3 (unresolved status) to a fallback status** (§6.2 decision).
6. **Update docs** (§13) and **add tests** (§12).
7. **Observe** one full scan+consume cycle; confirm New-Construction/unresolved properties land with
   sane statuses and the grid/map/leaderboards look right.

Lever #1 (`cleanMarket`) is **not** touched in this sequence.

---

## 11. "More data," done efficiently — coverage without blanket ingestion

The biggest "more data" lever (every individual-to-individual property) is also the most expensive
(§2.3) and the highest-risk (§8.2). Two efficient paths get the breadth where it actually pays off —
choose per use case (§14-B):

- **On-demand hydration (recommended for code violations).** When a complaint address (or a user's
  search) doesn't match a property we have, run **that one address** through the existing
  enrich-and-store pipeline. Bounded, high-value, reuses everything. The violation feed is itself a
  pre-qualified worklist of "individual-owned properties worth a record."
- **Cheap-breadth transaction ledger (optional).** The scanners *already fetch* the full
  `/buyers/market` feed and then throw most of it away **before** it costs a per-property API call —
  `cleanMarket` runs pre-queue. We could persist **all** market records (address, buyer, seller, date,
  value) as a lightweight, address-keyed **transaction ledger**, and only **promote** corporate-touched
  ones to full property enrichment. This buys breadth (every recorded sale, matchable by address) at
  near-zero extra API cost, and it cleanly expresses the property-vs-transaction split at the data
  layer: **enriched properties are the depth; the ledger is the breadth; an unpromoted ledger row is a
  transaction with an address but no property yet.**

Both avoid the §2.3 throughput wall. Blanket removal of `cleanMarket` (eager full enrichment of
everything) remains the thing we are **not** doing.

---

## 12. Testing (per [`testing.md`](../docs/standards/testing.md))

- **Unit — `classifyParties` / `party_type` derivation:** all four combinations, plus null/empty
  names and the trust edge case (`isFlippingCompany` excludes trusts,
  [`dataSyncHelpers.ts:97`](../../server/utils/dataSyncHelpers.ts#L97)).
- **Unit — status fallback:** a property whose most-recent arms-length tx is individual-to-individual
  but with corporate history resolves to the §6.2 fallback (not `[]`/drop).
- **Integration — consumer:** a New-Construction property and an unresolved-status property are now
  **inserted** (not `markFailed`), with correct `party_type` on their transactions.
- **Integration — read side:** the §8.3 queries return identical results before/after the clarity
  filters on today's data (proves the filters are intent-preserving, not behavior-changing, while the
  invariant holds).

---

## 13. Docs to update (Agent Updater scope)

- **`apps.md` (Data section)** — state the property-as-root model and the two classification axes;
  correct the **stale pipeline paths** (it references `server/jobs/consumer.ts`; the real path is
  `server/jobs/data_v2/consumer.ts`) and the "New Construction excluded / unresolved status excluded"
  key-behaviors lines once levers #2/#3 change
  ([`apps.md:244-247`](../docs/apps.md#L244)).
- **`database.md`** — document `property_transactions.party_type` + index.
- **`api.md`** — only if any response shape gains `partyType` (e.g. transaction lists).
- **`access-control.md`** — no change expected (no new routes in the core plan).

---

## 14. Open decisions (the product calls before build)

- **A — Unresolved/New-Construction status fallback:** option (a) derive `'sold'`/existing bucket
  *(recommended)*, or (b) add a new `'unknown'`/`'off-market'` status (schema + UI). Drives visibility
  (§6.2).
- **B — Breadth strategy for coverage:** on-demand hydration *(recommended, esp. for CV)*, the
  cheap-breadth ledger, both, or neither for now (§11).
- **C — Keep `cleanMarket`?** Recommended **yes** (core plan assumes it). Only revisit with a separate,
  resourced ingestion strategy — not a one-line filter removal (§2.3, §8.2).
- **D — `partyType` value names / granularity:** the four-value set above, or also split out
  `non_arms_length`/trust transfers? (Recommend keeping `partyType` purely about corporate-ness and
  leaving transfer kind to `transactionType`.)

---

## 15. Risks

- **Status visibility:** kept properties with a poor fallback status could clutter or hide oddly in the
  grid/map (mitigated by §6.2 / decision A).
- **Re-scan churn:** converting levers #2/#3 means previously-failed queue rows and un-ingested
  properties re-enter over subsequent scans — expect a one-time bump in inserts and a (small) storage
  increase, bounded by the corporate-activity invariant.
- **Backfill correctness:** `party_type` backfill trusts `buyer_id`/`seller_id`; rows whose company was
  deleted (`set null`) backfill as individual. Acceptable; name-based re-derivation is an optional
  refinement.
- **Scope creep into Level 3:** the breadth options in §11 are deliberately separate; don't let "get
  more data" quietly become "remove `cleanMarket`" without pricing §8.2.

---

## Appendix — key files

| Concern | File |
|---|---|
| Discovery filter | [`clean-market.ts`](../../server/jobs/data_v2/processes/clean-market.ts) |
| Consumer + the two discards | [`consumer.ts`](../../server/jobs/data_v2/consumer.ts) (steps 3 & 8) |
| Per-property API cost | [`get-transactions.ts`](../../server/jobs/data_v2/processes/get-transactions.ts) |
| Buyer/seller → company resolution (the `partyType` signal) | [`resolve-ids.ts`](../../server/jobs/data_v2/processes/resolve-ids.ts) |
| Status resolution (the §6.2 change) | [`resolve-status.ts`](../../server/jobs/data_v2/processes/resolve-status.ts) |
| Transaction insert (where `partyType` is stamped) | [`insert-properties.ts`](../../server/jobs/data_v2/processes/insert-properties.ts) |
| Corporate detection | [`dataSyncHelpers.ts`](../../server/utils/dataSyncHelpers.ts) |
| Arms-length / spread / ratio (robust to extra rows) | [`orderTransactions.ts`](../../server/utils/orderTransactions.ts) |
| Schema (`property_transactions`, `statuses`) | [`properties.schema.ts`](../../database/schemas/properties.schema.ts), [`statuses.schema.ts`](../../database/schemas/statuses.schema.ts) |
| Status union | [`shared/types/properties.ts`](../../shared/types/properties.ts) |
| Read-side consumers (Level-3 blast radius) | `properties.services.ts`, `companies.services.ts`, `maps.services.ts`, `zipCounts.services.ts`, `deals.services.ts` |
| Companion feature | [`code-violation.md`](./code-violation.md) |
