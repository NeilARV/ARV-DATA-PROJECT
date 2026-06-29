# Project: ARV Finance Data App
Express + Vite full-stack app for ARV (After Repair Value) / real estate finance data: property listings, market sync by MSA (Denver, Miami, San Diego, LA, SF, Port St. Lucie), resale verification, admin auth, and scheduled email updates.

## Architecture
- `/client` — React SPA (Vite): pages, components, hooks, `lib`, UI (Radix + Tailwind)
- `/server` — Express API: routes (auth, admin, properties, companies, geocoding, users, deals, vendors, posts, categories, channels, messages, notifications), controllers, services, jobs (cron data sync, email, cache cleanup), websocket layer
- `/database` — Drizzle schemas, inserts, updates, types; also contains Zod validation schemas used for data migration and runtime validation
- `/shared` — Shared utilities (formatting, Mastermind event protocol, etc.)

## Tech Stack
- TypeScript (strict mode, ES modules)
- React 18 + Vite, Wouter (routing), TanStack Query
- Express, express-session, Passport (local), Neon serverless PostgreSQL session store
- Drizzle ORM + PostgreSQL (Neon)
- Zod (schema validation; schemas live in `/database`)
- Tailwind CSS, Radix UI, Recharts, Leaflet, react-hook-form + Zod
- `ws` (WebSocket) for the Mastermind real-time layer
- Supabase Storage (image + file uploads)

## Commands
- `npm run dev` — Start dev server (Express + Vite HMR)
- `npm run build` — Vite client build + esbuild server bundle to `dist/`
- `npm run start` — Run production server (`node dist/index.js`)
- `npm run check` — TypeScript type-check (`tsc`)
- `npm run db:push` — Push Drizzle schema (requires `DATABASE_URL`)
- `npm run test` — Run unit tests once (Vitest)
- `npm run test:watch` — Run unit tests in watch mode (Vitest)
- `npm run test:integration` — Run integration tests once (uses `vitest.integration.config.ts`)
- `npm run test:all` — Run unit tests + integration tests sequentially

---

## Environment Variables

The following environment variables are required or used by the application. **Never read, commit, or expose `.env` files.**

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Drizzle ORM + Neon PostgreSQL connection |
| `SESSION_SECRET` | Express session signing (server exits if unset); also used to unsign the session cookie on the WebSocket upgrade |
| `SFR_API_URL` | Base URL for the SFR external property data API |
| `SFR_API_KEY` | Auth key for the SFR API (used in data pipeline) |
| `POSTMARK_SERVER_API_KEY` | Postmark transactional email — server API key |
| `POSTMARK_ACCOUNT_TOKEN` | Postmark account-level token (used to create RM sender signatures) |
| `POSTMARK_TEMPLATE_ALIAS` | Postmark template for property updates |
| `POSTMARK_DEAL_TEMPLATE_ALIAS` | Postmark template for deal notifications |
| `POSTMARK_DEAL_INQUIRY_TEMPLATE_ALIAS` | Postmark template for deal inquiries (request-info) |
| `POSTMARK_DEAL_OFFER_TEMPLATE_ALIAS` | Postmark template for deal offer (bid) notifications |
| `DEFAULT_CONTACT_RECIPIENT` | Default recipient address for contact/notification emails |
| `DEFAULT_FROM_EMAIL` | Default sender address for outgoing emails |
| `GOOGLE_API_KEY` | Google Maps / Geocoding API key |
| `MICROLINK_API_KEY` | Microlink link-preview API key (optional — the free public endpoint works without it; a key raises rate/concurrency limits) |
| `SUPABASE_URL` | Supabase project URL — required for all Storage uploads (posts, vendors, users, Mastermind) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key — server-side Storage auth (required for uploads) |

> **Storage bucket names are not env vars.** They are non-secret public constants defined in `server/lib/supabase.ts` (`DEV_BUCKETS` / `PROD_BUCKETS`), selected by `NODE_ENV` — dev uses `*-dev`, production uses `*-prod`.
>
> **Supabase Storage buckets must be public** and configured to allow the app's MIME types and size limits. The Mastermind bucket allows **JPEG, PNG, PDF, CSV, TXT at ≤10 MB** — this must match the server allowlist in `server/services/messages/attachments.services.ts` (`ALLOWED_ATTACHMENT_TYPES` / `MAX_ATTACHMENT_BYTES`).

---

## Security Rules
- NEVER read, display, print, or access any `.env` file or any file containing secrets/credentials
- If a task requires environment variables, ask the user to provide only the variable NAME, not the value

---

## Apps

