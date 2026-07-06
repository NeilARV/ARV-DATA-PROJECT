# Railway Deployment & Integration Guide

> **Status:** Planning / reference. This is a follow-along guide to move hosting from
> Replit to Railway and stand up a **staging + production** workflow. It documents what
> the codebase already does, what works with zero code changes, and the single small code
> change needed to make a staging server safe.
>
> **Nothing in this doc has been applied.** It is analysis + instructions only.

---

## TL;DR

- **Production on Railway is a pure lift-and-shift — zero code changes.** Your existing
  `npm run build` / `npm run start` scripts, `$PORT` binding, `trust proxy`, secure cookies,
  Neon session store, WebSockets, and in-process cron all work as-is on a Railway persistent
  service.
- **Staging needs exactly one small code change** (an `APP_ENV` gate) so it doesn't send real
  emails, burn SFR API quota, or write to production storage. Described in Phase 2 — not yet done.
- **Do this in two phases:** (1) stand up production and cut over DNS, (2) add staging on a Neon
  database branch. You get the Vercel-style "two URLs, git-push deploys" workflow, plus real log
  streaming and automatic crash-restart — the two Replit pains that prompted this.

---

## Why Railway fits this app

The app is **one long-running Node process** ([server/index.ts](../../server/index.ts)) that:

1. Holds **WebSocket** connections with an in-memory client registry
   ([server/websocket/registry.ts](../../server/websocket/registry.ts))
2. Runs **~20 in-process cron jobs** ([server/jobs/index.ts](../../server/jobs/index.ts)) — the
   data pipeline (scan windows + consumer), 8 daily MSA emails, company enrichment, and cleanup jobs
3. Drives **code-violation processing** inline from the upload endpoint
4. Serves both the API and the built React SPA from the same origin

Railway runs exactly this shape — a persistent container — so none of it has to be rewritten
(unlike Vercel, which would force the WebSocket layer and every cron job to be re-architected).

---

## Facts this guide relies on (verified against the code)

