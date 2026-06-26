# Property Code-Violation Alerts — Automated Acquisition (Scraper) Design

> **Status:** Plan / pre-build. **Companion to [`code-violation.md`](code-violation.md)** — read that first.
> This document designs **only the automated ACQUIRE stage** (the headless scraper that replaces the
> manual "download the CSV → upload it" step). **Everything downstream is unchanged** and reused
> from the MVP: parse → match → resolve owner → diff → notify.
>
> **Decisions locked (2026-06-26):**
> 1. **Runtime:** a **dedicated, isolated cloud worker** (not the Express web box) — the headless
>    browser is too heavy/crash-prone to share the app's process. (= Plan B lane from the MVP doc.)
> 2. **Acquisition path:** the **General Search → date-range → "Download results"** flow (NOT the
>    address/city autocomplete). Navigating to General Search and clicking Search returns records
>    **most-recent-first**; we date-bound it and take the export. Simplest, most robust path.
> 3. **Posture:** **gentle, review-first** — robots.txt/ToS review *gates* always-on scheduling;
>    deliberately polite cadence; **manual upload stays as the permanent fallback.**

---

## 1. The idea in one paragraph

The MVP ([`code-violation.md`](code-violation.md)) gets San Diego code-enforcement complaints by
**a human downloading a CSV from the Accela portal and uploading it through our app.** That works,
but it depends on someone remembering to do it and lags intra-day complaint updates. This design
**automates exactly that one step**: a headless browser drives the public Accela portal the same way
a person would — open the Code Enforcement General Search, search the last ~2 weeks, click
**"Download results"** — and hands the **identical CSV** to the **identical pipeline** the MVP
already builds. The scraper is a **new trigger for an existing machine**, not a second machine.

This realizes **§8.1 of the MVP plan** ("Automate acquisition — scrape Accela"), which already
flagged this as *"the fragile, constantly-running, possibly headless-browser workload that
genuinely benefits from isolated compute."*

---

## 2. How this fits the MVP pipeline (the one architectural rule)

The MVP pipeline is six stages (MVP §4):

```
  ACQUIRE → INGEST → PARSE → MATCH → RESOLVE OWNER → DIFF → NOTIFY
```

**The scraper replaces ONLY `ACQUIRE`.** It produces the same artifact the manual flow produces — a
raw CSV — and drops it at the same `INGEST` seam. Stages PARSE…NOTIFY are the MVP's **pure functions**
(`parseCsv`, `matchAddress`, `resolveOwners`, `diffNewViolations`, `notify`), reused **as-is**.

```
  MANUAL (MVP):     admin downloads CSV ──► upload route ─┐
                                                          ├──► INGEST ──► PARSE ──► … ──► NOTIFY
  AUTOMATED (this): scheduled worker scrapes CSV ─────────┘        (one shared downstream pipeline)
```

This is the MVP doc's **"same core, two thin triggers"** rule (MVP §4.1, §5.2) made concrete. Two
consequences that shape everything below:

- **The scraper depends on the MVP existing first.** With no pipeline to feed, the scraper has
  nowhere to drop its CSV. **Phase 0 is "MVP is built."** (Sequencing in §10.)
- **Manual upload never goes away.** It is the permanent fallback when the scraper is down, blocked,
  or broken (§7 circuit breaker). The scraper is an *enhancement*, never a single point of failure.

---

## 3. Verified findings about the portal (checked against the live site, 2026-06-26)