The application is organized as four distinct feature areas that function like separate apps, all sharing common code (auth, providers, backend). All four are documented in a single reference: `.claude/docs/apps.md`. You MUST read the relevant section of that document when working on the corresponding side of the application.

### Data
Property intelligence platform. Browse SFR transaction data by MSA, filter by company/status/price/location, view a Leaflet map, company directory, and property detail. Powered by the SFR data pipeline that syncs external property data into the database.

> **Full reference**: `.claude/docs/apps.md` (Data section) | `/` | `properties.services.ts`, `companies.services.ts`

### Deals
Deal marketplace. Users post wholesale, agent, sold, and REO deals; other investors browse, filter by location, request contact info, and submit offers. App-access gated (any subscription tier — basic/pro/premium — or any team role).

> **Full reference**: `.claude/docs/apps.md` (Deals section) | `/deals` | `deals.services.ts`, `deals.controllers.ts`, `deals.routes.ts`

### Vendors
Community hub. Two-panel layout: an activity feed for community posts (with rich text + vendor/category mentions) and a vendor directory organized by trade category.

> **Full reference**: `.claude/docs/apps.md` (Vendors section) | `/vendors` | `vendors.services.ts`, `posts.services.ts`, `categories.services.ts`

### Mastermind
Slack-style real-time community (the live layer of the mastermind subscription): topic channels, real-time messages, @mentions, reactions, pins, attachments, and in-app notifications. App-access gated (any subscription tier or team role); channel management is admin/owner only. Under construction — Phase 1 Parts 1–9 built; email notifications (Part 10) remaining.

> **Full reference**: `.claude/docs/apps.md` (Mastermind section) + `.claude/docs/mastermind.md` (design + phased plan) | `/mastermind` | `channels.services.ts`, `messages.services.ts`, `notifications.services.ts`

---

## Access Control
Before building any backend route or frontend component that restricts access by role, subscription, or authentication state, read `.claude/docs/access-control.md`. It is the single source of truth for what each route requires. The middleware that implements access control is `server/middleware/requireAuth.ts`, `server/middleware/requireAccess.ts`, `server/middleware/requireRole.ts`, `server/middleware/requireSub.ts`, and `server/middleware/requireMastermind.ts`; the frontend mirror is `client/src/hooks/use-auth.ts`.

> **Full reference**: `.claude/docs/access-control.md` — canonical route permission tables, middleware behavior, status code contract, and guidance for writing access-control tests. Where any other doc disagrees with it on auth, this file wins.

---

## Coding Style

Before adding or modifying ANY code, read the standards file for the layer you're touching. These are authoritative; each owns a rule-ID prefix used by `/smell`.

- **TypeScript (any code)** → `.claude/docs/standards/typescript.md` (`TS.*`)
- **React / frontend** → `.claude/docs/standards/react.md` (`RX.*`)
- **Express / backend / Drizzle** → `.claude/docs/standards/express.md` (`EX.*`, `DB.*`)

Read the domain file directly for the layer you're in. The cross-cutting rules below apply everywhere and are not repeated in those files.

### General principles (apply everywhere)
- **Clarity over cleverness.** Code is read far more than written.
- **Consistency over preference.** Match the surrounding pattern.
- **One responsibility.** If you say "and" to describe it, split it.
- **No dead code.** Remove unused vars/imports/functions/commented-out blocks; git is the history.
- **No speculative abstraction.** Three similar lines beats a premature helper.
- **Fail loudly.** Explicit errors and early returns over silent fallbacks.

### Comments policy (Option A — encouraged)
- Exported functions/components/hooks get a JSDoc describing *what* they do/return (`@param`/`@returns` where useful).
- Inline `//` comments explain *why*, not what — a constraint, workaround, or invariant.
- Delete dead/obsolete comments; a stale comment that contradicts code is worse than none.

### Formatting
Prettier owns all formatting and runs automatically via the `PostToolUse` hook. Don't fight it or restate its rules. Semantic choices it can't make (quote intent, `T[]` vs `Array<T>`, import order) live in `typescript.md`.

### Project-specific rules
- **ARV.RAW-COMPANY-NAME** — DB company names are ALL CAPS; always pass through `formatCompanyName` from `@shared/utils/formatCompanyName` before rendering in a component **or** returning in any user-facing API response. (Cards, modals, directory, table rows, search, tooltips.)
- **ARV.SECRET-ACCESS** — Never read/print/access any `.env` or secret; reference env vars by NAME only. (Also hook-enforced.)

### File & folder organization

