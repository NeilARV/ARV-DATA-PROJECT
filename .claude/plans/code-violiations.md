# Property Risk Monitoring System — Design & Plan (v0.5 Draft)

> Status: **Concept, materially revised.** Originally scoped as a single "code-violations
> scraper," this is now a **multi-source property-risk monitoring system** that watches several
> public datasets for *state changes* on properties and entities we care about, matches them to
> our property/ownership data, and notifies the relevant party using our existing
> notification/email infrastructure. It reuses our existing **Neon Postgres** but runs on
> **isolated compute** so it does not share the Replit server, the SFR data pipeline, or the
> existing cron jobs.
>
> **What changed since v0.1 (read this first):**
> 1. **There IS an API.** v0.1 concluded "no API, must scrape Accela." That was wrong. San Diego's
>    **OpenDSD API** (`https://opendsd.sandiego.gov/api`) returns code-enforcement cases as
>    JSON — same DSD system that backs the Accela portal — including **APN, lat/lng, dates,
>    description, and investigator contact**. Accela scraping drops from "the plan" to a
>    **freshness fallback only** (see §5).
> 2. **Scope grew from 1 source to 4 monitors:** CE on our properties, CE on *nearby* properties,
>    CA entity standing (FTB/SOI), and county property-tax delinquency (see §5).
> 3. **Stack flipped to AWS**, right-sized and **split by *fetch shape*** (bulk pull vs.
>    per-target probe), not by source. The data-gravity argument for staying on Replit was
>    conceded (see §7).
> 4. **Matching is now APN-first**, not address-string-first (see §8).
> 5. **New unifying abstraction:** alert on a **state transition**, not a new row —
>    monitors / observations / alerts (see §3 and §6).
>
> **What changed since v0.2 (grounding against the existing ARV database):**
> We checked the plan's assumptions against our actual Drizzle schema + SFR pipeline. Several
> pieces the plan treated as greenfield **already exist**, which *shrinks* the build:
> 1. **APNs already flow from SFR.** We populate `parcels.apn_original` and
>    `property_transactions.apn` in `insert-properties.ts`. So §8's "enrich properties with APNs"
>    is **not** from-scratch work — it's an **APN-coverage audit + cross-source normalization**
>    (SFR's APN format vs. San Diego County / OpenDSD's). (Partly answers Q6.)
> 2. **Ownership is transaction-derived, not stored.** There is no `property.owner_id`; we treat
>    the **most-recent buyer** (`property_transactions.buyer_id` where `sort_order = 1`) as the
>    current owner — they're the last party that bought it (and, for a flip, the renovating ARV
>    client). Notifiable users hang off that company via `company_members` (our manual links) /
>    `company_claims`. **Ownership freshness = SFR-sync freshness.**
> 3. **Entity standing is not greenfield.** We already enrich companies via OpenCorporates
>    (`opencorporates.service.ts`, `enrich-companies.ts` → `company_details`: `jurisdiction_code`,
>    `oc_company_number`, `dissolution_date`, `inactive`, `filings`, …). Before building CA SOS
>    bizfile (§5.3) from scratch, confirm whether this feed already exposes a standing/`inactive`
>    signal we can diff. (Bears on Q2.)
> 4. **Tax delinquency / pre-foreclosure partly exist from SFR** (`tax_records.tax_delinquent_year`,
>    the `pre_foreclosures` table). The §5.4 question becomes **freshness, not access** — see the
>    note there. (Bears on Q3.)
> 5. **Notification plumbing exists.** `user_notification_preferences` (per-app toggles + filters)
>    is where a code-violation toggle lives; addresses are **already geocoded**
>    (`addresses.latitude/longitude`), so radius matching (§5.2) needs no new geocoding on our side.
>
> **Infra implication:** the CE MVP (OpenDSD JSON → diff → match → notify existing linked users) is
> a single scheduled job, not a queue. Sequence the AWS queue/Fargate build (§7) to the
> **browser-probe phases (3–5)** that actually need it; don't pay the second-operational-home cost
> up front.
>
> **What changed since v0.3 (post-meeting MVP decision — temporary):**
> **We are not automating acquisition for the MVP.** Both **Accela** (CE) and **bizfileonline**
> (entity standing) let you **download results as a file**, so for now an admin will **periodically
> download** the file and **upload it through an admin screen**; the system parses → matches →
> diffs → notifies from the upload (see new **§3.1**). This **supersedes the acquire/compute
> assumptions** in the grounding note above and in §5/§7 *for the MVP*: no scraper, no live API, no
> queue, no AWS — just an admin upload endpoint + a parse/match/notify job in the existing app. The
> automated path (§5/§7/§12) becomes the **post-MVP** goal. Accepted **sacrifice:** CE updates
> throughout the day, so manual cadence means we **lag intra-day changes** and depend on someone
> running the download — fine until we figure out scraping/organization.
>
> **What changed since v0.4 (MVP stack finalized):**
> **Go AWS as the long-term home — but ship the MVP as a *minimal* AWS footprint, not the §7
> constellation.** MVP stack = **one parse/match/notify Lambda + S3 (uploads) + SQS + Neon + SSM**
> (Postmark reused; admin upload UI in the existing app — full architecture in §7 "MVP stack").
> This **refines** the v0.4 note above: the MVP is *not* in the existing app and is *not* "no AWS,"
> it's deliberately small AWS. Still **post-MVP:** scrapers, headless browsers, Fargate, EventBridge
> schedules. **SQS is in from day one on purpose** — it decouples upload from processing, exercises
> retry/DLQ + idempotency early, and is the seam every future automated producer plugs into; it's
> **easy to remove** (collapse to S3 → Lambda) if it proves unnecessary.
>
> **What changed since v0.5 (MVP implementation plan finalized — read §15):**
> Three build decisions are now locked, narrowing v0.5's options into a single buildable path:
> 1. **Source scope: City-of-SD code enforcement ONLY for the first slice.** We build the whole
>    spine against one upload parser (Accela CE export). Entity standing (bizfile) becomes the
>    **second adapter on the same spine** — the proof that "a new source is one parser, not a new
>    pipeline" (§3, §15.5). This supersedes the §3.1 "two parsers (CE + bizfile)" framing *for the
>    first slice*.
> 2. **IaC: Terraform** (not SST/CDK). The §7 "SST or CDK" line is superseded.
> 3. **Notifications are deferred one phase.** The MVP lands matched CE cases **in-app, read-only**,
>    so we eyeball match quality on real data before any email goes out (the §12 Phase 1→2 split,
>    now explicit). `cv_notifications_sent`, the Postmark template, and the ws push land in the
>    **immediately-following** notify phase — schema-aware but not wired in the first slice.
> See **§15** for the full implementation plan (workstreams, schema columns, build sequence, DoD).

---

## 1. The idea in one paragraph

Several kinds of public-record events signal **risk on a property or the entity that owns it** —
a city code-enforcement case opening, a borrower LLC losing good standing with the state, an
unpaid property-tax bill going delinquent. These are all published by government sources. We
continuously acquire them, key each one to a **property (by APN) or an entity**, match against
**our property + ownership database** (we already know who owns what), and **notify the relevant
party** — the owner, the company doing the repair, or our internal team — using the notification
+ email systems we already have. The pitch: "We'll tell you the moment something about a property
you care about, or the entity behind a deal, changes in a way that could blow up a loan or a
flip — before the city, the state, or anyone else shows up."

