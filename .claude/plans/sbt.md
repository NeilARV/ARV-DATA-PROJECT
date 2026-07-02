# Supplemental Tax Bill (SBT) — Design & Plan

> Status: **Design / planning only. No code written yet.**
> Scope: **California properties only** for v1 (see §1 for why this is correct, not just a cut).
> Owner decisions captured in §0; open items flagged in §9.

---

## 0. Decisions (locked)

| # | Decision | Choice | §  |
|---|----------|--------|----|
| 1 | Where the result is stored | **New `supplemental_tax_bills` table**, keyed to the triggering transaction | §5 |
| 2 | Where/when it's computed | **New step in the data pipeline**, after `insertProperties` | §6 |
| 3 | Tax rate | **Flat statewide CA constant** (single named constant, per-county-ready) | §4.2 |
| 4 | Proration | **Full CA model** — month-of-event factor table + the Jan–May two-bill rule | §4.3 |
| 5 | State scope | **CA-only, extensible** — per-state strategy seam; non-CA returns nothing | §1, §4.1 |
| 6a | Prior assessed value source | Most recent `assessments.assessed_value` at/before the sale year; **fallback** = prior transaction's sale price | §4.4 |
| 6b | Which transactions qualify | **Arm's-length change-of-ownership only** (same signal the pipeline already uses) | §4.5 |
| 7 | Refunds (sale ≤ prior value) | **Typed, not negative** — `bill_type` of `bill` \| `refund`; `amount`/`net` stored as **positive magnitudes** | §4.1, §5 |
| 8 | History coverage | Compute for **every** qualifying transaction we can resolve, not just the most recent sale | §4.5 |

> **Storage is a NEW table, `supplemental_tax_bills` (§5). Nothing is added to `property_transactions`** — the new table only *references* it via FK. (Noting this explicitly to remove the lingering uncertainty.)

---

## 1. What a supplemental tax bill actually is (and why CA-only is correct)

The supplemental tax bill is a **California** construct, created by the legislation implementing **Proposition 13**. In CA a property's assessed value is frozen near its purchase price and may rise only ~2%/yr — *until ownership changes or new construction completes*, when it's reassessed to current market value (≈ the new purchase price). The **supplemental** bill charges the owner for that jump in assessed value, for the **remaining portion of the fiscal year** in which the event occurred.

The other states we operate in do **not** issue supplemental bills in this sense:

| State | Reassessment model | Supplemental bill? |
|-------|--------------------|--------------------|
| **CA** | Frozen base year value; reassess on change of ownership / new construction | **Yes** — this feature |
| WA | Annual revaluation to market | No |
| FL | Reassess each Jan 1 under "Save Our Homes" cap | No |
| CO | Biennial reassessment | No |

**Implication:** gating to CA is *semantically correct*, not merely a v1 shortcut. The calculator returns **no bills** for non-CA properties. We still structure the code as a per-state strategy (§4.1) so that if a state-specific equivalent is ever modeled, it slots in without a rewrite — but there is genuinely nothing to compute for WA/FL/CO today, and inventing "supplemental-like" numbers for them would be misleading data.

---

## 2. Worked example (the one from the brief)

- 2016: bought for **$100,000** → base year value ≈ $100k, drifting up ~2%/yr under Prop 13.
- 2026: sells for **$1,000,000** → reassessed to $1,000,000.
- Prior assessed value on the roll in 2026 ≈ **$122,000** (100k grown ~2%/yr for 10 yrs).
- **Net supplemental value** = 1,000,000 − 122,000 = **$878,000**.
- Flat rate (illustrative) **1.25%** → full-year supplemental = $10,975.
- Sale in **August 2026** → proration factor **0.92** (≈11/12 of the fiscal year left).
- **Supplemental bill ≈ $10,975 × 0.92 = $10,097** for FY 2026–27.
- (If instead the sale were in, say, **March**, it would produce **two** bills — see §4.3.)

---

## 3. Architecture at a glance