Four top-level layers, split by responsibility. **Dependencies point inward:** `client` and `server` may import from `shared` and `database`; `shared` and `database` never import from `client`/`server`, and `client`/`server` never import from each other.

```
ARV-DATA-PROJECT/
├── client/               # React SPA (Vite) — the frontend; nothing server-side runs here
│   └── src/
│       ├── api/          # Typed fetch wrappers, one file per domain (properties.api.ts, …)
│       ├── components/   # React components grouped by app: admin, auth, data, deals,
│       │                 #   mastermind, modals, profile, vendors + ui/ (Radix primitives)
│       ├── constants/    # Client-only constant values (filter options, status colors, map zoom)
│       ├── hooks/        # React hooks + context providers (use-auth, useFilters, useView, …)
│       ├── lib/          # Client utilities with logic (query-param builders, queryClient)
│       ├── pages/        # Route-level page components (Wouter)
│       ├── types/        # Types reused across 2+ CLIENT files only (see "Where types live")
│       └── utils/        # Small pure client helpers (date, avatar, …)
│
├── server/               # Express API — the backend; never imported by the client
│   ├── controllers/      # HTTP layer: parse req → call service → shape res. Per-domain + index.ts barrels
│   ├── routes/           # Route tables wiring paths + middleware → controllers
│   ├── services/         # Business logic + DB access (Drizzle). Per-domain; owns its own I/O types
│   ├── middleware/       # Cross-cutting request handling (requireAuth/Access/Role/Sub, errorHandler)
│   ├── jobs/             # Background work: data_v2/ sync pipeline, email, cache cleanup
│   ├── websocket/        # Mastermind real-time layer (ws): registry, auth, connection
│   ├── lib/              # Server integrations (supabase, microlink)
│   ├── utils/            # Server pure helpers (data transforms, validate, asyncHandler)
│   ├── constants/        # Server-only constants (role groups)
│   └── assets/           # Static assets (email .mustache templates)
│                         #   (no types/ folder by design — see "Where types live")
│
├── database/             # Source of truth for data shapes — Drizzle + Zod, imported by both sides
│   ├── schemas/          # Drizzle table definitions (users, properties, deals, …)
│   ├── inserts/          # Insert schemas
│   ├── updates/          # Update schemas
│   ├── validation/       # Zod request-validation schemas (posts, vendors, users, mastermind)
│   └── types/            # Types DERIVED from the above ($inferSelect / z.infer) — never hand-written
│
└── shared/               # Code imported by BOTH client and server (the only neutral layer)
    ├── types/            # Cross-tier contracts: deals, users, properties, claims (see below)
    ├── utils/            # Isomorphic helpers (formatCompanyName, formatPhoneNumber, formatAddress)
    ├── constants/        # Cross-tier constants (state defaults)
    └── mastermind/       # The Mastermind WebSocket event protocol (events.ts) — client + server
```

(`tests/` mirrors the `server`/`client` tree for unit + integration tests; `.claude/` holds agent docs, standards, and settings.)

#### Where types live (and why)

A type lives in the **narrowest** place that still holds all its consumers, and moves outward only when a consumer in a wider scope appears. Rule of thumb: **used in one spot → define it there; used in 2+ spots → a types folder.** Type files are plain `.ts` modules with explicit `export` (never `.d.ts`, never ambient globals).

| Where | What goes there | Why here |
|---|---|---|
| **co-located** (in the component / hook / service file) | A type used by only that one file — props, local state, a service's I/O type | Keeps the type next to its only user; no indirection for something nobody else reads |
| **`client/src/types/`** | Types reused across 2+ **client** files that the server never touches (filters, view options, UI view-models) | Client-only — keeping them out of `shared` keeps `shared` meaning "crosses the wire," not "every type" |
| **`shared/types/`** | Types used by **both** client and server — API request/response/wire contracts (`Deal`, `Roles`, `ClaimRow`, …) | The boundary's neutral home: both sides import *inward*, so neither depends on the other and the two can't silently drift |
| **`database/types/`** | Entity + row shapes, **derived** from a Drizzle/Zod schema | The schema is the source of truth; deriving (`$inferSelect`, `z.infer`) means the type can't drift from the table/validator |

**Why `shared/types` and not `client/src/types` for cross-tier types:** if a type is needed on both sides but lived in `client/src/types`, the *server* would have to reach into the client folder (a backwards dependency), or each side would hand-copy it and the two would drift. `shared` is the one place both `client` and `server` are allowed to import from, so anything that crosses the wire goes there. Conversely, a type only the client uses stays in `client/src/types` — putting it in `shared` would erode the signal that `shared` = the client↔server contract.