The original driver still holds: we do home loans for companies renovating properties, and they
catch code violations (and other surprises) along the way. We want to alert them the moment a
risk is published, before the city/state/county notifies them or someone just shows up.

---

## 2. Why this is a separate app (on isolated compute)

- **Load isolation.** Our Replit box already runs the Express API, Vite, the SFR sync pipeline,
  email jobs, websocket layer, and cron. Adding constantly-running pollers (and, for some
  sources, a headless browser) on the same box risks starving everything else.
- **Different failure modes.** Scrapers break when a website changes its HTML; bulk-file parsers
  break when a column moves. We don't want a flaky acquirer taking down the main app, and we want
  its logs/alerts separate.
- **Different runtime profile.** Some sources are clean API/bulk pulls (cheap serverless);
  others need a persistent worker with a headless browser (a container). Neither matches our
  request/response API runtime.
- **Shared data, not coupled code.** Every monitor ends in a **match against our property/
  company/APN data in Neon Postgres**. The app writes to that same database (its own
  `cv_`-prefixed schema) and triggers notifications via our existing API/DB + Postmark. That is
  the only coupling.

> **Locality is NOT a reason to stay on Replit.** Neon is normal Postgres over TLS; any AWS
> Lambda/Fargate task reads `DATABASE_URL` from SSM and queries it directly. No VPC peering, no
> private networking. The honest cost of going AWS is a *second operational home* (deploys, logs,
> alarms live somewhere other than the main app), not data access. See §7.

---

## 3. The pipeline — alert on a STATE TRANSITION, not a new row

The key reframe in v0.2: every monitor, once you squint, has the same shape — **fire when a
tracked thing transitions into a bad state we haven't already notified about**, not merely when a
new record appears.

```
  ┌────────────┐    ┌───────────────┐    ┌──────────────────┐    ┌───────────┐    ┌──────────┐
  │  ACQUIRE   │ -> │  OBSERVE      │ -> │  MATCH           │ -> │  DIFF     │ -> │  NOTIFY  │
  │ API / bulk │    │ normalize to  │    │ APN/entity →     │    │ vs last-  │    │ ws+email │
  │ / scrape   │    │ observations  │    │ our property/co  │    │ known     │    │ (transit)│
  └────────────┘    └───────────────┘    └──────────────────┘    └───────────┘    └──────────┘
```

- **Acquire** — pull from the source (API pull, bulk file, or browser scrape; see §5/§7).
- **Observe** — each source is an *adapter* that emits a normalized observation:
  `{ target_key, source, status, details, observed_at }` where `target_key` is an **APN** (CE,
  tax) or an **entity id** (FTB/SOI). Adapters are the only source-specific code.
- **Match** — resolve `target_key` to a property/company/user in our DB (APN-first, §8).
- **Diff** — compare each observation's `status` to the **last-known status** stored per
  `(source, target_key)`. A transition we haven't notified is the alert trigger.
- **Notify** — only on an un-notified transition: WebSocket in-app + Postmark email, written
  once to an idempotency ledger.

The state transitions per source:

| Monitor | Transition that fires an alert |
|---|---|
| Code enforcement (your property) | a new CE case appears for an APN you own |
| Code enforcement (nearby) | a CE case appears within radius *R* of an APN you own |
| Entity standing (FTB/SOI) | standing flips `Active → Suspended` (or out of good standing) |
| Property tax | a parcel flips `current → delinquent/defaulted` |

Because the core is "store last-known status, fire only on a fresh transition," **adding a fifth
source later is writing one adapter, not a new pipeline.** This matters more than any infra
decision below.

### 3.1 MVP acquisition (temporary): manual download → admin upload

> **DECIDED (v0.4, post-meeting) — temporary sacrifice.** For the MVP we will **not scrape and not
> call a live API.** Both **Accela** (CE) and **bizfileonline** (entity standing) let you
> **download results as a file**, so an admin will **periodically download** that file and **upload
> it through an admin screen**; the system then parses it and runs the rest of the pipeline
> (observe → match → diff → notify) from the upload. **Only the ACQUIRE step changes** — a human
> replaces the scraper/API; everything downstream in §3 is unchanged.

**Why we're accepting this:** it removes the hardest, most fragile part (headless scraping,
anti-bot, scraper probe-queues, browser workers) and lets us validate the **match/notify core — the actual
value — against real data now.** The cost we knowingly accept: CE updates throughout the day, so a
manual cadence **lags intra-day changes** and depends on someone running the download. Fine
**temporarily**, until we figure out how to scrape/organize the sources better.