| Concern | What the code already does | Implication for Railway |
|---|---|---|
| **Build** | `vite build` → `dist/public`, `esbuild server/index.ts` → `dist/index.js` ([package.json](../../package.json) `build`) | Railway runs `npm run build` unchanged |
| **Start** | `cross-env NODE_ENV=production node dist/index.js` (`start`) | `cross-env` sets `NODE_ENV` at runtime — **you do not set it in Railway** (see Gotchas) |
| **Port** | `parseInt(process.env.PORT \|\| '4000')`, binds `0.0.0.0` in production ([index.ts:65-69](../../server/index.ts#L65-L69)) | Railway auto-injects `PORT`; nothing to configure |
| **Proxy / cookies** | `app.set('trust proxy', 1)`, session `proxy: true`, `cookie.secure` when `NODE_ENV=production` ([app.ts:26-58](../../server/app.ts#L26-L58)) | Correct for a TLS-terminating edge — secure cookies work out of the box |
| **Sessions** | Stored in Neon `sessions` table via `NeonSessionStore` (keyed on `DATABASE_URL`) | Survive restarts/redeploys; no sticky sessions needed |
| **Static serving** | `serveStatic` serves `dist/public`, SPA fallback to `index.html` ([vite.ts:62-77](../../server/vite.ts#L62-L77)) | Single service serves API + frontend, same origin |
| **WebSockets** | `ws` server attached to the HTTP server, same port | Railway supports WebSockets on the service port with no extra config |
| **Cron gating** | Heavy jobs gated on `NODE_ENV === 'production'` ([jobs/index.ts:59](../../server/jobs/index.ts#L59), 99, 122, 135) | **This is why staging needs the `APP_ENV` change** — see Phase 2 |
| **Storage buckets** | `*-prod` vs `*-dev` chosen by `NODE_ENV` ([lib/supabase.ts:4-26](../../server/lib/supabase.ts#L4-L26)) | Staging with `NODE_ENV=production` would write to **prod** buckets unless changed |

There is **no dedicated health endpoint** today. `GET /` returns the SPA `index.html` with `200`,
which is a fine Railway health check. (An optional `/api/health` route is noted in the Appendix.)

---

## Prerequisites

- A Railway account (Hobby plan is fine to start; ~$5/mo credit tier or the $20/mo Pro tier for
  two always-on services).
- GitHub repo connected to Railway (Railway deploys from a branch on push).
- Access to your existing secret **values** in Replit's Secrets manager. You'll copy these into
  Railway. **Do not read them from any `.env` file** — copy from Replit's Secrets UI, referencing
  variables by **name** only (list below).
- The Neon dashboard (for the production `DATABASE_URL` and, in Phase 2, to create a branch).

---

## Environment variables (names only — copy values from Replit Secrets)

Set these as Railway **service variables**. Values come from your current Replit Secrets, not from
any file in the repo.

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Neon connection string (prod). Staging uses a **Neon branch** URL — see Phase 2. |
| `SESSION_SECRET` | **Reuse the same value as Replit** so existing login sessions stay valid after cutover. A different value just logs everyone out once. |
| `SFR_API_URL` | SFR data API base URL |
| `SFR_API_KEY` | SFR data API key |
| `POSTMARK_SERVER_API_KEY` | Postmark server token (transactional email) |
| `POSTMARK_ACCOUNT_TOKEN` | Postmark account token |
| `DEFAULT_CONTACT_RECIPIENT` | Default contact/notification recipient |
| `DEFAULT_FROM_EMAIL` | Default outgoing sender |
| `GOOGLE_API_KEY` | Google Maps / Geocoding |
| `MICROLINK_API_KEY` | Optional (link previews work without it) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key (server-side Storage) |

**Do NOT set these in Railway:**

- `PORT` — Railway injects it automatically.
- `NODE_ENV` — the `start` script sets it via `cross-env`. Setting `NODE_ENV=production` as a
  Railway variable would apply at **build** time too and cause `npm` to skip `devDependencies`
  (vite, esbuild, tailwind…), breaking the build. Leave it unset. (See Gotchas.)

Recommended (not a code change, set as a Railway variable):

- `NIXPACKS_NODE_VERSION=20` — pins Node 20 to match Replit (`nodejs-20`) and satisfy
  `import.meta.dirname`, which the build and runtime rely on (needs Node ≥ 20.11).

---

## Phase 1 — Production on Railway (no code changes)

This phase runs the app exactly as it runs on Replit today, just on a stabler host.

### 1. Create the project and service
1. Railway → **New Project** → **Deploy from GitHub repo** → select the ARV repo.
2. Choose the branch to deploy for production (e.g. `main`).
3. Railway auto-detects Node via Nixpacks and reads `npm run build` + `npm run start` from
   `package.json`. Confirm in **Settings → Build/Deploy**:
   - **Build command:** `npm run build`
   - **Start command:** `npm run start`
   - (Leave the install command default — Nixpacks runs `npm ci` from the committed lockfile and
     installs `devDependencies`, which the build needs.)

### 2. Set environment variables
- Add every variable from the table above (prod values).
- Add `NIXPACKS_NODE_VERSION=20`.
- **Do not** add `PORT` or `NODE_ENV`.

### 3. Pin to a single instance (important)
- **Settings → keep replicas = 1.** The WebSocket registry is in-memory
  ([registry.ts:14-17](../../server/websocket/registry.ts#L14-L17)) and cron is in-process — running
  2+ instances would split live connections and double-fire every scheduled job (duplicate emails,
  double SFR spend). Your own code comments already note this single-instance constraint. Horizontal
  scaling is a later project (needs Redis pub/sub + externalized cron).

### 4. Configure the health check
- **Settings → Deploy → Health Check Path:** `/` (returns the SPA `index.html`, `200`).
- This lets Railway detect a hung deploy and restart it.

### 5. Verify the database schema
- Production data already lives in Neon, so the schema is in place. If you ever need to sync schema,
  run it **from your local checkout** against the prod `DATABASE_URL` (Railway shell not required):
  `npm run db:push`. Drizzle uses push, not migration files ([drizzle.config.ts](../../drizzle.config.ts)).

### 6. First deploy + smoke test
Trigger a deploy (push to the branch or hit **Deploy**). On the temporary `*.up.railway.app` URL,
verify:
- App loads (SPA served) and `GET /` returns `200`.
- **Login works** and persists across a refresh (session cookie + Neon session store over HTTPS).
- **WebSockets connect** — open Mastermind, confirm real-time messages/presence.
- **File upload works** — post a Mastermind attachment (bodies up to 50 MB are allowed by the
  Express config; no serverless body cap here).
- **Logs stream** in the Railway **Deployments → Logs** view (this is the visibility Replit lacked).
- Optionally trigger one cron job manually (or wait for a scheduled tick) and confirm it runs.

### 7. Custom domain + DNS cutover
1. Railway → **Settings → Networking → Custom Domain** → add your production hostname.
2. At your DNS provider, create the **CNAME** Railway shows you. Railway auto-provisions TLS.
3. **Lower the DNS TTL** a day before (e.g. to 300s) so the switch propagates fast.
4. Point the domain at Railway, watch logs + the app for a few hours to a day.
5. Once healthy, **decommission the Replit deployment.**

> **Rollback during cutover:** because Neon (DB), Supabase (storage), and Postmark (email) are all
> external and shared, Replit and Railway can run against the same data simultaneously. If anything
> looks wrong, revert DNS back to Replit — no data migration is involved, so rollback is just a DNS
> change. (Keep only **one** of them running the cron jobs at a time to avoid duplicate emails.)

---

## Phase 2 — Add a staging server (one small code change)

Goal: a second always-on URL that mirrors production for non-technical review/testing, **without**
sending real emails, spending SFR quota, or touching production storage.

### The problem staging hits
A staging server must run the **built** app with `NODE_ENV=production` (so secure cookies and static
serving behave like prod). But today `NODE_ENV=production` also:
- schedules **all** heavy cron jobs — scanners, the consumer, **8 daily MSA emails to real
  recipients**, and enrichment ([jobs/index.ts:59-153](../../server/jobs/index.ts#L59-L153)), and
- selects the **`*-prod`** Supabase buckets ([lib/supabase.ts:26](../../server/lib/supabase.ts#L26)).

So a naive staging deploy would double your outbound emails and SFR API usage. That's what the code
change prevents.

### The one code change (to be done later — not applied yet)
Introduce an `APP_ENV` variable (`production` | `staging`) and gate on it:

1. **Cron scheduling** — in [server/jobs/index.ts](../../server/jobs/index.ts), change the guards
   that currently read `process.env.NODE_ENV === 'production'` for the scan windows, consumer,
   enrichment, and email blocks to read `process.env.APP_ENV === 'production'`. Cleanup jobs
   (streetview/email/notification/token cache) are cheap and idempotent — safe to leave running, or
   gate them too if you prefer full quiet on staging.
2. **Storage buckets (recommended)** — in [server/lib/supabase.ts](../../server/lib/supabase.ts),
   base the `PROD_BUCKETS` vs `DEV_BUCKETS` choice on `APP_ENV === 'production'` instead of
   `NODE_ENV`, so staging writes to the `*-dev` buckets and never mutates production images/files.
3. Leave `NODE_ENV=production` on staging (via the existing `start` script) so cookies stay `Secure`
   and the app serves the built bundle — only `APP_ENV` differs between the two environments.

Net effect: `APP_ENV=production` on prod (unchanged behavior), `APP_ENV=staging` on staging (no
jobs/emails, isolated buckets). This is the only code change in the whole migration.

### Stand up the staging service
1. **Neon branch for data:** Neon dashboard → branch the production database. This gives staging a
   **full copy of real data with isolated writes** — and directly solves the "dev database has no
   data" problem that Replit's DB pivot created. Copy the branch's connection string.
2. **Create the staging service** in Railway. Two common patterns:
   - A second **service** in the same project pointed at a `staging` git branch, **or**
   - A Railway **environment** ("staging") layered over the same service with its own variables.
   Either gives a separate `*.up.railway.app` URL (and its own custom subdomain, e.g.
   `staging.arvfinance.com`).
3. **Staging variables:** same list as prod, except:
   - `DATABASE_URL` = the **Neon branch** URL
   - `APP_ENV=staging`
   - `SESSION_SECRET` — a **different** value is fine here (staging sessions are independent)
   - keep `NIXPACKS_NODE_VERSION=20`; do **not** set `PORT`/`NODE_ENV`
4. **Replicas = 1** here too.
5. **Verify staging:** login/session, WebSockets, an upload (confirm it lands in a `*-dev` bucket),
   and confirm **no** scan/email cron logs appear (i.e. the `APP_ENV` gate is doing its job — you
   should see the `[CRON] … skipped` lines).

### The workflow you end up with
- Push to `staging` branch → auto-deploys to the staging URL → non-technical folks review it like any
  website.
- Merge/promote to `main` → auto-deploys to production.
- Two URLs, isolated data (Neon branch) and storage (`*-dev` buckets), real logs on both.

---

## Gotchas & operational notes

- **Never set `NODE_ENV` in Railway.** The `start` script sets it via `cross-env` at runtime. Setting
  it as a service variable also applies at **build** time, where `NODE_ENV=production` makes `npm`
  omit `devDependencies` (vite/esbuild/tailwind/tsx) and the build fails with "vite: not found."
- **Single instance only** (replicas = 1) until the in-memory WebSocket registry and in-process cron
  are externalized. This is a hard constraint of the current architecture, not a Railway limitation.
- **The data-pipeline consumer can run long.** On a persistent Railway service that's fine (no
  serverless duration cap) — this is a key reason Railway fits where Vercel wouldn't.
- **Request timeouts:** the app sets a 15-minute per-request timeout ([app.ts:38-42](../../server/app.ts#L38-L42))
  and allows 50 MB bodies — both fine on Railway; there's no platform body-size cap like Vercel's ~4.5 MB.
- **`SESSION_SECRET` continuity:** reuse the Replit value on **production** so users aren't logged out
  at cutover. Staging can differ.
- **Replit-specific bits are inert, not harmful:** the three `@replit/vite-plugin-*` dev deps and the
  `.replit` file don't break Railway (two plugins are gated on `REPL_ID`, which is unset off Replit;
  the error-overlay plugin only loads during `vite build` where devDeps are present). Clean them up
  later (below), not as a blocker.
- **Build resources:** the client build is large (Radix, Leaflet, Recharts, xlsx). If a build OOMs,
  bump the build resources in Railway settings.

---

## Post-migration cleanup (optional, after prod is stable on Railway)

None of these are required to deploy; do them once you've fully left Replit:

- Delete `.replit`.
- Remove the three `@replit/vite-plugin-*` entries from `devDependencies` and drop
  `runtimeErrorOverlay()` + the `REPL_ID`-gated dynamic imports from
  [vite.config.ts](../../vite.config.ts).
- (Optional) Add a dedicated `GET /api/health` route for a more precise health check than `/`.

---

## Cost estimate (rough)

- **Production service:** always-on, ~$5–20/mo depending on plan/usage.
- **Staging service:** always-on, similar. Can be scaled to zero / paused when not in use to save
  cost.
- **Neon branch:** typically included in Neon's plan (branches are cheap; storage is copy-on-write).
- Ballpark **$15–40/mo** for both environments — comparable to Replit's Reserved VM + Deployments.

---

## Appendix — optional additions

### Optional: `railway.json` (pin config in-repo instead of the dashboard)
Instead of setting build/start/health in the Railway UI, you can commit a `railway.json`:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": { "builder": "NIXPACKS", "buildCommand": "npm run build" },
  "deploy": {
    "startCommand": "npm run start",
    "healthcheckPath": "/",
    "healthcheckTimeout": 300,
    "numReplicas": 1,
    "restartPolicyType": "ON_FAILURE"
  }
}
```

### Optional: dedicated health endpoint
A tiny `GET /api/health` returning `{ ok: true }` (mounted before auth) gives Railway a lightweight,
unambiguous health target instead of serving the full SPA shell on every check.

---

## What is NOT changing

- **Database:** stays on Neon (prod), plus a Neon branch for staging.
- **Storage:** stays on Supabase (prod uses `*-prod`, staging uses `*-dev` after the `APP_ENV` change).
- **Email:** stays on Postmark.
- **App architecture:** unchanged — one persistent server with WebSockets + in-process cron. The only
  code change in the entire migration is the `APP_ENV` gate for safe staging.
