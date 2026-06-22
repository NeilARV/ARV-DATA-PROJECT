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

This needs a decision; it materially changes the data source.

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

## 5. Data source strategy (research before you build)

**Phase 0 spike (½–1 day, no infra):** before committing to a stack, manually answer:
1. Does the City publish code-enforcement / code-violation cases as an **open dataset or
   API** (Socrata `data.sandiego.gov`, an ArcGIS REST feature service, or an Accela API)?
   → If yes, we skip scraping entirely and the cheapest serverless option wins.
2. If not, what portal hosts the cases, and is it **server-rendered HTML** (scrape with a
   plain HTTP client + parser — light) or a **JS app** like Accela Citizen Access
   (needs a headless browser — heavier)?
3. What fields are exposed? At minimum we need: **address**, **violation type/description**,
   **case number**, **status**, **dates**. Owner is usually *not* published — that's fine,
   we resolve the owner ourselves from our DB.
4. Rate limits / terms of use / robots.txt — be a polite citizen, throttle, cache.

Outcome of Phase 0 picks the stack in §7.

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

## 7. Tech stack options (with rough pricing)

All three write to the **existing Neon Postgres**. They differ in *where the compute runs*
and *whether they can run a headless browser*. The right pick depends on the Phase 0 result.

### Option A — Dedicated Node/TS worker on Fly.io or Railway  ⭐ (recommended for MVP)
A small standalone TypeScript service (same language/skills as the rest of the team),
running its own scheduler (node-cron) and, if needed, **Playwright** for scraping. Deploys
as a container; can do *anything* (API fetch or full headless browser). Writes to Neon,
calls our main app's notification endpoint (or shares the DB).

- **Pros:** Same TS/Node skillset — fastest to build. Handles both API and headless-scrape
  modes, so we don't have to know the answer to Phase 0 before starting. Persistent logs.
  Trivial to run Playwright. Truly isolated from Replit.
- **Cons:** A always-on (or scheduled) box to babysit. Less "infra-as-code" than AWS.
- **Cost:** ~**$5–10/mo** (Fly.io shared-cpu-1x 256–512MB, or Railway hobby). Headless
  browser wants ≥512MB–1GB → maybe ~$10–15/mo. Geocoding via Google billed separately
  (see below). **Cheapest path to a working scraper.**

### Option B — AWS, Terraform IaC, Lambda + EventBridge (your original idea)
EventBridge Scheduler triggers a Lambda on a cron. Lambda fetches/processes, writes to Neon.
Logs to CloudWatch. Terraform defines it all.

- **Pros:** Proper IaC, pay-per-invocation, scales to many jurisdictions cleanly, great if
  the source is a clean **API** (light Lambda). Mature logging/alerting (CloudWatch + alarms).
- **Cons:** **Headless browser on Lambda is the painful part** — you need a container-image
  Lambda with a Chromium layer (`@sparticuz/chromium`), 1–2GB memory, and 15-min timeout
  ceilings. More moving parts and setup time. Terraform overhead for a 1-jurisdiction MVP is
  heavy. NAT/egress and Neon connection management add fiddliness.
- **Cost:** At our volume, Lambda + EventBridge is effectively **free → a few $/mo** (well
  inside free tier for light API polling). Container Lambdas for scraping cost a bit more but
  still single-digit dollars. The real cost here is **engineering time**, not the bill.

### Option C — Supabase Edge Functions + pg_cron
Deno edge functions on a schedule (pg_cron / Supabase scheduled functions), writing to
Postgres.

- **Pros:** Very cheap, minimal infra, nice if we ever move storage to Supabase. Great for an
  **API-only** source + lightweight processing.
- **Cons:** **Cannot run a headless browser** (no Chromium in the edge runtime) and short
  execution limits — so this only works if Phase 0 finds a clean API. If we have to scrape a
  JS portal, Option C is out.
- **Cost:** Effectively **$0 on the free tier**, ~$25/mo if we're already paying for Supabase Pro.

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

- **Phase 0 — Spike (½–1 day):** Identify the City of San Diego data source + mode (API vs
  scrape). Decide stack per §7. *No infra yet.* Deliverable: "here's the endpoint/portal and
  the fields we get."
- **Phase 1 — Acquire + Store MVP:** Stand up the chosen worker, fetch City of SD violations
  on a schedule, land raw + normalized rows. No notifications yet. Prove we can reliably get
  clean data. Dashboards/logs working.
- **Phase 2 — Process / Match:** Geocode + match against our property DB, owner resolution,
  confidence scoring, dedup. Surface matched violations **in-app only** (read-only view) so we
  can eyeball quality before sending anything.
- **Phase 3 — Notify (users only):** Wire WebSocket + Postmark for matched **users**, with
  the idempotency ledger and a digest option. Compliance-safe scope.
- **Phase 4+ — Expand:** More jurisdictions via source adapters; richer violation
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