**What this removes from the MVP:** no scraper, no headless browser, no Fargate worker, no
EventBridge schedule, no per-source probe queues — most of the §7 *automated* build is **deferred to
post-MVP.** The MVP ships as a **minimal AWS footprint — one parse/match/notify Lambda + S3 + SQS +
Neon + SSM**, with the **admin upload UI in the existing app** (finalized architecture in §7 "MVP
stack"). The CE scrape-vs-API fork (§5.1) is **moot for now** — we ingest whatever the portal
exports.

**What to build:**
- **Admin-only upload screen + endpoint** — reuse existing admin auth (`requireRole`); the endpoint
  writes the uploaded file to **S3** (the S3 event is what triggers processing) + a `cv_raw_records`
  row. Accept the portal's export (CSV/XLSX — exact format TBD until we download a sample).
- **A parser per source/format** (Accela CE export, bizfile export) that emits normalized
  `observations` (§3). This parser is the new source-specific code — it replaces the adapter's
  "fetch" with "parse the uploaded file."
- **Store the raw uploaded file** (`cv_raw_records` / Storage) so we can re-parse without
  re-downloading — the raw-first principle (§6) still holds.
- Everything downstream — APN/entity match (§8), diff vs. last-known status, idempotent notify — is
  **shared and unchanged.**

**Operational must-gets (manual upload makes these sharper):**
- **First upload = baseline, notify nothing.** The first file establishes last-known status for
  every case in it; otherwise the first upload emails clients about every historical violation.
  (Same "new since deploy" rule as §5.1, applied to the first upload.)
- **Re-uploads must not re-notify.** The same case appears in every download; the
  diff-vs-last-known + `content_hash` design (§3/§6) must absorb duplicate/overlapping uploads
  without double-sending.
- **Staleness visibility.** One `cv_runs` row per upload (who, when, row counts) so we can show
  "last uploaded N days ago" and alarm when an upload is overdue — the human is now the dependency.

---

## 4. Geographic scope — City of San Diego first

> **DECIDED: City of San Diego first.** ✅ One jurisdiction, one primary feed (OpenDSD). County
> and the surrounding independent cities are deferred to later source adapters.

- **City of San Diego** (~1.4M people): one code-enforcement system, exposed via **OpenDSD**.
  Cleanest place to start. (The property-tax and entity-standing monitors are **County** and
  **State** respectively — see §5 — but the CE monitor, our first build, is City.)
- **San Diego County** (unincorporated): separate Planning & Development Services system —
  later adapter.
- **The trap:** "San Diego" colloquially includes Chula Vista, Oceanside, Escondido, Carlsbad,
  El Cajon, etc. — each an **independent city with its own code-enforcement portal** (~18
  sources). Do not chase this for the MVP.

> Schema keeps `jurisdiction` (and more generally `source`) as a first-class column from day one
> so each new jurisdiction/source is a pluggable adapter.

---

## 5. Data sources — four monitors, mapped to where the data actually lives

The defining axis is **fetch shape** (bulk pull vs. per-target probe), because that — not the
source — decides whether a monitor needs a queue (§7). Each source is tagged below.

### 5.1 Code enforcement — City of San Diego → **OpenDSD API (PRIMARY)** · *bulk pull*

> **CORRECTION to v0.1:** v0.1 said "CONFIRMED — there is no API" and committed to scraping the
> Accela ACA portal. **That was wrong.** The data is queryable as JSON via OpenDSD, the same DSD
> system that backs the public Accela portal. **We do not scrape for the primary path.**

- **API root:** `https://opendsd.sandiego.gov/api` (HTTPS; JSON or XML via `Accept` header).
- **Web UI for reference:** `https://opendsd.sandiego.gov/web/cecases/` (ID + address search);
  per-case details at `.../CECases/Details/{id}`.
- **Fields returned per CE case** (confirmed against the OpenDSD CE case object): `case_id`,
  `APN`, `street_address`, `open_date`, `close_date`, `last_action_due_date`, latitude/longitude
  (+ NAD83 northing/easting), `investigator_name`, `investigator_phone_number`,
  `investigator_email_address`, `close_reason`/`close_note`, `investigator_active`, and a nested
  **complaints** array (complaint type / description). This carries **everything we need** —
  crucially the **APN** (exact match key) and **lat/lng** (radius match), plus dates and
  description. Owner is not published; we resolve owner ourselves from our DB.
- **Do NOT use the static dataset.** The `data.sandiego.gov` "Code Enforcement Violations"
  dataset only covers cases **reported before Jan 2018 / closed 2015–2018** and explicitly tells
  you to use OpenDSD for recent data.

**Polling strategy — CaseId watermark (preferred):** `case_id` is a **sequential integer**, so
even if date-list querying is limited we have a clean "new since deploy" mechanism: on first run,
record the current **max `case_id`** as the baseline and **notify nothing**; each subsequent run,
fetch cases above the stored watermark and advance it. This is actually a *better* "new since
deploy" trigger than date filtering and matches the user's stated requirement ("start scanning
the day we deploy; missing prior-day filings is acceptable").

> **OPEN — gating question (could not verify externally):** does OpenDSD expose a "list all CE
> cases opened on date X / in range" query, or only **by-ID** and **by-address**? If date-list
> exists, use it; otherwise fall back to the **CaseId watermark** above. This is the one thing to
> confirm by probing the API directly (or emailing `dsdweb@sandiego.gov`). Community Go wrappers
> exist (`scoutred/opendsd`, `vidman22/opendsd-api`) and are useful references for the request
> shapes.

**Freshness caveat:** OpenDSD is fed from the same system as Accela but may **lag the live portal
by hours-to-a-day** (DSD dashboards refresh ~daily). Given we already accept missing same-day
filings, this is fine. If the lag ever becomes unacceptable, the Accela scrape (§5.5) is the
**freshness fallback**, not the primary.

### 5.2 Code enforcement — nearby/surrounding properties → **same OpenDSD feed** · *bulk pull*

**Not a new source.** Because each CE case carries `APN` *and* `lat/lng`, we pull CE cases once
and match each case **two ways** against our owned properties:

- **Exact APN match** → "on a property you own."
- **Within radius *R*** (lat/lng proximity, e.g. PostGIS / `earthdistance`) → "nearby."

One fetch, two matching rules. No second pipeline. (Radius *R* and whether "nearby" is a
different notification severity are §13 questions.)

### 5.3 Entity standing — **FTB / SOI** → CA Secretary of State (bizfile) · *per-target probe*

**What these terms mean (the user asked):**

- **FTB = California Franchise Tax Board** — the state tax agency. Every CA corporation/LLC owes
  an annual **minimum franchise tax ($800 floor)**. Stop paying or filing and the FTB
  **suspends** the entity. A suspended entity loses legal rights: it **can't enforce or defend
  contracts, can't sue, can't legally do business**, and can even lose the exclusive right to its
  own name.
- **SOI = Statement of Information** — filed with the **Secretary of State** (not the FTB).
  Corporations file **annually**, LLCs **every two years**. It lists officers/managers, principal
  address, and agent for service of process. Miss it and the SOS also pushes the entity **out of
  good standing**.

**Why it belongs here:** our borrowers and the LLCs that own these properties are exactly the
entities that get FTB-suspended or go SOI-delinquent. **A suspended borrower entity can't legally
close a loan**, and one going suspended mid-renovation is a title/closing landmine. Same value
prop as the code-violation alert: catch it before it blocks a deal.

**Convenient collapse:** the CA SOS **bizfile** portal exposes a **multi-axis standing** per
entity — **SOS, FTB, Agent, and VCFCF** standing are all surfaced per record. So "FTB payment /
SOI" collapses into **one monitor**: watch the standing fields on the entities we track, fire on
`good → not-good`.

> **GROUNDING — we already pull company registry data.** Our `enrich-companies.ts` job +
> `opencorporates.service.ts` populate `company_details` (`jurisdiction_code`, `oc_company_number`,
> `incorporation_date`, `dissolution_date`, `inactive`, `agent_name`, `filings`). **Action before
> building bizfile:** confirm whether this existing feed already surfaces a CA standing / `inactive`
> transition we can diff. If it does, this monitor is a diff on data we already have; if not,
> bizfile fills the gap — it isn't necessarily the whole source.

**Access (four options, decide per §13):**
1. **Gated official REST API** (CALICO / bizfile API) — JSON entity details, but requires
   registering on their API-management portal and obtaining a **subscription key**.
2. **Bulk "Master Unload" files** — flat data files; ~**$100** data-only, ~**$900** with images.
3. **Scrape `bizfileonline.sos.ca.gov`** per entity (many third parties do; doable but behind
   friction, and another `.aspx`-style portal).
4. **bizfile "data request" route (master + weekly) — TO INVESTIGATE, shape unknown.**
   `bizfileonline.sos.ca.gov` appears to let you **request data files** directly: a **full master
   dataset** plus a **weekly update file**. This expands option 2 with a weekly *delta* that fits
   the state-transition core well (master = baseline, weekly file = the diff input — no per-entity
   scraping). **We have not seen what it actually looks like yet:** fields returned (does it include
   standing / `inactive` / FTB status?), file format, cost, the request/turnaround process, and
   refresh cadence all still need confirming. Logged as a candidate while we decide which source to
   build first — not chosen.

At our entity count, **weekly per-entity probes** are plenty. Bulk files only win if scraping
brittleness/rate-limiting becomes a real problem.

### 5.4 Property tax — **San Diego County Treasurer-Tax Collector / Auditor** · *bulk pull or per-target probe*

Watch for **outstanding/delinquent property-tax bills** on previously-sold and currently-owned
properties.

> **GROUNDING — SFR already gives us some of this.** `tax_records.tax_delinquent_year` and the
> `pre_foreclosures` table are populated from SFR, so the real question is **freshness, not
> access**: SFR is periodic and can lag months, which undercuts an "ahead of the city" alert. Two
> options: **(a)** run the tax monitor as a **diff on SFR's `tax_delinquent_year`** — zero new
> sources, reuses the state-transition core, but only as fresh as SFR; or **(b)** add a **live
> county probe** around the calendar dates for true early warning. Decide by first **measuring how
> stale SFR's tax data actually is.**

**Access:**
- **Bulk (clean path):** the County Auditor publishes **Tax Roll Data Files**, including a
  **Delinquent Master Tax File** (all prior-year bills unpaid as of **June 30** + current
  status), plus the current **secured roll** and **defaulted roll** — about **$86 per file**.
  Match against our APNs.
- **Live per-parcel lookup:** the Tax Collector's payment site — but heads up, it's the **same
  `.aspx` search-by-APN/address portal pattern** as Accela, already **blocks access from some
  foreign countries**, and will likely **rate-limit a scraper**.

**Tradeoff (buy bulk vs. probe per target):** since we only care about *our* APNs and
delinquency is **calendar-driven** (key dates **Dec 10**, **Apr 10**, **June 30**), **probing our
handful of parcels a few times a year** is cheaper and fresher than buying whole-county files.
Lean probe; buy bulk only if the portal blocks/rate-limits us.

### 5.5 Accela ACA portal → **FALLBACK ONLY (freshness)** · *headless-browser scrape*

Kept for the record and as the freshness fallback for §5.1 — **not** the primary path.

- It's **Accela ACA**, an **ASP.NET WebForms** app (`.aspx`) — **not** a React/useState app.
  Navigation is via server-side **`__doPostBack`** carrying **ViewState** + EventValidation
  blobs, with search state held in the **server session**. That's why you can't deep-link with
  URL params and why pagination isn't in the URL.
- To drive it you'd need a **headless browser** (Playwright/Puppeteer) replaying the exact click
  sequence: set city/state (San Diego, CA) → switch to **Search by Address** → Search → pick the
  **"SAN DIEGO CA"** result from the disambiguation list → parse the results table (date, record
  number, record type, address, application name, status, description, action) **or** trigger
  **Download results** (CSV).
- It's brittle (breaks whenever the city touches the page) and headless-browser jobs are exactly
  what a solo dev doesn't want to babysit. **Only reach for it if OpenDSD's lag proves
  unacceptable.**

### Source summary

| Monitor | Source | Fetch shape | Queue? | Cost |
|---|---|---|---|---|
| CE — your property | OpenDSD API (JSON) | Bulk pull | No (cron) | Free |
| CE — nearby | OpenDSD API (same fetch) | Bulk pull | No (cron) | Free |
| Entity standing (FTB/SOI) | CA SOS bizfile (API / bulk / scrape) | Per-target probe | **Yes** | $0 (API key) – $100+ (bulk) |
| Property tax delinquency | SD County Auditor / Tax Collector | Probe (or bulk) | **Yes** (if probe scrape) | ~$86/file or probe |
| CE freshness fallback | Accela ACA portal | Headless scrape | **Yes** | Compute only |

---

## 6. Data model (revised around monitors / observations / alerts)

New tables, isolated in their own `cv_` schema. The shape now centers on the **state-transition**
model from §3, not just "raw rows."

- **`cv_sources`** — one row per source adapter (OpenDSD CE, CA SOS standing, SD County tax,
  Accela fallback): name, jurisdiction, `fetch_shape` (`bulk` | `probe`), access mode
  (`api` | `bulk_file` | `scrape`), cadence, **watermark/cursor** (e.g. max `case_id`), enabled.
- **`cv_targets`** — the things we watch, keyed by **`target_key`** (an **APN** for property
  sources, an **entity id** for standing) + `target_type`, linked to our property/company where
  resolved. This is what `last_known_status` hangs off of.
- **`cv_raw_records`** — immutable raw payloads exactly as fetched: source_id, fetched_at,
  external_id, raw_json/raw_csv/raw_html, `content_hash`. Never edited (replay parse bugs without
  re-fetching).
- **`cv_observations`** — normalized adapter output: source_id, `target_key`, `status`, details,
  observed_at, content_hash. One row per (target, fetch) — the input to the diff step.
- **`cv_status`** — **last-known status per `(source, target_key)`** (the diff baseline) +
  `last_transition_at`, `last_notified_status`. This table is what makes "fire only on a fresh
  transition" work.
- **`cv_property_matches`** — join from a `target_key` to a property/company in our existing DB:
  match_confidence, **match_method** (`apn` | `geocode` | `fuzzy`).
- **`cv_notifications_sent`** — idempotency ledger: target_key, source, transition, recipient,
  channel (ws|email), sent_at. We never double-notify the same transition.
- **`cv_runs`** — per-fetch structured run log (see §11): source, started/finished, records
  fetched/new/changed, errors, duration.

For the CE source specifically, persist the OpenDSD fields from §5.1 (`case_id`, `apn`,
`street_address`, `open_date`, `close_date`, lat/lng, `description`, investigator contact) on the
observation/details so notifications can include them.

Design principles: **raw-first**, **APN/entity-keyed**, **idempotent** (re-running never
duplicates or re-notifies), **diff against last-known status** to detect a real transition vs.
"already seen."

---

## 7. Compute & architecture — AWS, right-sized, split by FETCH SHAPE

> **MVP NOTE (v0.5):** the full automated build in this section is **post-MVP.** The MVP ships as a
> **deliberately small AWS slice — one Lambda + S3 + SQS + Neon + SSM** (acquisition is the manual
> admin upload from §3.1; **no scraper, browser, Fargate, or EventBridge schedule**). See **"MVP
> stack" below** for the finalized architecture.

> **DECISION REVISED in v0.2.** v0.1 recommended a single TypeScript worker on Fly.io/Railway
> (Option A) and leaned on a data-gravity argument to keep compute next to the DB. The user
> (3 yrs AWS experience, comfortable with Identity Center, can store secrets/DB URLs in SSM)
> rightly pointed out **Neon is reachable from anywhere over TLS**, so locality is a non-issue.
> Conceding that, **AWS is the home** — it plays to the part of the system most likely to break
> (headless-browser scrapers want isolated, restart-on-failure, container-native compute), the
> user is fluent in it, and it gives blast-radius isolation + autonomy to ship end-to-end.

### MVP stack (v0.5 — DECIDED): minimal AWS — one Lambda + S3 + SQS + Neon + SSM

The MVP is the smallest AWS footprint that runs the §3 pipeline end-to-end. **No scraper, no
headless browser, no Fargate, no EventBridge schedule** — acquisition is the manual admin upload
(§3.1).

```
  Admin upload UI + endpoint (existing app admin area, reuse requireRole)
        │  writes file → S3 + a cv_raw_records row
        ▼
      S3 ──event──▶ SQS ──▶ parse/match/notify Lambda ──▶ Neon (diff+match) ──▶ Postmark
                     │
                     └─▶ DLQ (failed processing)

  Secrets (DATABASE_URL, POSTMARK_*) in SSM · logs/alarms in CloudWatch
```

- **S3** holds the uploaded export and is the raw store behind `cv_raw_records` (§6); the upload
  fires an **S3 event** — no polling.
- **SQS (+ DLQ)** sits between upload and processing — see **"Why SQS now"** below.
- **One Lambda** runs parse → match (§8) → diff vs. last-known status → notify (§9). It's the
  **template for every future bulk-pull source** — only the trigger changes (S3-upload now →
  EventBridge schedule later).
- **Neon** (`cv_` schema) + **Postmark** reused as-is; **secrets in SSM**. Use Neon's pooled string
  / `@neondatabase/serverless` so Lambda concurrency doesn't exhaust Postgres.
- **Admin upload UI** stays in the **existing app's admin area** (reuse `requireRole`) — avoids
  standing up separate auth for one screen.

**Why SQS now (the MVP could technically run without it):**
- **Decouples upload from processing** — the upload returns fast; a slow parse or a failure doesn't
  fail the admin's upload.
- **Retry / DLQ / idempotency rehearsal** — manual uploads already require "re-uploads must not
  re-notify" (§3.1); routing through SQS exercises that machinery from day one, before higher-volume
  automated sources arrive.
- **It's the seam for automation** — every future producer (scheduled bulk pull, scraper) enqueues
  to the same consumer, so adding one later is a drop-in, not a re-architecture.
- **Cheap to remove** — if it proves unnecessary, collapse to S3-event → Lambda directly. Low
  lock-in, so planning to keep it costs almost nothing.

**IaC:** Terraform — AWS-native, and the user has many years of Terraform experience, so it's the
lowest-friction home for the S3 + SQS + Lambda + SSM + CloudWatch footprint and scales cleanly to
the post-MVP Fargate/EventBridge constellation. The Lambda is TypeScript (esbuild-bundled, deployed
as a zip via `aws_lambda_function`). Resource list in §15.3.C.

### The organizing principle: split by fetch shape, NOT by source

The instinct to "classify every job by source and run a consumer per source" reaches for the
right property (isolation) on the wrong axis. The axis that decides whether you need a **queue**
is the **fetch shape**, and there are only two:

- **Bulk pull** — one request returns many records, then you diff + match (OpenDSD CE, county
  delinquent tax file, SOS Master Unload). **No queue.** Just: **EventBridge Scheduler → one
  Lambda (or one scheduled Fargate task) → fetch → diff → match → notify.** These are crons.
- **Per-target probe** — N independent fetches, one per entity/parcel, against a
  rate-limited/blockable government site (per-entity bizfile scrape, per-parcel tax lookup).
  **This is where a queue earns its keep** — polite throttling, per-item retry/backoff, a
  dead-letter for failures. **SQS → Fargate worker pool (with the browser).**

So: **plain scheduled jobs for bulk pulls; one SQS queue feeding a worker pool for the probes.**
`source` becomes just a `type` column on the job, not a separate pipeline.

### Target AWS shape

```
  Bulk pulls (no queue):
    EventBridge Scheduler ──cron──▶ Lambda / scheduled Fargate ──▶ Neon (diff+match) ──▶ Postmark
    (OpenDSD CE, county tax bulk, SOS bulk)

  Per-target probes (queue):
    EventBridge ─▶ enqueuer ─▶ SQS ─▶ Fargate worker pool (Playwright) ─▶ Neon (diff+match) ─▶ Postmark
    (per-entity bizfile, per-parcel tax lookup)   │
                                                  └─▶ SQS DLQ (failed probes)

  Cross-cutting: secrets in SSM Parameter Store / Secrets Manager · logs+alarms in CloudWatch
```

- **Match + notify** is shared code: whatever runs the job queries Neon (APN/entity match) and
  calls **Postmark**. Written once (§3), not per source.
- **Headless browser quarantine:** the brittle `.aspx` scrapers (tax portal, possibly bizfile,
  Accela fallback) run as **isolated Fargate tasks**, so a flaky Playwright process can't share a
  runtime with — or take down — anything else.
- **Neon connections:** Lambda fan-out can exhaust Postgres connections — use a pooler / limit
  concurrency. Bulk pulls are single-invocation so this mostly bites the probe workers.

### The one honest cost of AWS (the thing to actually weigh)

Not data access — **a second operational home.** Deploys, logs, alarms, and "where do I go at
11pm when a job didn't fire" now live somewhere other than the main app. For a solo dev that's
the real tax. The judgment: a **four-source monitoring pipeline with browser scrapers** is meaty
enough that the second home pays for itself. (Had every source turned out to be clean API/bulk
with no browser, the call would flip toward keeping it next to the app.)

### Don't over-build

The mistake to avoid is **not** AWS — it's reflexively wiring **SQS + Lambda + EventBridge for
everything**. Bulk pulls are crons; only the probes get the queue. That keeps us from standing up
a five-service constellation to move ~50 text records a day.

### Cross-cutting cost: Google Geocoding

APN-first matching (§8) means geocoding is a **fallback**, not the main path, so volume is tiny.
When used, Google geocoding is ~**$5 / 1,000 requests** with a monthly free credit, and we
**cache geocodes** (never geocode the same address twice) → negligible. Postmark we already pay
for.

### Appendix — the v0.1 stack options (kept for context)

The v0.1 comparison evaluated **A — TS worker on Fly.io/Railway**, **B — AWS Lambda + EventBridge
+ Terraform**, and **C — Supabase Edge Functions + pg_cron**. With the OpenDSD API found (no
browser needed for the primary CE path) *and* the AWS decision above, the live picture is:
**bulk pulls = a small Lambda/Fargate cron (essentially Option B, minimal), probes = SQS +
Fargate (the browser home Option C never could be).** Option C (Supabase Edge) is viable **only**
for clean API/bulk sources and **cannot** run the headless scrapers, so it's out for the probe
workers. Option A (Fly/Railway) remains a perfectly good fallback if the AWS second-home tax ever
feels too heavy for the value — the acquire/process/notify decoupling (§3) keeps that swap cheap.

---

## 8. Processing detail — target → owner (APN-FIRST)

This is the heart of the value and the trickiest part. **v0.2 change: match on APN, not address
strings.**

1. **Prefer the APN.** OpenDSD CE records carry an **`APN`**; county tax data is keyed by APN;
   entity standing is keyed by entity id. APN is an **exact key** — match on it first.
   - Address matching against portal text ("Av, Bldg, SAN DIEGO CA 92154") is a fuzzy-
     normalization swamp. Avoid it as the primary key.
2. **APNs already exist on our properties (audit + normalize, don't re-enrich).** We already
   populate `parcels.apn_original` and `property_transactions.apn` from SFR (`insert-properties.ts`).
   The leverage is **(a)** auditing the **APN null-rate** and **(b)** **normalizing APN format
   across sources** — SFR's APN vs. San Diego County / OpenDSD's — because APN is only an "exact
   key" once both sides are normalized (dashes, spaces, leading zeros). Spend effort here, not on
   infra. Backfill missing APNs (e.g. County SITUS address → APN dataset) only for the gaps the
   audit finds.
3. **Match strategy, in order:**
   - **Exact APN match** against our property table (`match_method = apn`).
   - **Geocode → lat/lng proximity** as a fallback when APN is missing (`match_method = geocode`).
   - **Fuzzy address** (trigram / `pg_trgm`) as a last resort, with a confidence score
     (`match_method = fuzzy`).
4. Record **match_confidence** + **match_method**. Auto-notify only above a confidence threshold;
   queue low-confidence matches for review (especially early).
5. Resolve the matched property → owner/company → any of our **users** linked to it. **"Owner" is
   derived, not stored:** we treat the most-recent buyer (`property_transactions.buyer_id` where
   `sort_order = 1`) as the current owner — the last party that bought it; user links come from
   `company_members` / `company_claims`. For the nearby-CE rule (§5.2), the match is "within radius
   *R* of an owned APN."

> Reality check: many CE cases will match a property we have but **no user** who wants the alert.
> That's the "alerts product vs. lead-gen product" question in §13.

---

## 9. Notification integration (reuse existing infra)

- **In-app:** reuse the existing WebSocket notification layer — a fresh transition matched to a
  user → push a notification.
- **Email:** reuse Postmark. Likely a **new template per monitor** (e.g.
  `POSTMARK_CV_TEMPLATE_ALIAS` for code violations; standing/tax get their own) with the event
  summary, address/APN/entity, type, and a link into the app.
- **Idempotency:** every send is written to `cv_notifications_sent`; we never re-notify the same
  `(target, source, transition, recipient, channel)`.
- **Batching/digest:** consider a daily digest instead of per-event blasts to avoid spam.

---

## 10. Compliance / deliverability (flag early — important)

The events are public record, but **emailing property owners / entities who never signed up** is
a different thing from notifying our users:

- **Spam / CAN-SPAM** rules apply to unsolicited commercial email; bulk cold email also **wrecks
  Postmark sender reputation** and deliverability for our legit transactional mail.
- **Scraping legality:** government public-records sites are generally tolerated to scrape, but
  some carry **ToS restrictions and rate limits**, and a couple of these portals (county tax,
  possibly bizfile) **already block some traffic**. Prefer **official APIs / bulk data** where
  available; scrape **politely** (throttle, off-hours, cache) only as a fallback.
- **Strong recommendation for MVP:** only notify **existing users** about properties/entities
  they own or track. Treat "cold-notify any owner with a violation" as a separate, later,
  carefully-designed (and possibly opt-in / different-channel) feature.

---

## 11. Logging & observability (first-class, not an afterthought)

Acquirers silently rot, so this is built in from the start:

- **Structured run logs** per fetch (`cv_runs`): source, started/finished, records
  fetched/new/changed, errors, duration — visible in-app.
- **Alerting** on: zero records returned (likely the source changed or the watermark stuck),
  parse-error spike, fetch failures, geocode failures, notification failures, **and probe DLQ
  depth** (SQS dead-letter filling up = scrapers failing).
- **Raw payload retention** (`cv_raw_records`) so any parse bug is replayable.
- **CloudWatch** for logs/alarms/DLQ metrics (we're on AWS now); ship at least one "monitor went
  quiet" alarm per source.

---

## 12. Phased rollout

> **MVP NOTE (v0.4):** the MVP starts *before* Phase 0 below with **manual download → admin upload**
> (§3.1) — no automated acquisition. The phases below describe the **automated** path we graduate to
> afterward (the manual upload + parse + match + notify is the new Phase 1 in practice).

- **Phase 0 — Probe OpenDSD (no infra):** Hit the OpenDSD CE API directly and answer the gating
  question from §5.1 — **date-list query vs. by-ID/address only** — and confirm the CE fields +
  the `case_id` watermark approach. Deliverable: a sample JSON response + the field mapping for
  §6, and the chosen "new since deploy" mechanism.
- **Phase 1 — CE end-to-end on OpenDSD (the MVP spine):** One scheduled bulk pull (EventBridge →
  Lambda/Fargate) → land raw + observations → **APN-match** against our properties (requires the
  one-time **APN enrichment**, §8) → surface matched CE cases **in-app only** (read-only) so we
  can eyeball match quality before sending anything. Includes `cv_runs` + a "went quiet" alarm.
- **Phase 2 — Notify (users only):** Wire WebSocket + Postmark for matched **users**, with the
  idempotency ledger and a digest option. Compliance-safe scope (§10). Add the **nearby-CE**
  radius rule (§5.2) — same feed, second matching rule.
- **Phase 3 — Add the probe lane:** Stand up SQS + a Fargate worker. Start with **entity standing
  (FTB/SOI)** via the bizfile API if the key is easy, else per-entity probe. Reuse the
  diff/match/notify core; only the adapter is new.
- **Phase 4 — Property tax:** Add the tax monitor — **probe our APNs** around the calendar dates
  (Dec 10 / Apr 10 / June 30), or buy the county Delinquent Master file if probing gets blocked.
- **Phase 5 — Accela freshness fallback (only if needed):** If OpenDSD's lag proves unacceptable,
  add the headless Accela scraper as a Fargate task feeding the same CE pipeline.
- **Phase 6+ — Expand:** more jurisdictions via source adapters; richer violation classification;
  opt-in for non-user owners (only if/when compliance is sorted).

---

## 13. Open questions (need your input)

1. **OpenDSD date query (gating, §5.1):** does it support "list CE cases opened on date X / in
   range," or only by-ID/address? (If unknown, we proceed with the **CaseId watermark**.)
2. **Entity-standing access (§5.3):** register for the **bizfile official API key**, **buy the
   Master Unload bulk file** (~$100), use the new **bizfile data-request route** (master + weekly
   delta — shape TBD, §5.3 opt. 4), or **scrape** per entity? (Recommend: try the API key
   first; scrape only if the key is gated behind too much friction.)
3. **Property-tax access (§5.4):** **probe our APNs** a few times a year (recommended — cheaper,
   fresher) vs. **buy the county Delinquent Master file** (~$86)?
4. **Audience (drives compliance + matching):** an **alerts** product for our existing users
   about their own/tracked properties+entities, or a **lead-gen** product cold-contacting any
   owner? (Recommend: alerts-to-users first.)
5. **Nearby-CE radius (§5.2):** what radius *R* counts as "nearby," and is a nearby hit a
   different/lower notification severity than an on-property hit?
6. **Owner/entity data:** do we store enough to reach an owner/borrower directly (contact email)
   and to **map our properties to APNs** and **our deals/borrowers to CA entity ids**? This
   bounds both who we can notify and what we can match. (APN enrichment, §8, is the key
   dependency.)
7. **Violation taxonomy:** categorize each CE type, or forward the city's description text as-is
   for the MVP? (Recommend: forward as-is first; categorize later.)
8. **Cadence:** daily polling for CE is realistic (the source refreshes ~daily); entity standing
   weekly; tax a few times a year around the deadlines. Confirm these are acceptable.

---

## 14. TL;DR recommendation

1. **Don't scrape — use the OpenDSD API.** The CE data is queryable JSON with **APN + lat/lng +
   dates + investigator contact**. Accela scraping is a **freshness fallback only**.
2. **Build the state-transition core once** (monitors → observations → diff vs. last-known status
   → notify) so the four sources — and any fifth later — are just **adapters**.
3. **Match on APN, not addresses** — and note **APNs already flow from SFR** (`parcels.apn_original`,
   `property_transactions.apn`). The one-time work is an **APN-coverage audit + cross-source
   normalization**, not enrichment from scratch.
4. **Go AWS, right-sized, split by fetch shape:** bulk pulls (OpenDSD CE, county tax bulk, SOS
   bulk) = **EventBridge → Lambda/Fargate crons, no queue**; per-target probes (bizfile, tax
   lookup) = **SQS → Fargate worker pool with the browser**. Secrets in SSM, logs/alarms in
   CloudWatch. Don't reflexively SQS-everything.
5. **Scope the MVP to City-of-SD code enforcement + existing users**, reuse WebSocket + Postmark,
   raw-first storage, idempotent transition-based notifications, and loud logging — then add
   entity standing and property tax as new adapters on the same spine.

---

## 15. Implementation Plan — MVP (DECIDED v0.6)

The first buildable slice. Everything below is scoped to **what we actually build now**; the
deferred automation (§5/§7/§12) is explicitly out.

### 15.0 The three locked decisions (and what each removes from the build)

| Decision | Value | What it removes |
|---|---|---|
| **Source scope** | **City-of-SD code enforcement ONLY** (Accela CE export upload) | bizfile + tax parsers, entity-id matching, two-format ambiguity — all deferred to the second adapter |
| **Acquisition** | **Manual admin upload** (§3.1) | scrapers, headless browser, OpenDSD live API, Fargate, EventBridge schedules, the `case_id` watermark |
| **IaC** | **Terraform** | SST/CDK toolchain decisions |
| **Notify gate** | **In-app read-only first** | `cv_notifications_sent`, Postmark template, ws push — schema-aware, wired in the *next* phase |

The thing we are actually validating with this slice: **does APN-first matching of real CE export
rows against our property/ownership data produce trustworthy matches?** Everything is arranged to
answer that before a single email is sent.

### 15.1 Scope boundary

**In scope (this slice):**

- `cv_` schema in Neon (the MVP subset of §6 tables).
- APN coverage audit + a single canonical APN-normalization helper (§8).
- Terraform: S3 (uploads) + SQS (+DLQ) + one TS Lambda + SSM params + CloudWatch log group/alarms + IAM.
- Admin upload UI + endpoint in the **existing app** (`requireRole`), writing file → S3 + a
  `cv_raw_records` row.
- Lambda pipeline: **parse → normalize → APN-match → diff vs last-known status** (NO notify).
- Accela CE export parser (the one source-specific module).
- Read-only in-app review screen for matched CE cases + `cv_runs` visibility.
- Baseline + idempotency handling (first upload notifies nothing; re-uploads don't duplicate).
- Tests: parser unit, matcher unit, upload-endpoint access-control + validation integration,
  idempotency integration.

**Out of scope (deferred, do not build):** OpenDSD/any live API, scrapers/browser/Fargate,
EventBridge schedules, bizfile entity-standing parser, property-tax parser, nearby-radius matching,
geocode/fuzzy fallback matching, notifications (ws + Postmark + `cv_notifications_sent`),
cold-contacting non-users.

### 15.2 Repo layout

The CE monitor is **not in the existing app's request path**, but it shares the cv\_ schema and the
APN helper with the admin endpoint, so those live in our existing neutral layers (single source of
truth, no duplication):

```
ARV-DATA-PROJECT/
├── database/
│   ├── schemas/cv/                 # NEW: Drizzle cv_ tables (source of truth, imported by app + Lambda)
│   └── types/cv/                   # NEW: $inferSelect types for cv_ tables
├── shared/utils/apn.ts             # NEW: normalizeApn() — isomorphic, used by audit + matcher + (later) client
├── server/
│   ├── routes/cv.routes.ts         # NEW: POST /api/admin/cv/uploads, GET review endpoints (requireRole)
│   ├── controllers/cv.controllers.ts
│   └── services/cv.services.ts     # upload→S3 + cv_raw_records; read queries for review UI
├── client/src/
│   ├── api/cv.api.ts               # NEW: typed fetch wrappers
│   ├── pages/admin/CvUploads.tsx   # NEW: upload + review screens (admin area)
│   └── components/admin/cv/        # NEW: upload form, matched-cases table
└── cv-monitor/                     # NEW top-level workspace (the isolated compute)
    ├── infra/                      # Terraform: s3, sqs, lambda, ssm, cloudwatch, iam
    └── lambda/
        └── src/
            ├── handler.ts          # SQS handler → orchestrates the pipeline
            ├── parsers/accela-ce.ts# the ONE source-specific module (export rows → observations)
            ├── match.ts            # APN-first match (imports shared/utils/apn + database/schemas/cv)
            ├── diff.ts             # observation.status vs cv_status, baseline + transition detection
            └── persist.ts          # raw/observations/status/matches/runs writes (idempotent)
```

> **Dependency note (CLAUDE.md):** `cv-monitor/lambda` is a new inward consumer — it may import from
> `database` and `shared`, never from `client`/`server`. The admin endpoint (`server`) and the Lambda
> both import the cv\_ schema from `database`, so the two halves cannot drift.

### 15.3 Workstreams

Each is independently testable; dependencies noted. **A and B can start immediately and in parallel.**

#### A. Database schema — `cv_` (MVP subset of §6)

Create in `database/schemas/cv/`, push with `npm run db:push`. MVP needs only these tables (the rest
of §6 land with their phase):

- **`cv_sources`** — `id`, `slug` (`'sd-city-ce'`), `name`, `jurisdiction`, `source_type`
  (`code_enforcement`), `access_mode` (`upload`), `fetch_shape` (`bulk`), `baselined_at` (nullable —
  set when the first upload is processed; drives "notify nothing on first upload"), `enabled`,
  `created_at`. Seed one row.
- **`cv_raw_records`** — `id`, `source_id`, `s3_key`, `content_hash` (**unique** — duplicate-file
  guard), `original_filename`, `uploaded_by` (user id), `uploaded_at`, `status`
  (`uploaded`|`processing`|`parsed`|`failed`), `row_count` (nullable), `error` (nullable).
- **`cv_observations`** — `id`, `raw_record_id`, `source_id`, `target_key` (the **normalized APN**),
  `target_type` (`apn`), `external_id` (the CE `case_id`), `status` (e.g. `case_open`|`case_closed`),
  `details` (jsonb: open/close dates, street_address, lat, lng, description, investigator contact —
  the §5.1 fields), `observed_at`, `content_hash`. **Unique** `(source_id, external_id, content_hash)`
  for row-level idempotency.
- **`cv_status`** — `id`, `source_id`, `target_key`, `last_status`, `last_observation_id`,
  `last_transition_at`, `last_notified_status` (nullable — **column exists now, written in notify
  phase**), `updated_at`. **Unique** `(source_id, target_key)`. This is the diff baseline.
- **`cv_property_matches`** — `id`, `observation_id`, `property_id` (nullable),
  `company_id` (nullable), `match_method` (`apn` for MVP), `match_confidence`, `matched_at`.
- **`cv_runs`** — `id`, `source_id`, `raw_record_id`, `trigger` (`upload`), `started_at`,
  `finished_at`, `records_parsed`, `records_new`, `records_changed` (transitions detected),
  `matches_found`, `errors` (jsonb), `duration_ms`, `status`.

> **Deferred to their phase:** `cv_targets` (a registry with per-target metadata — `cv_status`'s
> `(source, target_key)` is sufficient for MVP), and `cv_notifications_sent` (notify phase).

#### B. APN audit + normalization (the matching prerequisite, §8)

1. **Audit** `parcels.apn_original` + `property_transactions.apn` null-rate for SD properties — a
   one-off SQL/script reporting coverage. This bounds how many CE rows *can* match.
2. **`shared/utils/apn.ts` → `normalizeApn(raw): string`** — strip dashes/spaces, normalize leading
   zeros, to a single canonical form. Both our APNs and the export's APNs pass through it before
   comparison (APN is only an "exact key" once both sides are normalized). Unit-tested against SD
   County / Accela format samples vs SFR format samples.
3. Backfill missing APNs **only** for the gaps the audit surfaces (County SITUS→APN), and only if
   the gap is large enough to hurt the validation — otherwise note and defer.

#### C. AWS infra — Terraform (`cv-monitor/infra/`)

- **S3 bucket** for uploads (versioned; lifecycle optional). This is the raw store behind
  `cv_raw_records`.
- **SQS queue + DLQ** (redrive after N attempts).
- **S3 → SQS event notification** on `s3:ObjectCreated:*` (no polling).
- **Lambda** (`nodejs20.x`, TS via esbuild zip), **SQS event source mapping** (batch size 1 for
  clean per-file idempotency early), env from **SSM** (`DATABASE_URL` pooled/`@neondatabase/serverless`).
- **SSM Parameter Store** params (by NAME only): `DATABASE_URL`; Postmark params added in notify phase.
- **IAM**: Lambda role (S3 get on the bucket, SQS consume, SSM read, CloudWatch logs); a least-priv
  user/role for the **existing app** to `PutObject` to the bucket.
- **CloudWatch**: log group + alarms (§G).

New env-var NAMES the existing app needs (provide values yourself; never commit): `AWS_REGION`,
`CV_UPLOAD_S3_BUCKET`, and app→S3 credentials (prefer an IAM role; otherwise the standard AWS
credential env names).

#### D. Admin upload endpoint + UI (existing app)

- **`POST /api/admin/cv/uploads`** — `requireRole` (admin), multipart file. Validates type/size,
  `PutObject` to S3, inserts a `cv_raw_records` row (`status: uploaded`, `uploaded_by`,
  `original_filename`, `s3_key`). Returns the raw-record id. **The S3 event — not this endpoint —
  triggers processing**, so the request returns fast (the §7 "decouple upload from processing" win).
- **Review read endpoints** — `GET /api/admin/cv/runs` and `GET /api/admin/cv/matches` (admin) for
  the read-only screen.
- **UI** — an admin-area page: an upload form + a matched-cases table (case_id, APN, address,
  status, matched property/company, match method/confidence) and a runs panel.
- **Access-control + validation integration tests are mandatory** for the new route (testing.md).
  Read `.claude/docs/access-control.md` before wiring `requireRole`.

#### E. Lambda processing pipeline (`cv-monitor/lambda/`) — parse → match → diff (no notify)

`handler.ts` consumes an SQS message (the S3 key), then:

1. **Idempotency gate** — read the S3 object, compute `content_hash`; if a `cv_raw_records` row with
   that hash is already `parsed`, no-op (absorbs duplicate/overlapping uploads, §3.1). Mark the row
   `processing`; open a `cv_runs` row.
2. **Parse** — `parsers/accela-ce.ts` turns export rows into normalized `cv_observations`
   (`target_key = normalizeApn(row.apn)`, `external_id = case_id`, `status`, `details`). This is the
   **only** source-specific code.
3. **Match** (`match.ts`, APN-first) — `normalizeApn` on both sides → exact match against
   `parcels.apn_original` / `property_transactions.apn` → resolve property → **current owner =
   most-recent buyer** (`property_transactions.buyer_id` where `sort_order = 1`) → company. Write
   `cv_property_matches` (`match_method: 'apn'`). Geocode/fuzzy fallback is deferred — unmatched rows
   are recorded as unmatched (visible in the review UI), not force-matched.
4. **Diff** (`diff.ts`) — for each observation, compare `status` to `cv_status` for
   `(source, target_key)`. **If `cv_sources.baselined_at` is null** (first upload for this source):
   seed `cv_status` for every row and set `baselined_at` — **emit zero transitions**. Otherwise a
   changed/new status is a transition; update `cv_status` (`last_transition_at`) and count it in
   `cv_runs.records_changed`. In read-only MVP a transition is **surfaced, not sent**.
5. **Finalize** — mark `cv_raw_records` `parsed` (or `failed` + `error`), close the `cv_runs` row
   with counts. Failures → SQS retry → DLQ.

#### F. Read-only review UI + `cv_runs` (the validation surface)

The deliverable that proves match quality before notify: matched cases with their APN, resolved
property/company, method, and confidence; unmatched cases listed separately; a runs panel showing
"last uploaded N days ago" + counts (staleness visibility, §3.1). **Pass `formatCompanyName`** on any
company name rendered (ARV.RAW-COMPANY-NAME). Read design-guidelines.md before building UI.

#### G. Observability (`cv_runs` + CloudWatch)

- `cv_runs` per upload (who/when/counts) surfaced in-app.
- CloudWatch alarms: **DLQ depth > 0**, Lambda error rate, and **"zero rows parsed"** (likely a
  changed export format) — at least one "monitor went quiet / broke" signal.

#### H. Testing (read testing.md first)

- **Parser unit** — a saved sample Accela CE export → expected observations (pin field mapping).
- **Matcher unit** — `normalizeApn` equivalence across SFR vs County/Accela formats; APN exact-match
  resolves to the right property → most-recent-buyer company.
- **Diff unit** — first-upload baseline emits no transitions; a status change emits exactly one.
- **Upload endpoint integration** — mandatory access-control (non-admin rejected) + validation
  (bad file rejected) per testing.md.
- **Idempotency integration** — re-uploading the same file produces no duplicate observations and no
  new transitions.

### 15.4 Build sequence (critical path)

```
  A (cv_ schema) ─┬─────────────────────────────► E (Lambda pipeline) ──► F (review UI) ──► H (tests)
  B (APN normalize + audit) ─┘ (E.match depends on B)        ▲
  C (Terraform: S3+SQS+Lambda+SSM+IAM) ─────────────────────┘ (E deploys onto C)
  D (admin upload endpoint + UI) ──► (produces the S3 event that drives E)
```

1. **A + B in parallel** — schema and the APN helper/audit unblock everything; neither needs AWS.
2. **C** — stand up the Terraform footprint (can deploy a stub Lambda first to prove S3→SQS→Lambda
   wiring end to end).
3. **D** — admin upload endpoint + UI; now a real file lands in S3 and enqueues.
4. **E** — the parse/match/diff Lambda (the meat). Validate against a **real downloaded export
   sample** (see §15.6).
5. **F** — read-only review UI; **eyeball match quality here — this is the MVP's exit criterion.**
6. **H** throughout (parser/matcher unit tests gate E; endpoint tests gate D).

### 15.5 The adapter seam (how source #2 plugs in)

When match quality is trusted, adding **entity standing (bizfile)** or any later source is, by
design, **one new file**: a parser in `cv-monitor/lambda/src/parsers/` that emits `cv_observations`
(with `target_type = 'entity'` and `target_key = entity id` instead of an APN). Schema, S3/SQS/Lambda
wiring, diff, runs, and the review UI are all shared and unchanged. If that turns out to be true, the
"new source = one adapter, not a new pipeline" thesis (§3) is proven.

### 15.6 Gating items before writing code

- **Download one real Accela CE export** (CSV/XLSX) — the exact columns/format are still TBD (§3.1)
  and pin the parser and the `cv_observations.details` mapping. **Do this first**; it de-risks E.
- **Run the APN audit (B.1)** before trusting match rates — if SD APN coverage is poor, fix that or
  the read-only review will look falsely empty.
- **Confirm the export carries an APN per case** (it should, mirroring the §5.1 OpenDSD fields). If
  it carries only an address, matching falls to geocode/fuzzy and the §8 fallback ladder moves into
  MVP scope — flag before committing to APN-only.

### 15.7 Definition of done (MVP)

- An admin uploads an Accela CE export through the app; it lands in S3 and a `cv_raw_records` row.
- The Lambda parses it, APN-matches against our properties, resolves owner companies, and writes
  observations / matches / status / a `cv_run` — **idempotently** (re-upload = no dupes, no new
  transitions; first upload = baseline, zero transitions).
- The admin can **review matched + unmatched CE cases in-app**, with APN, property/company, method,
  confidence, and upload recency.
- Unit + integration tests (15.3.H) pass; `npm run check` is clean.
- CloudWatch shows the run and would alarm on DLQ/zero-rows/errors.
- **No emails are sent** — notify is the next phase, gated on match quality looking good here.