```
                          PURE (shared, isomorphic, no I/O)
  shared/utils/supplementalTax.ts
    calculateSupplementalTax(input) -> SupplementalTaxBill[]     <- all the math, CA gate, proration
      \___ tested in isolation: tests/shared/utils/supplementalTax.test.ts

                          IMPURE (server, pipeline)
  server/jobs/data_v2/processes/insert-supplemental-tax.ts
    insertSupplementalTaxBills({ properties, msa })              <- selects qualifying tx, resolves
      - reads inserted arm's-length transactions (+ IDs)           prior value, calls the pure util,
      - reads prior assessed value                                 writes rows
      - calls calculateSupplementalTax(...)
      - inserts into supplemental_tax_bills
      \___ tested against a DB: tests/server/api/.../supplemental-tax.integration.test.ts

                          consumer.ts (orchestration)
    ... insertProperties -> [NEW] insertSupplementalTaxBills -> updateArvClientCompanies ...
```

**Why split pure vs impure:** the arithmetic (net value, proration factor, two-bill rule, CA gate) is a pure function that's trivially unit-tested with no DB. The pipeline step owns only *selection* (which transactions qualify) and *persistence*. This matches the existing `data_v2/processes/*` convention where each file is one discrete step.

---

## 4. The calculation

### 4.1 Pure function contract (`shared/utils/supplementalTax.ts`)

```ts
/** Flat statewide CA supplemental rate for v1 (1% Prop-13 base + typical local add-ons).
 *  Single source of truth; swap for a per-county lookup later without touching callers. */
export const CA_SUPPLEMENTAL_TAX_RATE = 0.0125; // confirm exact value in §9

export interface SupplementalTaxInput {
  state: string | null | undefined;   // gate — only 'CA' yields bills
  priorAssessedValue: number;          // prior roll value (see §4.4)
  newBaseValue: number;                // sale price / new construction value
  saleDate: string | Date;             // event date (change of ownership)
  taxRate?: number;                    // defaults to CA_SUPPLEMENTAL_TAX_RATE
}

export type SupplementalBillType = 'bill' | 'refund';

export interface SupplementalTaxBill {
  fiscalYear: number;              // starting calendar year of the FY (2026 => FY 2026-27)
  billType: SupplementalBillType;  // 'bill' when value went up, 'refund' when it went down
  netSupplementalValue: number;    // |newBaseValue - priorAssessedValue| — POSITIVE magnitude
  taxRate: number;
  prorationFactor: number;         // 0..1 (1.00 for the second, full-year bill)
  amount: number;                  // round(netSupplementalValue * taxRate * prorationFactor) — POSITIVE
}

/** Returns 1 result (event Jun–Dec), 2 (event Jan–May), or [] when not applicable. */
export function calculateSupplementalTax(input: SupplementalTaxInput): SupplementalTaxBill[];
```

**Sign handling (refunds):** the raw difference `newBaseValue − priorAssessedValue` may be negative when a property sells at/below its prior assessed value — CA issues a *negative supplemental* (a refund). Rather than storing negatives, the function sets `billType = 'refund'` and stores `netSupplementalValue`/`amount` as **positive magnitudes** (`Math.abs`). `billType = 'bill'` when the difference is positive. The two-bill Jan–May rule (§4.3) applies symmetrically — a Jan–May refund produces two `refund` rows.

**Returns `[]` when:** `state !== 'CA'`; `saleDate` is missing/unparseable; or the difference is exactly `0` (nothing to bill or refund).

The per-state seam is just this function branching on `state`; a future `WA`/etc. strategy would be a sibling branch/module, not a change to callers.

### 4.2 Tax rate

Flat constant `CA_SUPPLEMENTAL_TAX_RATE`. Within CA the *rate* varies slightly by county / tax-rate-area (1% base + local voter add-ons, ~1.1–1.25%), but the **proration schedule is statewide law and does not vary by county**. Because the rate is flat for v1, county doesn't affect the number yet. Later a `rateForCounty(county)` lookup replaces the constant — the `taxRate` field is already persisted per row (§5) so historical bills stay reproducible.

