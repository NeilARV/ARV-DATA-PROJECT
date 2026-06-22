# Code Violations Notification System — Design & Plan (v0.1 Draft)

> Status: **Initial concept.** This is a near-standalone app that reuses our existing
> Postgres database and notification/email infrastructure, but runs on isolated compute
> so it does **not** share the Replit server, the SFR data pipeline, or the existing cron jobs.
> Goal of this draft: agree on the shape, pick a tech stack, and scope an MVP. Details
> will firm up after we answer the open questions at the bottom.

---

## 1. The idea in one paragraph

Code violations are public record and published on city/county websites. We continuously
acquire them, figure out the **address** each violation is tied to, match that address
against **our property + ownership database** (we already know who owns what), and then
**notify the relevant party** — the owner, or whoever is doing the repair — using the
notification + email systems we already have. The pitch to the user: "We'll tell you the
moment a property you care about (or own, or are flipping) gets flagged by the city."

---

## 2. Why this is a separate app

- **Load isolation.** Our Replit box already runs the Express API, Vite, the SFR sync
  pipeline, email jobs, websocket layer, and cron. Adding a constantly-running scraper
  (especially a headless browser) on the same box risks starving everything else.
- **Different failure modes.** Scrapers break when a website changes its HTML. We do not
  want a flaky scraper taking down the main app, and we want its logs/alerts separate.
- **Different scaling/runtime needs.** Scraping wants either a persistent worker or a
  container with a headless browser — a different runtime profile than our request/response API.
- **Shared, not coupled.** It writes to the **same Neon Postgres** (its own schema/tables)
  and triggers notifications either by calling our existing API or by sharing the DB. That's
  the only coupling.

---

## 3. The three phases (the pipeline)

```
  ┌─────────────┐     ┌──────────────┐     ┌─────────────────────┐     ┌──────────────┐
  │  ACQUIRE    │ --> │   STORE      │ --> │   PROCESS / ENRICH  │ --> │   NOTIFY     │
  │ scrape/API  │     │ raw records  │     │ address → owner     │     │ ws + email   │
  └─────────────┘     └──────────────┘     └─────────────────────┘     └──────────────┘
```

### Phase 1 — Acquire
Pull code-violation records from the source on a schedule (e.g. every N hours, or daily).
Two possible modes, in order of preference:
1. **Official API / open dataset** (best): hit a JSON/CSV endpoint. Stable, fast, polite,
   no browser needed. → cheap serverless is enough.
2. **Web scrape** (fallback): drive the public portal with a headless browser
   (Playwright/Puppeteer), paginate, parse HTML. Fragile, heavier runtime, needs a container.

> **The single most important early task is figuring out which mode San Diego allows** (see
> §5 and the Phase 0 spike). It changes the tech stack and the cost.

### Phase 2 — Store
Land every record as **raw** first (immutable, exactly as fetched), then normalize. Keeping
the raw payload means when our parser is wrong we can re-process history without re-scraping.

### Phase 3 — Process / Enrich
- Normalize + geocode the violation address (we already have `GOOGLE_API_KEY`).
- Match address → a property in our DB → the owner/company.
- Classify the violation (type, severity, status) from the source text.
- Deduplicate (the same case shows up across runs) and decide "is this new / changed?"

### Phase 4 — Notify
Reuse what exists: the **WebSocket notification layer** for in-app, and **Postmark email**
for outbound. New violation matched to a known owner/user → fire a notification + email.
(Heavy caveat on emailing non-users — see §10 Compliance.)

---

## 4. Where do we start geographically — City vs County?

> **DECIDED: City of San Diego first.** ✅ One jurisdiction, one data source. County and the
> surrounding independent cities are deferred to later "source adapters." The rest of this
> section is kept as the rationale.

This materially changes the data source.

- **City of San Diego** (~1.4M people): one jurisdiction, one code-enforcement system,
  one data source to crack. Cleanest place to start. The City runs an **open data portal**
  (`data.sandiego.gov`) and a **Get It Done** 311 service-request system — both candidate
  feeds — plus an Accela-style permitting/enforcement portal.
- **San Diego County** (unincorporated areas): handled by the County's Planning &
  Development Services. Separate system again.
- **The trap:** "San Diego" colloquially includes Chula Vista, Oceanside, Escondido,
  Carlsbad, El Cajon, etc. — each an **independent city with its own code enforcement
  portal**. Trying to cover "San Diego County" really means integrating ~18 different
  sources. Do not do this for the MVP.

> **Recommendation:** Start with **City of San Diego only**, one data source. Treat each
> additional jurisdiction as a pluggable "source adapter" we add later. Design the schema
> so `jurisdiction` is a first-class column from day one.

