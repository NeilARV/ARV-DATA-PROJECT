# Property Code-Violation Alerts — MVP Plan

> **Status:** Plan / pre-build. Scope locked to **City of San Diego code-enforcement
> complaints**, **manual CSV upload** as the acquisition method, and a **two-phase rollout**
> (Phase 1: match + land in-app for admin review; Phase 2: notify users by email + bell).
>
> **This document deliberately contains two implementation plans for the same feature** —
> **Plan A (monorepo / Express)** and **Plan B (AWS)**. The *design, data model, matching logic,
> and notification logic are identical*; only the **runtime, trigger, and deploy target** differ.
> Read §4 (shared design) first — it applies to both — then pick a lane in §5/§6/§7.
>
> **Three-day prototype goal.** Plan A reaches a working prototype fastest because it reuses what
> we already run. Plan B is the better long-term home but front-loads setup we've never done
> before. A reasonable play: **build the prototype on Plan A, present the AWS migration case at the
> Tuesday meeting** as the long-term direction.

---

## 1. The idea in one paragraph

The City of San Diego publishes code-enforcement complaints (barking dogs through
substandard-housing and unpermitted-work cases) on its public Accela portal. We already know,
in our own database, **which company owns which property** and **which users belong to which
company**. So we can take the city's complaint feed, **match each complaint's address to a
property we track**, resolve that property to its **owning company → linked users**, and **alert
those users the moment a complaint is filed** — potentially before the city itself notifies the
owner. The original driver: we lend to companies renovating properties, and a code violation can
blow up a flip or a loan; warning them early is real value.

---

## 2. Scope (what the MVP is and is not)

**In scope**
- One city: **San Diego** (the Accela "Code Enforcement" tab).
- One acquisition method: **admin downloads the CSV, uploads it through our app** (no scraping, no
  API — see §3 for why).
- **Address-string matching** against our `addresses` table (the CSV has no APN — see §3).
- **Phase 1:** parse → match → resolve owner → **land matched complaints in an admin review
  screen, read-only.** No user-facing alerts yet.
- **Phase 2 (immediately after):** turn matches into **in-app (bell) + email** alerts to the
  owning company's users.

**Out of scope (post-MVP — see §8)**
- Automated acquisition (scraping Accela / official data feed).
- Other cities / MSAs.
- "Nearby property" radius alerts, entity-standing (SOS/FTB) monitoring, tax-delinquency
  monitoring. (These were explored in earlier drafts; they are deferred and become *additional
  parsers/adapters on the same spine*, not new pipelines.)

---

## 3. Verified findings (read before trusting any earlier draft)

These were checked against the live sources and our actual schema on **2026-06-26**.