**No `server/types/` today:** server-internal types co-locate with the service/job that owns them (a service exports the types its controller needs). A `server/types/` folder is only created if a genuinely cross-cutting, server-only type with no natural owner appears.

---

## Design
Before adding or modifying ANY UI (components, pages, styling), read `.claude/docs/design-guidelines.md` first and stay within its tokens and conventions.

> **Full reference**: `.claude/docs/design-guidelines.md` — authoritative source for all design decisions (colors, typography, spacing, breakpoints, components, interaction states). Style tokens live in `tailwind.config.ts` and `client/src/index.css`.

---

## Testing
Testing standards live in `.claude/docs/standards/testing.md` (owns `TST.*`). Write
**testable** code by default (services return data, ownership in the service layer,
inputs Zod-validated), but do **not** generate test files inline while building a
feature unless explicitly asked. Test generation is a deliberate, separate pass run
via the `/test` command, but you could be asked to write tests as well.

> **Full reference**: `.claude/docs/standards/testing.md` · generator: `/test`

---

## Automated Agents (run automatically — do not invoke manually)

Two end-of-task agents are wired into the `Stop` hook in `.claude/settings.json` and fire automatically whenever a session has uncommitted changes. You do not need to remember to invoke them; the hook does. They are documented here so you know what they do:

- **Code Optimizer** (`.claude/agents/code-optimizer.md`) — reviews all changed files for bugs, security, and performance issues.
- **Agent Updater** (`.claude/docs/agent-updater.md`) — checks whether code changes made any agent documentation stale and asks for approval before editing docs. It MUST run for database and API changes so the markdown docs stay in sync.

---

## Git Workflow
Default to a **feature branch** in the main checkout (`git switch -c feat/<name>` off an updated `main`); use a **git worktree** only for genuinely parallel work (e.g. multiple agents on different branches). Commit/push only when asked; if on `main`, branch first. Worktrees don't share `node_modules` and have no `.env` — run DB commands from the main checkout.

> **Full reference**: `.claude/docs/git-workflows.md` — branch vs worktree vs clone, start-to-finish commands, the Node `node_modules`/junction gotcha, seeing diffs, and worktree cleanup.

---

## References
- `.claude/docs/api.md` — complete API documentation (all routes, request/response shapes, params). Auth notes are summarized per route; `access-control.md` is canonical for auth.
- `.claude/docs/access-control.md` — canonical route permission tables and middleware reference
- `.claude/docs/standards/typescript.md` — Standards — TypeScript language rules (`TS.*`) |
- `.claude/docs/standards/react.md` — Standards — React rules (`RX.*`) |
- `.claude/docs/standards/express.md` — Standards — Express/Drizzle backend rules (`EX.*`, `DB.*`) |
- `.claude/docs/standards/testing.md` — testing guidelines, helpers, and mandatory baseline for new routes
- `.claude/docs/design-guidelines.md` — UI design system (colors, typography, components, dark mode)
- `.claude/docs/apps.md` — combined overview of all four apps (Data, Deals, Vendors, Mastermind)
- `.claude/docs/database.md` — full database schema reference (tables, columns, constraints, indexes)
- `.claude/docs/mastermind.md` — Mastermind design doc and phased build plan
- `.claude/docs/agent-updater.md` — detection rules for keeping agent docs in sync
- `.claude/docs/new-msa.md` — how to add a new MSA to the application
- `.claude/docs/git-workflows.md` — git workflow: feature branches (default) vs worktrees, start-to-finish commands, and Node/worktree gotchas

---

## Requirements
1. You must refer to the Data section of `.claude/docs/apps.md` when working on the data side of the application
2. You must refer to the Deals section of `.claude/docs/apps.md` when working on the deals side of the application
3. You must refer to the Vendors section of `.claude/docs/apps.md` when working on the vendors side of the application
4. You must refer to the Mastermind section of `.claude/docs/apps.md` (and `.claude/docs/mastermind.md`) when working on the mastermind side of the application
5. Before adding or modifying ANY code, read `.claude/docs/standards/react.md`, `.claude/docs/standards/express.md`, `.claude/docs/standards/typescript.md`
6. Before building any backend route or frontend component that restricts access by role, subscription, or authentication state, read `.claude/docs/access-control.md`
7. Before adding or modifying ANY UI (components, pages, styling), read `.claude/docs/design-guidelines.md`
8. Before writing or running ANY test, read `.claude/docs/testing.md`

---

## Verification
Before completing any task, run: `npm run check` (also enforced by the `Stop` hook — fix any type errors before finishing).