| Finding | Detail |
|---|---|
| **URL** | `https://aca-prod.accela.com/SANDIEGO/Cap/CapHome.aspx?module=CE&TabName=CE` |
| **Tech** | **ASP.NET WebForms** — `__VIEWSTATE`, `__EVENTVALIDATION`, `__doPostBack`, `aspnetForm`, `WebForm_DoPostBackWithOptions`. State lives in server-side ViewState carried per postback. |
| **JavaScript** | **Required.** Page renders `"Please wait...Loading..."` then hydrates; search + paging are JS postbacks, not plain GETs. |
| **Auth** | **No login required** to search. |
| **Bot defenses** | **No visible CAPTCHA / reCAPTCHA** on the search form as of inspection. (Assume this can change — §9.) |
| **General Search fields** | Investigation Number (`CE-*`, wildcard), Investigation Status, **Start Date / End Date**, Street No., Direction, Street Name, Street Suffix, Unit No., Parcel No. — "Not all fields required." |
| **Key mechanic (user-confirmed)** | Going to General Search and clicking **Search** (no/loose criteria) returns results **most-recent-first**; a **"Download results"** control exports the CSV. The export matches the manual CSV shape in **MVP §3.2** (`Date, Record Number, Record Type, Address, Application Name, Status, Description,` + trailing comma). |

**Two conclusions that drive the design:**

1. **Raw-HTTP replay is the wrong tool.** Reproducing this with `fetch` means harvesting and
   replaying `__VIEWSTATE`/`__EVENTVALIDATION` across a postback sequence — extremely brittle and it
   breaks on any server-side change. The page *needs* JS. → **Use a headless browser
   (Playwright + Chromium).** This is a **new dependency** (no puppeteer/playwright in the repo
   today) and a real reason to isolate it (§8).
2. **Use the download button, not the HTML grid (§4).** The portal will hand us a structured CSV if
   we ask — so we should, and skip "reconstruct rows from a rendered table" almost entirely.

---

## 4. Acquisition strategy — "Download results", not HTML scraping

You raised the concern that scraped data "will likely be very unstructured." **The download button is
the answer to that.** Two possible approaches; we commit to A and keep B only as a break-glass
fallback:

| | **A — Download the export (PRIMARY)** | **B — Scrape the rendered grid (FALLBACK ONLY)** |
|---|---|---|
| **What** | Drive the UI, click **"Download results"**, capture the file | Read the results `<table>` row-by-row, paginate, rebuild records |
| **Output** | **The same structured CSV** as the manual flow | Loose HTML cells we must re-assemble |
| **Structuring needed** | **~none** — reuse the MVP's `parseCsv` verbatim | **Heavy** — column inference, paging, quirk-handling |
| **Fragility** | Low — one "export" control | High — breaks on any grid markup change |
| **When used** | Always | Only if the export control is removed/broken |

**Decision: approach A.** Because the export *is* the MVP's CSV, the "clean it up / structure it"
work you were worried about collapses into a thin **normalization shim** (§6) that only reconciles
minor differences (BOM, column order, encoding) between the scraped export and the hand-downloaded
one. The heavy structuring logic only ever exists in fallback B, which we hope never to ship.

---

## 5. The automation flow (Playwright)

A single headless Chromium session, scripted to mimic a careful human. **Selectors live in one
config object** so a portal layout change is a one-file fix (and a circuit-breaker trip, §7), never a
code hunt.

```
 1. Launch headless Chromium  (one context; realistic UA + viewport; downloads enabled)
 2. Navigate → CE General Search URL
 3. Wait for hydration        (form ready, "Please wait...Loading..." gone)
 4. Set Start Date = today − LOOKBACK_DAYS (~16);  End Date = today
        └─ bounds the export: politer (smaller payload) + deterministic window,
           instead of relying on default sort + an unknown export row-cap
 5. Click "Search" → await the results postback to settle
 6. Click "Download results" → capture the file via Playwright's download API (bytes in memory)
        └─ if the export control is absent → fallback B (paginate the grid) + alert
 7. Sanity-check the bytes     (non-empty; header row matches expected columns)
 8. Close the browser          (always, even on error — no leaked Chromium processes)
```

**Hardening baked into each step:** explicit per-step timeouts; human-paced delays (5–10s) between
actions; on any failure, capture a **screenshot + HTML snapshot** to Storage for debugging (§7); one
browser, zero parallelism against the portal (§7 politeness).

---

## 6. From download → existing pipeline (the ACQUIRE→INGEST seam)