### 3.1 There is **no live public API** for *current* San Diego CE data
An earlier draft claimed the OpenDSD API backs the Accela portal and should be the primary source.
**That is wrong / unsafe to rely on:**
- The official open-data set ([data.sandiego.gov](https://data.sandiego.gov/datasets/code-enforcement-violations/))
  is **frozen** — it covers cases *"reported… prior to January 2018… closed out between 2015 and
  2018"* and itself defers to OpenDSD for newer data. (It *does* carry `apn`, `lat`, `lng` — but
  it's 8 years stale.)
- **OpenDSD** ([opendsd.sandiego.gov](https://opendsd.sandiego.gov/web/cecases/)) carries a
  `2023_1220` version stamp and uses **integer** case numbers (`/CECases/Details/232744`). Our
  live records are `CE-0542079` / `26TMP-050225` — a **different numbering scheme**, the signature
  of a system the city migrated *off* when code enforcement moved to the **Accela ACA portal** we
  actually use.

**Conclusion:** the live source is **Accela**, and Accela exposes only a **CSV download** (no
documented public API). Manual download → upload is the pragmatic MVP. The eventual automation
target is **scraping Accela** (or a formal city data request) — *not* "call OpenDSD."

### 3.2 The CSV shape (from a real export)
Columns: `Date, Record Number, Record Type, Address, Application Name, Status, Description,`
(note the **trailing comma → an 8th empty column**). Real-world quirks the parser must survive:
- **Two record-number formats:** `CE-#######` (sequential case numbers) and `##TMP-######`
  (intake/temp records — often missing Application Name / Status / Description). A `##TMP` record
  may later become a `CE` record → **dedup risk** (see §4.5).
- **Long descriptions with embedded commas, quotes, smart-quotes, doubled `""`, and newlines** →
  must use a real CSV parser (e.g. `csv-parse`/`papaparse`), never `split(',')`.
- **Messy addresses:** missing zip, `" United States"` suffix, unit forms (`Apt 101`, `, 5,`,
  `299 16TH St, 109`), ALL-CAPS, ordinals (`06Th`, `02nd`), `(Sb)`, `Av`→Ave, `Bl`→Blvd.

### 3.3 Our database already has the building blocks (confirmed in schema)
| Need | Exists? | Where |
|---|---|---|
| Structured, geocoded addresses | ✅ | `addresses` — `streetNumber/streetName/streetSuffix/pre+postDirection/unitType/unitNumber/city/county/state/zipCode` + `latitude/longitude` ([properties.schema.ts:53](../../database/schemas/properties.schema.ts#L53)) |
| Current owner = most-recent buyer | ✅ **indexed** | `propertyTransactions.buyerId` where `sortOrder = 1`; partial index `idx_pt_buyer_sort1` ([properties.schema.ts:357](../../database/schemas/properties.schema.ts#L357)) |
| Company ↔ user links | ✅ | `companyMembers` (userId, companyId, role), `companyClaims` (claim → approve flow) |
| Email (Postmark) + RM sender routing | ✅ | `sendTemplateToUser` / `sendTemplateToUsers` in `server/services/postmark/email.services.ts` |
| In-app notifications (bell + ≤3/day email cap) | ✅ | `notifications` table + `notifications.services.ts` (Mastermind) |
| Address normalization (partial) | ✅ | `normalizeAddress`, `normalizeAddressForLookup` ([normalization.ts:203](../../server/utils/normalization.ts#L203)) |
| Scheduled jobs (`node-cron`) | ✅ | `server/jobs/index.ts` |
| County scoping index | ✅ | `idx_addresses_county_lower` — lets us cheaply restrict the match set |

**Two caveats that shape the build:**
1. **CSV gives a single address string; our DB stores components, with no index on street.** So
   match by: (a) cheaply scope candidates with the **indexed `county = 'San Diego'`** filter, then
   (b) match in memory (SD's property count is bounded). `normalizeAddress` only abbreviates the
   *last* word — it's an ingredient, **not** a complete matcher.
2. **APN-first matching is impossible from the CSV** (no APN column), even though we store APNs
   (`parcels.apnOriginal`, `propertyTransactions.apn`). The MVP is **address matching** — fuzzy by
   nature. This is the core reason Phase 1 is **review-only before any email goes out.**

---

## 4. Shared design (identical for Plan A and Plan B)

The whole feature is one pipeline. **Only the ACQUIRE trigger and the runtime differ between
plans; everything below is the same code.**

```
  UPLOAD/INGEST → PARSE → MATCH → RESOLVE OWNER → DIFF → NOTIFY
  (CSV in)        (rows)   (→property)  (→users)    (new?)  (Ph2: bell+email)
```

### 4.1 Pipeline stages
1. **Ingest** — accept the uploaded CSV; store the **raw file** (so we can re-parse without
   re-downloading) + an upload/batch row.
2. **Parse** — real CSV parser → normalized rows: `{ recordNumber, recordType, rawAddress,
   applicationName, status, description, violationDate }`.
3. **Match** — parse `rawAddress` into components, normalize, and resolve to a `property_id`
   (algorithm in §4.4). Record method + confidence.
4. **Resolve owner** — `property_id` → current owner company (`buyerId` where `sortOrder = 1`) →
   `companyMembers` users. No members → **"unclaimed"** (internal-only; no external email).
5. **Diff** — has this `(recordNumber)` already been seen / notified? Alert only on **new,
   un-notified** matches. (Status-change alerts are post-MVP.)
6. **Notify** — **Phase 1: nothing user-facing** (rows land for admin review). **Phase 2:** create
   an in-app notification + send a Postmark email to each owning user; write a "sent" ledger row so
   we never double-send.

> **Key architectural rule that makes "two plans, one feature" clean:** write stages **2–6 as pure
> functions** (`parseCsv`, `matchAddress`, `resolveOwners`, `diffNewViolations`, `notify`) that take
> data and return data — **no knowledge of Express or Lambda.** Then Plan A calls them from a route
> handler and Plan B calls them from a Lambda handler. Same core, two thin triggers.

### 4.2 Data model (new `cv_`-prefixed tables, in our existing Neon DB — **both plans use these**)

| Table | Purpose | Key columns |
|---|---|---|
| `cv_uploads` | one row per CSV upload (audit + re-parse) | `id`, `uploadedBy` (FK users), `fileName`, `rawRef` (Storage path / bytea), `rowCount`, `status`, `createdAt` |
| `cv_violations` | one row per complaint, **idempotent on `recordNumber`** | `id`, `recordNumber` **UNIQUE**, `recordType`, `rawAddress`, `normalizedAddress`, `city`, `state`, `zip`, `applicationName`, `status`, `description`, `violationDate`, `firstSeenAt`, `lastSeenAt`, `sourceUploadId` |
| `cv_matches` | links a violation to a matched property | `id`, `cvViolationId` (FK), `propertyId` (FK), `matchMethod` (`exact`/`exact_no_zip`/`fuzzy`/`geocode`), `confidence`, `matchedAt`; **unique** `(cvViolationId, propertyId)` |
| `cv_notifications_sent` | idempotency ledger for alerts (Phase 2) | `id`, `cvViolationId` (FK), `propertyId`, `userId`, `channel` (`email`/`in_app`), `sentAt`; **unique** `(cvViolationId, userId, channel)` |

> **Migration note:** add these with a **targeted migration/ALTER**, *not* `npm run db:push` — push
> currently wants to truncate `market_scan_queue` (known drift). Run DB ops from the main repo (no
> `.env` in worktrees).

### 4.3 Address parsing (CSV string → components)
Split `rawAddress` on commas: first segment = street (+ optional unit); trailing segment(s) =
`City ST ZIP` (+ strip `United States`). Then normalize:
- lowercase, collapse whitespace, strip `" united states"`;
- expand/standardize suffix via `STREET_TYPE_ABBREVIATIONS` (`Av→Ave`, `Bl→Blvd`, `St`, `Dr`…);
- normalize ordinals (`06Th→6th`, `02nd→2nd`), strip `(Sb)`-style noise;
- pull out `unit` (`Apt 101`, `, 109`, `# 5`) into its own field;
- canonical key candidates: `streetNumber | normalizedStreetName | zip` and a
  zip-less `streetNumber | normalizedStreetName | city`.

### 4.4 Matching algorithm (tiers — first hit wins)
1. **Scope** the candidate set with the indexed filter `lower(trim(addresses.county)) = 'san diego'`
   (cheap; avoids a full scan). Load candidates into memory.
2. **Tier 1 — exact:** `streetNumber` + `normalizedStreetName` + `zip` all match → `exact`.
3. **Tier 2 — no-zip:** `streetNumber` + `normalizedStreetName` + `city` match (CSV zip often
   missing) → `exact_no_zip`.
4. **Tier 3 — fuzzy:** same `streetNumber`, street-name similarity above a threshold
   (Levenshtein/Dice) → `fuzzy` (flagged for review).
5. **Tier 4 — geocode fallback (optional, later):** compare to `addresses.latitude/longitude`
   within a small radius.
6. **No match** → store the violation, leave it unmatched (it's still useful data; surfaces in
   review as "unmatched in SD").

> Expect a meaningful unmatched + fuzzy bucket on first run. That bucket **is** the Phase 1
> deliverable — we tune the normalizer against real misses before any email goes out.

### 4.5 Idempotency & dedup
- **Re-uploads overlap** (~2 weeks of history each download) → upsert `cv_violations` on
  `recordNumber`; update `status`/`lastSeenAt`, keep `firstSeenAt`.
- **`##TMP` → `CE` promotion:** an intake record may reappear later under a `CE` number for the
  same address/date. MVP accepts possible duplicate alerts; **mitigation** (post-MVP): secondary
  dedup key on `(normalizedAddress, violationDate)`.
- **Alerts fire once:** `cv_notifications_sent` unique `(cvViolationId, userId, channel)`.

### 4.6 Who gets notified (ownership resolution)
`property_id` → `propertyTransactions` row with `sortOrder = 1` → `buyerId` (current owner company)
→ `companyMembers.userId`. Those users are the recipients. If the company has **no linked
members**, the match is **unclaimed** → internal/admin view only (no external email). **Coverage
will be thin at first** (only properties we track, whose owning company has claimed members) — set
expectations accordingly.

### 4.7 Notifications (Phase 2)
- **In-app:** reuse the existing bell feed by adding a `code_violation` notification type
  (metadata: address, recordNumber, violationType, status, link). *Tradeoff:* this couples CV into
  the Mastermind `notifications` table — acceptable for the prototype; revisit if it grows.
- **Email:** `sendTemplateToUsers(...)` with a **new template alias** (env var **name** only:
  `POSTMARK_CODE_VIOLATION_TEMPLATE_ALIAS`). RM-sender routing comes for free. Run company names
  through `formatCompanyName` before rendering (ARV.RAW-COMPANY-NAME).
- **Gate:** Phase 2 ships only after Phase 1 match quality looks right on real data.

### 4.8 Access control
Upload + review are **admin-only** (`requireRole`). User-facing alerts respect app-access gating
like the rest of the app. Document the new routes in `.claude/docs/access-control.md` and
`.claude/docs/api.md`; add baseline integration tests (testing standard).

---

## 5. Stack decision — AWS vs. monorepo (deeper breakdown)

**The feature is identical either way.** What differs is *where the processing runs* and *what
triggers it*. One clarification of the intuition "we can't call a worker on DB upload": that's true
in the monorepo (no DB-insert trigger) — so **the upload API call itself invokes processing**. In
AWS, the **S3 object-created event _is_ that trigger** (→ SQS → Lambda). AWS hands you the
event-driven trigger the monorepo lacks; you pay for it in setup.

### 5.1 Dimension-by-dimension

| Dimension | Monorepo (Express) | AWS (Lambda + S3 + SQS) |
|---|---|---|
| **Time to first working match** | ~0 setup; new routes/tables only | **~1–1.5 of 3 days** on Terraform/IAM/S3/SQS/Lambda packaging/SSM |
| **Dev loop** | `npm run dev` hot reload + existing Vitest/Supertest harness (seconds) | LocalStack or deploy-to-test (minutes); slower iteration |
| **Code sharing / DB access** | bare imports of `/database` Drizzle + `/shared`; existing pooled connection | must bundle ESM monorepo slice into Lambda; needs **Neon serverless driver/pooler** (Lambda concurrency × connections) |
| **Secrets** | reuse existing env (`DATABASE_URL`, `POSTMARK_*`) | duplicate into **SSM** + IAM to read them (names only) |
| **Failure isolation** | shared box (low risk for a human-triggered daily parse; can run off-thread) | **true isolation** — the one real AWS win, but it only *pays off* for constant pollers / headless scrapers (post-MVP) |
| **Deploy coupling** | ships with the app (additive; small blast radius) | independent deploy/scale/logs |
| **Observability** | one log stream we already watch | CloudWatch + correlate S3→SQS→Lambda |
| **Spans how many codebases** | 1 | 2 (upload UI stays in the app regardless) |
| **$/month** | ~0 (already running) | ~$0–5 (near-free at this volume) — cost is **engineering time**, not dollars |
| **Ops familiarity** | known stack | new to us → learning cost during a 3-day sprint |

### 5.2 Decision rule
Choose **AWS now** only if one is true: (a) we already run production on AWS with the IaC/ops muscle
memory; (b) the Replit box is at its resource ceiling **today**; or (c) we must ship **automated
Accela scraping within these same 3 days** (we shouldn't — defer the fragile part). Otherwise
**monorepo for the MVP**, with two cheap seams that keep the AWS door open:
1. **Process off the request thread** (respond `202`, run the pipeline in a background tick) — this
   *is* the ingest→process boundary in code, so the future swap is localized.
2. **Source-agnostic parser** — emits normalized rows; swapping "uploaded file" for "scraper output"
   touches only the trigger.

These give ~90% of AWS's future-proofing at ~10% of the cost. The graceful automation step later is
a **separate worker on the same Neon DB** (Render/Fly/Replit reserved-VM) — *not necessarily* full
AWS.

---

## 6. Plan A — Monorepo (Express) implementation

**Flow (matches the intuition):** Admin panel **upload screen** → `POST` to a new **admin API
route** → controller parses the CSV and invokes the pipeline **in-process** (off-thread; respond
`202`) → pipeline matches against our DB, resolves owners, records matches → (Phase 1) rows appear
in an **admin review screen**; (Phase 2) it creates bell notifications + sends emails.

### 6.1 Everything you need to build
**Backend**
- **DB:** `cv_uploads`, `cv_violations`, `cv_matches`, `cv_notifications_sent` Drizzle schemas +
  targeted migration (§4.2 note).
- **Route:** `server/routes/codeViolations.routes.ts` — `POST /api/admin/code-violations/upload`
  (multipart CSV, `requireRole` admin), `GET /api/admin/code-violations/matches` (review feed).
- **Controller:** `server/controllers/codeViolations/` (parse req → call service → shape res).
- **Service:** `server/services/codeViolations/` with the **pure pipeline functions**
  (`parseCsv`, `matchAddress`, `resolveOwners`, `diffNewViolations`, `notify`) + a thin
  `processUpload` orchestrator.
- **Reuse:** `postmark/email.services.ts`, `notifications.services.ts`, `companyMembers` +
  `propertyTransactions` (`sortOrder=1`) queries, `normalizeAddress`/`STREET_TYPE_ABBREVIATIONS`,
  `formatCompanyName`.
- **CSV lib:** add a parser dep (`csv-parse` or `papaparse`).
- **Off-thread processing:** background tick (e.g. a `node-cron` drain of `cv_uploads.status =
  'pending'`) or `setImmediate`/queue-in-DB so the upload request returns `202` immediately.

**Frontend**
- **Upload page** (admin): `client/src/pages` or `components/admin` — file picker → upload → status.
- **Review page** (admin): table of `cv_matches` (violation, matched property, method, confidence,
  owner/company, notify state) with a manual confirm/dismiss control for fuzzy matches.
- **API wrapper:** `client/src/api/codeViolations.api.ts`.

**Docs & tests (per CLAUDE.md)**
- Update `access-control.md` (admin-only routes) + `api.md`.
- Baseline integration tests for both routes (testing standard); unit tests for `matchAddress`
  against the real CSV quirks in §3.2.
- New env var **name** only: `POSTMARK_CODE_VIOLATION_TEMPLATE_ALIAS` (+ a Postmark template).

### 6.2 Suggested 3-day sequence
- **Day 1:** schema + migration; CSV parser + `matchAddress`; unit tests against the sample CSV
  (the riskiest part first).
- **Day 2:** upload route + off-thread `processUpload`; owner resolution; admin review screen
  (Phase 1 complete — match quality visible on real data).
- **Day 3:** Phase 2 — bell notification type + Postmark template + `cv_notifications_sent` ledger;
  docs + integration tests; `npm run check`.

---

## 7. Plan B — AWS implementation

**Flow:** Admin panel **upload screen (still in the app)** → app gets a **presigned S3 URL** (or a
small app endpoint that puts to S3) → file lands in **S3** → **S3 object-created event → SQS → a
Lambda** runs the **same pipeline** (parse → match → resolve → diff → notify), reading
`DATABASE_URL`/`POSTMARK_*` from **SSM** and writing results to the **same Neon DB** → the app's
**admin review screen reads those rows** (identical to Plan A). Notifications: the Lambda calls
Postmark directly and/or writes notification rows the app surfaces in the bell.

### 7.1 Everything you need to build
**Shared with Plan A (unchanged):** the four `cv_` tables in Neon, the pure pipeline functions, the
admin **review** screen, the Postmark template + alias, `formatCompanyName`, docs updates.

**AWS-specific (the extra setup)**
- **IaC: Terraform** (per earlier decision) for: a **private S3 bucket** (uploads), **SQS queue +
  DLQ**, a **Lambda** function + **IAM execution role**, and the **S3 → SQS → Lambda** event wiring.
- **SSM Parameter Store** entries for `DATABASE_URL`, `POSTMARK_SERVER_API_KEY`,
  `DEFAULT_FROM_EMAIL`, `POSTMARK_CODE_VIOLATION_TEMPLATE_ALIAS` (names only) + IAM read policy.
- **Lambda packaging:** esbuild bundle of the pipeline + `/database` schema + `/shared`; **Neon
  serverless driver / pooler** for connection management under concurrency.
- **App-side trigger:** endpoint to mint a **presigned upload URL** (admin-only) so the upload UI
  can push to S3.
- **Deploy pipeline** for the Lambda (CI or manual) + **CloudWatch** log groups/alarms.
- **Testing:** LocalStack or a deploy-to-test loop (slower than Plan A's Vitest harness).

### 7.2 Setup checklist (the "we've never done this" part)
1. AWS account + Terraform state backend + credentials.
2. S3 bucket (private, lifecycle rule to expire raw uploads), SQS + DLQ, Lambda + IAM role.
3. SSM params + IAM read policy; confirm Neon reachability from Lambda (it's plain Postgres/TLS —
   no VPC peering needed).
4. Lambda bundling (externals, driver) + first deploy; wire S3→SQS→Lambda; smoke-test end to end.
5. Presigned-URL endpoint in the app; point the upload UI at S3.
6. CloudWatch alarms on DLQ depth + Lambda errors.

> Net: Plan B is **Plan A's exact logic** plus the §7.1/§7.2 infrastructure. The processing code is
> ~95% identical; the delta is trigger + runtime + deploy.

---

## 8. Post-MVP (where the stack choice actually starts to matter)

1. **Automate acquisition — scrape Accela** (`aca-prod.accela.com/SANDIEGO`, CE tab): switch to
   address search → "San Diego" → iterate results → export/parse. This is the **fragile,
   constantly-running, possibly headless-browser** workload that genuinely benefits from isolated
   compute — i.e., the first real reason to prefer a separate worker / AWS. Cadence: complaints
   update through the day; hourly polling would catch most.
2. **APN-first matching** once the scraped detail pages give us APN — far more robust than address
   strings (cross-normalize SFR's APN format vs. San Diego County's).
3. **Status-change alerts** (New → Active Investigation → Closed) via the diff stage.
4. **More sources as additional parsers on the same spine:** nearby-property radius, entity standing
   (CA SOS/FTB), tax delinquency / pre-foreclosure (we already store `taxDelinquentYear` +
   `preForeclosures`). Each is "one parser," not a new pipeline.
5. **Other cities/MSAs.**

---

## 9. Open questions / risks
- **Match coverage** is bounded by (a) properties we track and (b) owning companies with linked
  members — likely thin at first. Phase 1 review quantifies it before we promise alerts.
- **Address-matching precision** on messy CSV strings is the core technical risk → mitigated by
  review-before-email and unit tests against real quirks.
- **Manual cadence** means we lag intra-day complaint updates and depend on someone running the
  download — acceptable until automation (§8).
- **`##TMP` → `CE` dedup** (§4.5) can double-alert until the secondary dedup key lands.
- **Notifications-table coupling** (§4.7) — fine for prototype, revisit if CV volume grows.

---

### Sources (acquisition verification, 2026-06-26)
- [data.sandiego.gov — Code Enforcement Violations dataset](https://data.sandiego.gov/datasets/code-enforcement-violations/) (frozen, 2015–2018)
- [OpenDSD — CE Case Search](https://opendsd.sandiego.gov/web/cecases/) (legacy, `2023_1220`, integer case IDs)
- [OpenDSD API — community docs](https://github.com/scoutred/opendsd)
- Live source in use: Accela ACA portal — `aca-prod.accela.com/SANDIEGO` (CSV download only)