---

## 5. Data source strategy — CONFIRMED: Accela Citizen Access (scrape)

> **CONFIRMED — there is no API.** The source is the City of San Diego's **Accela Citizen
> Access** portal, Code Enforcement module:
> `https://aca-prod.accela.com/SANDIEGO/Cap/CapHome.aspx?module=CE&TabName=CE...`
> This settles the API-vs-scrape question: **we must scrape**, which **eliminates Option C
> (Supabase Edge Functions)** and points at **Option A (TS worker + Playwright)**.

### What we know about the portal
- It's **Accela ACA**, an **ASP.NET WebForms** app (`.aspx`). This explains the behavior the
  user observed:
  - **Results don't appear from the URL alone.** You must load the page, fill the search form
    (city = San Diego, etc.), and click **Search** — results come back via a server postback.
  - **Pagination isn't in the URL.** Page 2/3/… are driven by **ViewState postbacks**, not
    query params. So "go to the URL on page 3" can't be reproduced by URL alone — state lives
    in the form/session, not the address bar. This is the classic ASP.NET WebForms pattern.
- **There is a "Download results" button.** This is the key finding — it almost certainly
  exports the current result set as a **CSV**. Driving that button is far more robust than
  scraping HTML table rows, and it likely gives us the full record (address, description,
  case #, status, dates) in one clean file.
- Fields visible in the results (per the user): **addresses**, **complaint/violation
  descriptions**, **records/status** — i.e. everything we need. Owner is not published; we
  resolve owner ourselves from our DB.

### Implications for how we acquire
1. **Headless browser is required** (Playwright/Puppeteer): load page → fill search form →
   click Search → click **Download results** → capture the CSV. We parse the CSV, not the HTML.
   This is the most robust automation path and avoids fighting ViewState pagination row-by-row.
2. If the download is gated or unreliable, fallback is to walk the paginated results via the
   browser (clicking through ViewState postbacks) — slower and more fragile; prefer the CSV.
3. **Be a polite citizen:** throttle, run off-hours, cache, don't hammer. Respect the portal's
   terms of use. One scheduled run/day to start (see cadence question in §13).

### Bootstrap before any scraper: manual CSV (user's own idea — do this first)
The user can already search and hit **Download results** to get the CSV by hand. So the
**zeroth deliverable** is a tiny **manual upload** path: each morning, download the CSV and
upload it into our app; the **process → match → notify** pipeline runs on it exactly as it
will for the automated feed. This:
- De-risks and validates the *entire* downstream pipeline (parse → geocode → owner match →
  notify) **before** we invest in the Playwright scraper.
- Tells us, operationally, **when records actually appear** (the user will monitor whether
  new violations land in the morning vs trickle in all day) — which sets the real polling
  cadence for the automated version.
- Gives us real sample CSVs to lock down the parser/schema against actual columns.

> **Outstanding:** the user is sending a **screenshot of the current results** + will confirm
> the exact CSV columns. Drop those into §6 to finalize the `cv_violations` field mapping.

Outcome: stack is effectively decided → **Option A** (see §7). Phase 0 collapses into
"confirm the CSV columns + confirm the download-button automation works headlessly."

---

## 6. Data model (first pass)

New tables, isolated in their own schema (e.g. `cv_` prefix or a `code_violations` schema):

- **`cv_sources`** — one row per jurisdiction/source adapter (City of SD, etc.): name,
  base URL, mode (api|scrape), polling cadence, last-run cursor, enabled flag.
- **`cv_raw_records`** — immutable raw payloads: source_id, fetched_at, external_case_id,
  raw_json/raw_html, content_hash (for dedup). Never edited.
- **`cv_violations`** — normalized: source_id, external_case_id (unique per source),
  raw_address, normalized_address, geocode (lat/lng), violation_type, description, status,
  opened_date, last_seen_at, first_seen_at, content_hash, processing_state.
- **`cv_property_matches`** — join from a violation to a property in our existing DB:
  violation_id, property_id, match_confidence, match_method (exact|fuzzy|geocode).
- **`cv_notifications_sent`** — idempotency ledger: violation_id, recipient, channel
  (ws|email), sent_at. Prevents double-notifying for the same case across runs.

Design principles: **raw-first**, **idempotent** (re-running a fetch never duplicates or
re-notifies), **content_hash** to detect "this case changed" vs "already seen."

---

## 7. Tech stack options (detailed breakdown)

All three write to the **existing Neon Postgres**. They differ in *where the compute runs*,
*whether they can run a headless browser*, and *how much ops/setup they demand*. The right
pick depends on the Phase 0 result (API vs scrape).

### At-a-glance comparison

| Dimension | A — TS worker (Fly/Railway) | B — AWS Lambda + EventBridge + Terraform | C — Supabase Edge Functions |
|---|---|---|---|
| **Language / runtime** | Node + TypeScript (our stack) | TS in Lambda, but config in HCL/Terraform | Deno + TypeScript (similar, minor API diffs) |
| **Headless browser (scrape JS portals)** | ✅ First-class (Playwright in container) | ⚠️ Possible but painful (container image + Chromium layer, 1–2 GB) | ❌ Not possible (no Chromium, short timeouts) |
| **Clean API fetch (no browser)** | ✅ Easy | ✅ Easy & ideal | ✅ Easy & ideal |
| **Scheduling** | node-cron in-process, or platform cron | EventBridge Scheduler (managed cron) | pg_cron / Supabase scheduled functions |
| **Execution time limit** | Unlimited (long crawls OK) | 15 min hard ceiling per invocation | Short (seconds) — fine for API, not big crawls |
| **Cold starts** | None (warm worker) or fast container | Yes (container Lambdas slow to spin) | Minimal |
| **State between runs** | Easy (in-memory + DB cursor) | Stateless — must persist cursor to DB each run | Stateless — cursor in DB |
| **Logging / observability** | Platform logs + our own `cv_runs` table | CloudWatch (powerful, more setup) | Supabase logs (basic) + our `cv_runs` table |
| **Infra-as-code** | Minimal (Dockerfile + one config) | Full IaC via Terraform (the main benefit) | Minimal (function + cron) |
| **Setup / build effort** | **Low** — closest to what we already do | **High** — AWS account, IAM, VPC/NAT, Terraform | **Low–Medium** — if API-only |
| **Ops burden ongoing** | Babysit one small box | Mostly managed, but more surface area | Mostly managed |
| **Isolation from Replit** | ✅ Full | ✅ Full | ✅ Full |
| **Vendor lock-in** | Low (portable container) | High (AWS-specific glue) | Medium (Supabase-specific) |
| **Scales to many jurisdictions** | Good (add workers/queues) | Excellent (per-source Lambdas) | Good (API-only sources) |
| **Cost at MVP volume** | ~$5–15/mo | ~$0–5/mo (eng time is the real cost) | ~$0 (free tier) / $25 if on Pro |

### Option A — Dedicated Node/TS worker on Fly.io or Railway  ⭐ (recommended for MVP)
A small standalone TypeScript service — same language and patterns as the rest of the team —
running its own scheduler and, when needed, **Playwright** for scraping. Deploys as a
container that can do *anything*: a clean API fetch or a full headless-browser crawl. Writes
to Neon and triggers notifications by calling our main app's API or sharing the DB.

- **What you actually build:** a Dockerfile, a `node-cron` (or platform-cron) entrypoint, the
  source adapter, and the processing code. That's it. Deploy = `fly deploy` / `railway up`.
- **Pros:**
  - Fastest to build — it's the stack we already write every day.
  - **Works regardless of Phase 0** (API *or* headless scrape), so we can start now without
    knowing the answer.
  - No execution-time ceiling — long, polite, paginated crawls are fine.
  - Persistent process = easy to keep a warm browser, rate-limit politely, hold a cursor.
- **Cons:**
  - One small always-on (or scheduled) box to babysit and patch.
  - Less formal infra-as-code than AWS (mitigated: it's just a Dockerfile + one config file).
  - You manage your own retry/alerting plumbing (but we want a `cv_runs` table anyway).
- **Cost:** ~**$5–10/mo** for a shared-CPU 256–512 MB instance (API-only). A headless browser
  wants ≥512 MB–1 GB → ~**$10–15/mo**. Scheduled (not always-on) variants can be cheaper.

### Option B — AWS: Terraform IaC + Lambda + EventBridge (your original idea)
EventBridge Scheduler fires a Lambda on a cron; the Lambda fetches, processes, writes to Neon;
CloudWatch captures logs/alarms; Terraform defines all of it.

- **What you actually build:** an AWS account + IAM roles, a Terraform project, the Lambda
  handler, EventBridge rules, CloudWatch alarms, and (for scraping) a **container-image Lambda
  bundling Chromium** (`@sparticuz/chromium`) at 1–2 GB memory. Plus Neon connection handling
  from Lambda (connection pooling / data API to avoid exhausting Postgres connections).
- **Pros:**
  - **Real infra-as-code** — reproducible, reviewable, the strongest long-term ops story.
  - Pay-per-invocation; effectively free at our volume for light API polling.
  - Managed cron, mature logging/alerting (CloudWatch), clean per-source scaling later.
- **Cons:**
  - **Headless scraping is the pain point** — container Lambdas, the 15-min ceiling, cold
    starts, and bigger memory. If Phase 0 says "scrape," this is the most work.
  - Heaviest setup for a 1-jurisdiction MVP — AWS account, IAM, VPC/NAT egress, Terraform
    learning curve. The real cost is **engineering time, not the bill**.
  - Highest vendor lock-in (AWS-specific glue).
- **Cost:** Lambda + EventBridge is **~$0–few $/mo** (inside free tier for light polling);
  container scraping Lambdas a bit more, still single digits. Eng time dominates.

### Option C — Supabase Edge Functions + pg_cron
Deno edge functions on a schedule (`pg_cron` / Supabase scheduled functions) that fetch and
process, writing to Postgres.

- **What you actually build:** a Deno edge function (TS, slightly different APIs than Node), a
  pg_cron schedule, and the processing code. Minimal infra.
- **Pros:**
  - Very cheap, minimal infra, tidy if we ever consolidate storage on Supabase.
  - Great fit for an **API-only** source + light processing.
- **Cons:**
  - **Cannot run a headless browser** (no Chromium) and **short execution limits** — so this
    is viable *only if Phase 0 finds a clean API*. If we must scrape a JS portal, Option C is out.
  - Deno runtime differs slightly from our Node code (small porting friction).
- **Cost:** **~$0** on the free tier; ~**$25/mo** if we move to / already pay for Supabase Pro.

### How the Phase 0 result maps to the choice
- **Clean API / open dataset found** → any option works; pick **C** (cheapest, simplest) or a
  tiny **B** Lambda if we want the AWS/IaC foundation.
- **Must scrape a JS portal** → realistically **A** (or a heavyweight container Lambda under B).
  **C is eliminated.**
- **Don't know yet / want to start now** → **A**, because it covers both outcomes and we can
  migrate the *acquire* step to B or C later without touching process/notify.

### → DECISION (given the Accela finding in §5)
The source is an **ASP.NET WebForms portal requiring a headless browser** (form + Search +
ViewState pagination + CSV download). That **eliminates Option C** and makes a container with
Playwright the natural home. **Pick Option A (TS worker on Fly.io/Railway + Playwright).** It
runs the browser trivially, has no execution-time ceiling for the crawl/download, and is our
existing skillset. Option B stays a *later* possibility only if we want AWS IaC — but a
container scraping Lambda is strictly more work than Option A for the same result.

### Cross-cutting cost: Google Geocoding
Whatever stack we pick, geocoding addresses costs ~**$5 per 1,000 requests** (Google), with a
monthly free credit. We cache geocodes (never geocode the same address twice) → negligible at
City-of-SD volume. Postmark email we already pay for.

### Recommendation
- **If Phase 0 finds a clean API/open dataset** → **Option C** (or a tiny Option B Lambda).
  Pennies/month, minimal ops.
- **If Phase 0 says we must scrape a JS portal** → **Option A** (Fly.io/Railway TS worker).
  Fastest to build with our skills, handles the browser, ~$10/mo.
- **Default bet, build-first:** **Option A.** It works regardless of the Phase 0 outcome, so
  we can start immediately and migrate the *acquire* step to serverless later if a clean API
  turns up. Keep the acquire/process/notify stages decoupled so swapping the stack is cheap.

---

## 8. Processing detail — address → owner

This is the heart of the value and the trickiest part.

1. **Normalize** the source address (strip unit noise, standardize "St/Street", uppercase to
   match our ALL-CAPS DB convention).
2. **Match strategy, in order:**
   - Exact normalized-string match against our property table.
   - Geocode → match by lat/lng proximity (handles formatting differences).
   - Fuzzy match (trigram / `pg_trgm`) as a last resort, with a confidence score.
3. Record **match_confidence** and **match_method**. Only auto-notify above a confidence
   threshold; queue low-confidence matches for review (especially early on).
4. Resolve the matched property → owner/company → any of our **users** linked to it.

> Reality check: many violations will match a property we have but **no user** who wants the
> alert. That's the "is this a lead-gen product or an alerts product?" question in §13.

---

## 9. Notification integration (reuse existing infra)

- **In-app:** reuse the existing WebSocket notification layer — new violation matched to a
  user → push a notification.
- **Email:** reuse Postmark. Likely a **new template** (e.g. `POSTMARK_CV_TEMPLATE_ALIAS`)
  with the violation summary, address, type, and a link into the app.
- **Idempotency:** every send is written to `cv_notifications_sent`; we never email the same
  (violation, recipient, channel) twice.
- **Batching/digest:** consider a daily digest instead of per-violation blasts to avoid spam.

---

## 10. Compliance / deliverability (flagging early — important)

The violations are public record, but **emailing property owners who never signed up** is a
different thing from notifying our users:
- **Spam / CAN-SPAM** rules apply to unsolicited commercial email; bulk cold email also
  **wrecks Postmark sender reputation** and deliverability for our legit transactional mail.
- **Strong recommendation for MVP:** only notify **existing users** about properties they own
  or are tracking. Treat "cold-notify any owner in the county" as a separate, later,
  carefully-designed (and possibly opt-in / different-channel) feature. This keeps us safe and
  protects email deliverability.

---

## 11. Logging & observability (you called this out as important)

Because scrapers silently rot, this is first-class, not an afterthought:
- **Structured run logs** per fetch: source, started/finished, records fetched, new, changed,
  errors, duration. Persist a `cv_runs` table so we can see history in-app.
- **Alerting** on: zero records returned (likely the site changed), parse-error rate spike,
  fetch failures, geocode failures, notification failures.
- **Raw payload retention** (the `cv_raw_records` table) so any parse bug is replayable.
- Wherever we host (CloudWatch / Fly logs / Railway logs), ship logs somewhere queryable and
  set at least one "scraper went quiet" alarm.

---

## 12. Phased rollout

- **Phase 0 — Confirm CSV (no infra):** Source is already identified (Accela ACA, §5). Remaining
  spike work: download the **Download results** CSV by hand, lock down the **exact columns**,
  and confirm the download button can be driven headlessly. Deliverable: a sample CSV + the
  field mapping for §6.
- **Phase 1 — Manual CSV bootstrap (do this first):** A simple **CSV upload** screen/endpoint.
  Each morning the user downloads the CSV from Accela and uploads it; the **process → match →
  notify** pipeline runs on it. No scraper yet. This validates the *entire* downstream pipeline
  on real data, surfaces the real publish cadence, and de-risks everything before we build the
  browser automation.
- **Phase 2 — Automated acquire (Playwright worker):** Stand up the Option A TS worker, drive
  Accela headlessly (search → download CSV), land raw + normalized rows on a schedule. Replaces
  the manual upload. Dashboards/logs (`cv_runs`) + "scraper went quiet" alarm working.
- **Phase 3 — Process / Match:** Geocode + match against our property DB, owner resolution,
  confidence scoring, dedup. Surface matched violations **in-app only** (read-only view) so we
  can eyeball quality before sending anything. (Built against Phase 1 data, hardened in Phase 2.)
- **Phase 4 — Notify (users only):** Wire WebSocket + Postmark for matched **users**, with
  the idempotency ledger and a digest option. Compliance-safe scope.
- **Phase 5+ — Expand:** More jurisdictions via source adapters; richer violation
  classification; opt-in for non-user owners (only if/when compliance is sorted).

---

## 13. Open questions (need your input)

1. **City vs County of San Diego** for the MVP? (Recommend City only.)
2. **Audience:** is this an **alerts** product for our existing users about their own/tracked
   properties, or a **lead-gen** product where we cold-contact any owner with a violation? The
   answer drives the compliance and matching design.
3. **Violation taxonomy:** do we need to understand/categorize each violation type, or is the
   city's own description text good enough to forward as-is for the MVP? (Recommend: forward
   the description as-is first; categorize later.)
4. **Cadence:** how "real-time" is real-time? Cities publish in batches — hourly or daily
   polling is realistic; true second-by-second isn't, because the source itself isn't live.
5. **Stack preference:** are you set on AWS+Terraform, or open to the faster Option A
   (Fly/Railway TS worker) for the MVP and migrating later?
6. **Owner data:** do we currently store enough to reach a property's owner directly (contact
   email), or only the company? This bounds who we can actually notify.

---

## 14. TL;DR recommendation

1. **Spike first** to learn whether City of San Diego gives us an **API** (cheap serverless)
   or forces a **scrape** (needs a browser-capable worker).
2. **Build the MVP as a standalone TypeScript worker (Option A, Fly.io/Railway, ~$10/mo)** —
   it works either way, matches our skills, and keeps all load off Replit.
3. **Scope MVP to City of San Diego + existing users only**, reusing our WebSocket + Postmark
   stack, with raw-first storage, idempotent notifications, and loud logging.
4. Keep `acquire` / `process` / `notify` decoupled so we can later swap the acquire step to
   AWS Lambda/EventBridge or Supabase functions without rewriting the rest.