Once we hold the CSV bytes, we converge onto the MVP's machinery:

1. **Store the raw file** to **Supabase Storage** (existing helper
   `getSupabase().storage.from(bucket).upload(path, buffer, …)`), timestamped path
   `code-violations/scraper/{YYYY-MM-DD}/{runId}.csv`. Same audit/re-parse benefit as manual uploads.
2. **Write a `cv_uploads` row** with **`source = 'scraper'`** (manual rows are `source = 'manual'`).
   Both paths share one audit/re-parse trail; the review screen treats them identically.
3. **Normalize → hand to the MVP pipeline.** A thin **`normalizeScrapedCsv`** adapter guarantees the
   scraper's bytes match the **exact normalized-row shape `parseCsv` already expects** (handles
   BOM/encoding/column-order drift; **validates the header** and quarantines + alerts on mismatch so
   we never feed garbage to the matcher). Then: **`parseCsv` → `matchAddress` → `resolveOwners` →
   `diffNewViolations` → `notify`**, untouched.
4. **Change-detection short-circuit (politeness + efficiency).** Hash the file (and/or compare the
   newest `recordNumber`/date) against the last successful run. **No new records → record the run as
   `no_change` and skip PARSE…NOTIFY entirely.** Because each export already covers ~2 weeks, the
   overwhelming majority of runs are no-ops — this keeps the downstream quiet and cheap. Idempotency
   on `cv_violations.recordNumber` (MVP §4.5) is the backstop even when the short-circuit is bypassed.

> Net new code for the seam is small: **`normalizeScrapedCsv`** + a `cv_uploads.source` column +
> the change-detection check. Everything else is the MVP's.

---

## 7. Scheduling & politeness — the "don't be invasive" requirement

You were explicit: **never intrusive, never a slowdown for the city's site.** Because "within a day"
already beats competitors, we have lots of slack to spend on politeness.

**Cadence**
- **Default: hourly**, configurable. The export covers **~2 weeks**, so we *cannot* miss a record even
  at daily cadence — hourly is purely for intra-day latency. **30-min doubles load for marginal
  benefit;** start hourly and only tighten if there's a real need. The knob is one env var.
- **Jitter:** randomize the minute-of-hour so we never hit on a robotic boundary.
- **Optional off-peak window:** restrict to, e.g., overnight PT. We have the latency budget for it.

**Per-run behavior**
- **One session, sequential, human-paced** — 5–10s between actions, no concurrency against the portal.
- **Identifiable & rule-respecting** — honest-but-realistic UA, honor `robots.txt`, optional contact
  string. **Never attempt to defeat a CAPTCHA, WAF, or rate-limit** (also keeps us ToS-clean, §9).
- **Run-lock** — a DB status row (the same soft-lock pattern as the existing `market_scan_queue`
  pipeline) so two runs never overlap; **stale-lock auto-reset** after a timeout (mirrors the data_v2
  60-min reset).
- **Backoff** — exponential backoff + jitter on transient errors, capped retries (no retry-storm).

**Circuit breaker (the safety valve)**
- After **K consecutive failures**, or on detecting a **CAPTCHA / login wall / changed layout**:
  **stop scheduling, alert an admin, and fall back to manual upload.** A failing or blocking site is
  never hammered. The breaker is reset by a human after they've looked.

---

## 8. Runtime & deployment — dedicated isolated cloud worker (your choice)

The headless browser must **not** live in the Express event loop — a Chromium OOM/crash there could
take down the web app. So the scraper is a **separate containerized Node worker** that shares the
**same Neon DB + Supabase Storage** and **bundles the MVP's pure pipeline functions** into its image
(again: same core, two triggers).

**Recommended compute: AWS Fargate scheduled task** (EventBridge Scheduler → ECS `RunTask`).
- A **long-running container fits a browser far better than Lambda** — the image ships Chromium, no
  250 MB-layer gymnastics, no 15-min cap anxiety, generous RAM for the browser.