### 4.3 Proration (fiscal year Jul 1 – Jun 30)

Only a *slice* of the fiscal year remains after a mid-year sale, so the full-year supplemental is multiplied by a **proration factor** = months remaining in the fiscal year ÷ 12. This is the standard BOE / county-estimator table (event month → factor):

| Event month | Months left | Factor |
|-------------|-------------|--------|
| July        | 12 | 1.00 |
| August      | 11 | 0.92 |
| September   | 10 | 0.83 |
| October     | 9  | 0.75 |
| November    | 8  | 0.67 |
| December    | 7  | 0.58 |
| January     | 6  | 0.50 |
| February    | 5  | 0.42 |
| March       | 4  | 0.33 |
| April       | 3  | 0.25 |
| May         | 2  | 0.17 |
| June        | 1  | 0.08 |

Implement as `factor = monthsRemaining / 12` (months counted from the event month through June inclusive), storing the exact fraction; the table above is the human-readable/reference form. (BOE's published factors are rounded to 2 decimals — confirm in §9 whether to match the rounded county figures or keep the exact fraction.)

**The two-bill rule (Jan–May):** when the event occurs **January 1 – May 31**, the *next* fiscal year's regular roll was already set at the old value (lien date Jan 1), so the county issues **two** supplemental bills:

1. **Current FY** — prorated by the factor above.
2. **Next FY** — factor **1.00** (full year), `fiscalYear = currentFY + 1`.

Events **June–December** produce a **single** bill. So `calculateSupplementalTax` returns a 1- or 2-element array — the reason storage is a table (§5), not columns. The rule is sign-agnostic: a Jan–May **refund** likewise produces two `refund` rows.

**Fiscal-year labeling:** event month Jul–Dec → `fiscalYear = eventYear`; event month Jan–Jun → `fiscalYear = eventYear − 1`. Second bill = `fiscalYear + 1`.

### 4.4 Prior assessed value (the "previous assessed value" input)

Resolution order, per qualifying transaction:

1. **`assessments.assessed_value`** — most recent row with `assessed_year <= sale year`. Preferred: it's the actual roll value.
2. **Prior transaction's `sale_price`** — the immediately preceding transaction in the property's history (fallback when no assessment row predates the sale).
3. **Skip** — if neither is available, no bill (record why; see §9 on observability).

Persist which source was used (`prior_value_source`) so a bill is auditable. **Caveat:** SFR's assessment history is shallow, so bills for older historical transactions will more often fall back to (2) or be skipped — accuracy is best for recent sales. Flagged in §9.

### 4.5 Which transactions qualify

A supplemental event is an **arm's-length change of ownership**. Refis, HELOCs, and other non-arm's-length transactions do **not** trigger one. The pipeline already distinguishes real sales (`transaction_type`, and the `resolve-status` / arm's-length logic) — the new step reuses that exact signal rather than inventing a second definition. Non-qualifying transactions simply produce no row.

**Coverage — every qualifying transaction, not just the latest.** We compute a bill for *every* arm's-length transaction in a property's history that we can resolve a prior value for (§4.4), so the table becomes a running record/estimate of what each owner paid over time. Two consequences to keep in mind: (a) accuracy degrades for older transactions where SFR's shallow assessment history forces the prior-transaction fallback or a skip; (b) because the pipeline continually appends new transactions to properties, freshly-synced sales get their bills automatically on the run that inserts them.

---

## 5. Schema — `supplemental_tax_bills`

New table in `database/schemas/properties.schema.ts` (it belongs with the property/transaction cluster). Types **derived** via `$inferSelect`/`$inferInsert` per the DB rules; money as `decimal(15,2)` to match `property_transactions`.

| Column | Type | Constraints |
|--------|------|-------------|
| `supplemental_tax_bills_id` | `serial` | PK |
| `property_id` | `uuid` | NOT NULL, FK → `properties.id` (cascade) |
| `property_transaction_id` | `integer` | NOT NULL, FK → `property_transactions.property_transactions_id` (cascade) |
| `fiscal_year` | `integer` | NOT NULL — starting year (2026 = FY 2026-27) |
| `bill_type` | `supplemental_bill_type` enum | NOT NULL — `bill` \| `refund` (see below) |
| `prior_assessed_value` | `decimal(15,2)` | nullable |
| `new_base_value` | `decimal(15,2)` | NOT NULL — sale price / new construction value |
| `net_supplemental_value` | `decimal(15,2)` | NOT NULL — **positive magnitude** (`\|new − prior\|`) |
| `tax_rate` | `decimal(6,4)` | NOT NULL — e.g. `0.0125` |
| `proration_factor` | `decimal(5,4)` | NOT NULL — e.g. `0.9167` |
| `amount` | `decimal(15,2)` | NOT NULL — **positive magnitude**; direction is in `bill_type` |
| `prior_value_source` | `varchar(20)` | NOT NULL — `assessment` \| `prior_transaction` |
| `created_at` | `timestamp` | NOT NULL, default now |
| `updated_at` | `timestamp` | default now |

**New enum** `supplemental_bill_type` = `bill` \| `refund` (add to `properties.schema.ts` and the enums table in `database.md`). `bill` = reassessed value rose (owner owes); `refund` = value fell (owner is credited). **No negative numbers are stored** — `amount` and `net_supplemental_value` are always ≥ 0 and the sign lives in `bill_type`. This keeps SUM/AVG aggregations honest (filter or group by `bill_type`) and makes "show me refunds" a plain `WHERE`.

**Unique:** `(property_transaction_id, fiscal_year)` — at most the current + next-FY pair per event; also makes recompute idempotent.
**Indexes:** `idx_sbt_property_id` on `(property_id)`; `idx_sbt_transaction_id` on `(property_transaction_id)`.

**Why a table, not columns on `property_transactions`:** (a) the Jan–May rule means one transaction → up to **two** bills — a 1:N relationship a column can't hold; (b) the app is transaction-based and **not every transaction is arm's-length**, so most transactions would carry null columns — a child table means rows exist *only* for real events; (c) it persists the full breakdown (prior value, net, rate, factor, source) so every `amount` is reproducible/auditable.

**Lifecycle note:** `insertProperties` wipes and re-inserts a property's pipeline transactions each sync, so the FK (cascade) drops old bills automatically; the new step recomputes fresh ones. No stale rows, no manual cleanup.

---

## 6. Pipeline integration

New step file `server/jobs/data_v2/processes/insert-supplemental-tax.ts`, exporting `insertSupplementalTaxBills({ properties, msa })`, wired into `consumer.ts` **after Step 11 (`insertProperties`)** — because the bills FK to transaction IDs that only exist post-insert:

```
Step 11  insertProperties            (existing — inserts transactions, assigns IDs)
Step 12  insertSupplementalTaxBills  (NEW)
Step 13  updateArvClientCompanies    (existing, renumbered)
Step 14  updatePurchaseToArvRatios   (existing, renumbered)
```

Per property the step:
1. Skips unless the address `state === 'CA'` (cheap gate before any work).
2. Loads that property's inserted **arm's-length** transactions (with IDs, `sale_price`, `sale_date`), newest→oldest.
3. Resolves `priorAssessedValue` per transaction (§4.4).
4. Calls `calculateSupplementalTax(...)` → 0–2 rows (`bill` or `refund`).
5. Inserts rows with `onConflictDoNothing`/upsert on `(property_transaction_id, fiscal_year)` for idempotency.

It performs no external API calls (all inputs are already in the DB after Step 11). Per-property failures are logged and skipped without aborting the batch, matching the pipeline's existing per-item resilience.

> **Alternative considered:** compute inline inside `insertProperties` right after the transaction insert (saves a re-read). Rejected for v1 to keep `insertProperties` single-responsibility and the new logic independently testable; revisit only if the extra read shows up as a real cost.

---

## 6b. One-time backfill (required)

The Step 12 pipeline logic only computes bills for properties **processed in a consumer run**. Every property and transaction **already in the database** would otherwise have no supplemental rows until it happens to re-sync — which for older properties may be never. So a **one-time backfill script** is a required deliverable, not an afterthought. It's also the mechanism for **re-applying a rate or logic change** across all historical rows (ties to the flat-rate revisit in §9).

**No duplicated math.** Extract the per-property routine — *select qualifying arm's-length transactions → resolve prior value (§4.4) → call `calculateSupplementalTax` → upsert rows* — into a shared function, e.g. `computeSupplementalTaxForProperty(propertyId)`, in `insert-supplemental-tax.ts`. **Both** Step 12 and the backfill call it, so there is exactly one implementation and no drift.

**Script:** `server/jobs/data_v2/backfill-supplemental-tax.ts` (standalone runnable via an `npm run` entry, following the existing job conventions). It:
1. Pages through **CA** properties in batches (keyset by `properties.id`) so it never loads the whole table at once.
2. Runs `computeSupplementalTaxForProperty` for each.
3. Is **idempotent** — the `(property_transaction_id, fiscal_year)` unique constraint + `onConflictDoNothing` means it's safe to re-run and resumable if interrupted.
4. Optional `--recompute` mode: delete-then-reinsert a property's rows so a **rate/logic change** actually overwrites existing amounts (plain re-run won't, because of the conflict guard).
5. Logs totals: properties scanned, `bill`/`refund` rows written, transactions skipped (no prior value / zero-diff / non-CA).

Because backfill and the live pipeline share the same routine and the same idempotency key, running the backfill while the consumer is active is safe (at worst a no-op conflict).

---

## 7. Files to add / touch

**Add**
- `shared/utils/supplementalTax.ts` — pure calculator + `CA_SUPPLEMENTAL_TAX_RATE`.
- `server/jobs/data_v2/processes/insert-supplemental-tax.ts` — pipeline step + shared `computeSupplementalTaxForProperty`.
- `server/jobs/data_v2/backfill-supplemental-tax.ts` — one-time/re-runnable backfill (§6b); add an `npm run` entry.
- `tests/shared/utils/supplementalTax.test.ts` — unit tests.
- `tests/server/.../supplemental-tax.integration.test.ts` — DB/integration tests.
- Drizzle migration for `supplemental_tax_bills` (via `npm run db:push`).

**Touch**
- `database/schemas/properties.schema.ts` — table definition.
- `database/types/*` — derived types (if a `SupplementalTaxBill` row type is exported).
- `server/jobs/data_v2/consumer.ts` — insert Step 12, renumber comments.
- Docs (via the agent-updater flow): `.claude/docs/database.md` (new table), `.claude/docs/apps.md` (Data section — mention SBT), and any pipeline description.

**Read first (per CLAUDE.md):** `.claude/docs/standards/typescript.md`, `.claude/docs/standards/express.md` (`DB.*` for the schema), `.claude/docs/standards/testing.md`, and the Data section of `.claude/docs/apps.md`.

---

## 8. Testing plan

**Unit — `calculateSupplementalTax` (no DB, the correctness core):**
- Non-CA state → `[]` (WA/FL/CO/null).
- Difference exactly `0` → `[]`; missing/invalid `saleDate` → `[]`.
- Value rose → `billType: 'bill'`, positive `amount`/`netSupplementalValue`.
- Value fell (refund) → `billType: 'refund'`, `amount`/`netSupplementalValue` are **positive magnitudes** (never negative).
- Each event month → correct proration factor (all 12 rows of the §4.3 table).
- Jan–May event → **two** rows; second is factor 1.00 and `fiscalYear + 1` (verify for both a `bill` and a `refund`).
- Jun–Dec event → exactly **one** row.
- Fiscal-year labeling across the Jan/Jul boundary.
- `amount` math and rounding; default rate vs explicit `taxRate` override.
- The worked example from §2 lands on the expected number.

**Integration — pipeline step (against the test DB, `vitest.integration.config.ts`):**
- Property with a CA arm's-length transaction + prior assessment → bill(s) inserted with correct values, `bill_type = 'bill'`, and `prior_value_source = 'assessment'`.
- Sale below prior assessed value → row with `bill_type = 'refund'` and positive `amount`.
- Prior assessment absent but prior transaction present → `prior_value_source = 'prior_transaction'`.
- Multiple qualifying transactions on one property → a row set per transaction (coverage, §4.5).
- Non-arm's-length transaction → no rows.
- Non-CA property → no rows.
- Re-running the step is idempotent (unique constraint; no duplicates).
- Deleting the transaction cascades the bill (FK behavior).

> Per testing standards, test generation is a **separate `/test` pass** — this section is the spec for it, not code to write inline while building.

---

## 9. Design decisions we made (revisit candidates)

These are **deliberate choices for v1**, not unknowns — recorded here so they're easy to find and reconsider once we have real data or new requirements. Each is a simplification we consciously accepted.

| Decision | What we chose | Why it may need revisiting | Where it lives |
|----------|---------------|----------------------------|----------------|
| **Flat statewide rate** | One constant `CA_SUPPLEMENTAL_TAX_RATE` (~1.25%) for all CA properties | Real rates vary by county / tax-rate-area (1% base + local add-ons). If estimates drift from actual bills, move to a per-county rate table — the per-row `tax_rate` column already makes old bills reproducible. | §4.2, §5 |
| **CA-only** | Compute bills only for `state === 'CA'`; other states return nothing | Supplemental bills are a CA/Prop-13 construct today. If we ever model a state-specific equivalent, add a strategy branch — the code seam is already there. | §1, §4.1 |
| **Refund via `bill_type`, no negatives** | Positive magnitudes + `bill` \| `refund` discriminator | If a consumer ever expects a signed value, it derives `sign = bill_type === 'refund' ? -1 : 1`. Chosen over negatives for clean aggregation. | §4.1, §5 |
| **Compute for every qualifying transaction** | A bill per resolvable arm's-length transaction across full history | Older transactions lean on the weaker prior-transaction fallback; if that noise matters, we may cap to recent sales or flag low-confidence rows. | §4.4, §4.5 |
| **Prior value = assessment, then prior sale** | Two-tier resolution, else skip | SFR assessment history is shallow; a better prior-value source (or the Prop-13 ~2%/yr factoring) would improve historical accuracy. | §4.4 |
| **Pipeline step, not inline / not on-demand** | Separate Step 12 after `insertProperties` | If the extra per-property read becomes a measurable cost at scale, fold it into `insertProperties`. | §6 |

## 9b. Still genuinely open — confirm before build

1. **Exact flat rate value.** 1.25% vs 1.1% vs another figure to standardize on.
2. **Proration precision.** Store the exact `monthsRemaining/12` fraction, or match BOE's published 2-decimal rounded factors (county bills use the rounded ones)?
3. **Event date field.** Use `sale_date` as the change-of-ownership date (fallback `recording_date`)? CA keys off the transfer date, which is `sale_date`.
4. **Observability.** Log a count of skipped transactions (no prior value, zero-diff, non-CA) in the consumer summary, or skip silently?
5. **Surfacing (out of scope here).** Whether/how the SBT is later exposed via the properties API / property detail UI and the user notification the brief mentioned. This design stops at *generating and storing* the bill.

---

## 10. Phased build order (once §9b is confirmed)

1. **Schema** — add `supplemental_tax_bills` + migration (`db:push`), update `database.md`.
2. **Pure util** — `supplementalTax.ts` + full unit test suite (green before touching the pipeline).
3. **Pipeline step** — `insert-supplemental-tax.ts` (incl. the shared `computeSupplementalTaxForProperty`), wire Step 12 into `consumer.ts`.
4. **Integration tests** — via `/test`.
5. **Verify** — `npm run check`, run the consumer against a small `MAX_PROPERTIES_PER_MSA` on CA MSAs (San Diego/LA/SF), eyeball rows.
6. **Backfill** — `backfill-supplemental-tax.ts` (§6b); run once over existing CA properties after the step is verified.
7. **Docs** — agent-updater pass for `database.md` / `apps.md`.
```