- Neon is plain Postgres/TLS — reachable from the container with **no VPC peering**.
- Secrets via the platform store (**names only**, §11): the container reads `DATABASE_URL`,
  `SUPABASE_*`, `POSTMARK_*`, and the new `CV_SCRAPER_*`.
- **Alternatives:** a **Render/Fly scheduled worker** (simplest ops if we're not committed to AWS);
  **Lambda + `@sparticuz/chromium`** is *possible* but fiddly (browser packaging, cold starts) — note
  as a fallback, not the default.

**Build-first discipline (de-risk the fragile part before automating it):** develop the Playwright
flow as a **local script run by hand** against the live portal until selectors/timing/download
capture are rock-solid and the export provably equals the manual CSV. **Do not containerize or
schedule until the flow is reliable.** (Mirrors the MVP's "riskiest part first.")

---

## 9. Resilience & failure modes

| Failure | Detection | Handling |
|---|---|---|
| Selector/layout changed | element-not-found timeout | screenshot + snapshot → **circuit-break + alert** → manual fallback |
| Site down / slow | navigation timeout | backoff + retry, then circuit-break |
| CAPTCHA / login wall appears | challenge markers in DOM | **stop + alert** — never try to solve |
| ViewState/session expired mid-flow | postback error / redirect to start | restart flow from navigation (capped) |
| Cookie/consent or interstitial modal | known selectors | dismiss known modals; unknown → screenshot + alert |
| Zero results | empty grid / empty export | record run `no_change`, no-op |
| Export truncated / row-capped | exported count ≪ expected for the window | date-bound search already mitigates; else **paginate (fallback B)** + alert |
| Download never arrives | timeout on download event | retry once → fail the run |
| CSV columns changed | header validation in `normalizeScrapedCsv` | **quarantine file + alert** — do not feed the matcher |
| Leaked browser process | `finally` always closes context | run inside a per-run timeout that hard-kills the browser |

**Always-on:** every failed run persists a **screenshot + HTML snapshot** to a Storage scratch path so
a human can see exactly what the portal showed.

---

## 10. Observability & data model additions

**Minimal additions on top of the MVP's `cv_` tables** — `cv_violations` / `cv_matches` /
`cv_notifications_sent` are **source-agnostic and unchanged.**

| Change | Purpose | Notes |
|---|---|---|
| `cv_uploads.source` (`'manual'` \| `'scraper'`) | unify both acquisition paths in one audit trail | the review screen already reads `cv_uploads` |
| **`cv_scrape_runs`** (new) | scraper health/telemetry | `id`, `startedAt`, `finishedAt`, `status` (`success`/`no_change`/`failed`), `trigger` (`scheduled`/`manual`), `recordsFound`, `newRecords`, `rawRef` (Storage), `uploadId` (FK `cv_uploads`, nullable), `errorClass`, `errorMessage`, `screenshotRef` |

> **Migration note (inherited from MVP §4.2):** add these with a **targeted ALTER/migration**, *not*
> `npm run db:push` (push currently wants to truncate `market_scan_queue`).

**Admin surface:** extend the MVP's admin review screen with a small **scraper-health panel** (last
run, status, new-record count, last error, link to the screenshot). **Alert admins** on every failure
and on circuit-break (reuse the bell + Postmark paths the MVP already wires).

---

## 11. New env vars (NAMES ONLY — per ARV.SECRET-ACCESS)

The worker reuses existing `DATABASE_URL`, `SUPABASE_*`, `POSTMARK_*` and adds:

| Name | Purpose |
|---|---|
| `CV_SCRAPER_ENABLED` | global kill switch |
| `CV_SCRAPER_BASE_URL` | the SANDIEGO CE CapHome URL — **config, not code**, so a URL change or a new city is a config edit |
| `CV_SCRAPER_INTERVAL` | cadence (e.g. cron expr or minutes) |
| `CV_SCRAPER_LOOKBACK_DAYS` | search window size (default ~16) |
| `CV_SCRAPER_OFFPEAK_WINDOW` | optional allowed-hours window (PT) |
| `CV_SCRAPER_MAX_RETRIES` | per-run retry cap before circuit-break |
| `CV_SCRAPER_TIMEOUT_MS` | hard per-run timeout (kills a hung browser) |
| `CV_SCRAPER_ALERT_EMAIL` | admin recipient for failure/circuit-break alerts |

*(Never read/print values — reference by name only.)*

---

## 12. Phased build plan

- **Phase 0 — Prerequisite:** the **MVP ([`code-violation.md`](code-violation.md)) is built** — the
  pipeline the scraper feeds. The scraper is meaningless without parse → match → notify.
- **Phase 1 — Prove the automation (local script, manual runs):** Playwright flow
  navigate → date-range search → **Download results** → save CSV to disk. **Goal:** selectors/timing
  solid, download capture works, and the export **provably equals** the manual CSV. *(De-risk the
  fragile part first — nothing scheduled yet.)*
- **Phase 2 — Wire to the pipeline:** `normalizeScrapedCsv` → existing `parseCsv` → match → resolve →
  diff; land rows in the admin review screen **still notify-gated** (like MVP Phase 1). Add
  `cv_uploads.source`, `cv_scrape_runs`, and the change-detection short-circuit.
- **Phase 3 — Schedule + harden:** containerize; deploy as the **dedicated cloud worker**; schedule
  (**hourly + jitter**, off-peak optional); add circuit breaker, backoff, run-lock, failure
  screenshots, admin alerts, scraper-health panel. Enable user-facing notifications only once match
  quality is trusted (MVP Phase 2 gating still applies).
- **Phase 4 — Operate & tune:** monitor scrape health; tune cadence/politeness; tune the normalizer
  against real misses. **ToS/robots review must be signed off before "always-on."**

---

## 13. Open questions / risks

- **ToS / robots review is a gate (your "review-first" choice).** Government-portal scraping posture
  — complete the San Diego / Accela `robots.txt` + terms review **before** always-on scheduling.
  Manual upload covers us until then.
- **Selector fragility** — Accela updates can break the flow → centralized selectors + circuit
  breaker + manual fallback mitigate; expect occasional maintenance.
- **Silent export-schema drift** — columns could change → header validation in `normalizeScrapedCsv`
  catches it and quarantines rather than corrupting matches.
- **Anti-bot escalation** — a future CAPTCHA/WAF/rate-limit → detect, **stop, alert, never defeat it.**
- **Export row-cap on high-volume days** — date-bounding + count verification + paginate-fallback
  guard against a truncated window.
- **Browser ops/cost** — headless Chromium RAM/image-size/cold-start on Fargate → size the task; the
  no-op short-circuit keeps most runs cheap.
- **Coupling to the MVP** — cannot ship before the pipeline exists (Phase 0).
- **`##TMP` → `CE` duplicate alerts** — unchanged from MVP §4.5; the scraper inherits the same dedup.

---

### Sources (portal verification, 2026-06-26)
- Live target: **Accela ACA — San Diego Code Enforcement General Search** —
  `https://aca-prod.accela.com/SANDIEGO/Cap/CapHome.aspx?module=CE&TabName=CE` (ASP.NET WebForms; no
  login/CAPTCHA to search; "Download results" export)
- [Accela Citizen Access — Code Enforcement Records (SANDIEGO)](https://aca-prod.accela.com/SANDIEGO/Cap/CapHome.aspx?module=CE&TabName=CE)
- [Accela data-export automation as an API alternative — browser-automation approach + "5–10s delays" guidance](https://anchorbrowser.io/hub/accela-data-export-automation-api-alternative)
- [Accela Developer Portal — Citizen Access API (confirms restricted/no public API for most agencies)](https://developer.accela.com/docs/construct-api-citizenAccess.html)
- Companion: [`code-violation.md`](code-violation.md) — the MVP pipeline this scraper feeds (esp. §3.2 CSV shape, §4 shared design, §8.1 automation)
