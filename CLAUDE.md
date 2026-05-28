# Project: ARV Finance Data App
Express + Vite full-stack app for ARV (After Repair Value) / real estate finance data: property listings, market sync by MSA (Denver, Miami, San Diego, LA, SF, Port St. Lucie), resale verification, admin auth, and scheduled email updates.

## Architecture
- `/client` — React SPA (Vite): pages, components, hooks, `lib`, UI (Radix + Tailwind)
- `/server` — Express API: routes (auth, admin, properties, companies, geocoding, users), controllers, services, jobs (cron data sync, email, cache cleanup)
- `/database` — Drizzle schemas, inserts, updates, types; also contains Zod validation schemas used for data migration and runtime validation
- `/shared` — Shared utilities (formatting, etc.)

## Tech Stack
- TypeScript (strict mode, ES modules)
- React 18 + Vite, Wouter (routing), TanStack Query
- Express, express-session, Passport (local), Neon serverless PostgreSQL session store
- Drizzle ORM + PostgreSQL (Neon)
- Zod (schema validation; schemas live in `/database`)
- Tailwind CSS, Radix UI, Recharts, Leaflet, react-hook-form + Zod

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

## Data Pipeline

The data pipeline is a core part of the application. It syncs property transaction data from an external SFR (Single Family Rental) API into the local database, organized by MSA (Metropolitan Statistical Area).

### Entry Point
`runConsumer()` — the main consumer job that orchestrates the full pipeline. It reads pending rows from the `market_scan_queue` table in batches, processes them through a multi-step pipeline, and marks rows complete or failed.

### Pipeline Steps (per batch)
1. **`fetchQueue`** — Pulls a batch of pending rows from `market_scan_queue` for a given MSA (capped at `MAX_PROPERTIES_PER_MSA` unique properties per run)
2. **`markProcessing`** — Marks the fetched rows as `processing` to prevent duplicate processing in concurrent runs
3. **`batchLookup`** — Calls `/properties/batch` on the SFR API to enrich raw queue records with full property details
4. **`getTransactions`** — Calls `/properties/transactions` on the SFR API for each property to retrieve its full transaction history
5. **`cleanTransactions`** — Parses transaction data to extract company names and county associations
6. **`insertCompanies`** — Upserts buyer/seller companies into the `companies` table and associates them with the MSA
7. **`resolvePropertyIds`** — Looks up `buyer_id` and `seller_id` foreign keys by resolving company names against the `companies` table
8. **`resolveStatuses`** — Determines each property's status: `on-market`, `in-renovation`, `sold`, or `wholesale`
9. **`cleanBeforeInsert`** — Final normalization pass (county, property_type, etc.) before DB insert
10. **`resolveArvFunded`** — Annotates each property with `is_arv_funded` based on lender patterns in the transaction history
11. **`insertProperties`** — Upserts properties and all child records (transactions, statuses, associations) into the database
12. **`updateArvClientCompanies`** — Marks companies as ARV clients based on their resolved transaction involvement
13. **`markComplete` / `markFailed`** — Updates queue row status; failed rows stay in the queue for manual review and are not retried automatically

### Key Behaviors
- Properties flagged as **New Construction** (via transaction type) are excluded and marked failed with reason `"Property is New Construction"`
- Properties where **status cannot be resolved** are excluded and marked failed with reason `"Couldn't Resolve Status"`
- A failed batch does **not** abort the rest of the MSA — errors are caught per-batch and processing continues
- `MAX_PROPERTIES_PER_MSA` controls throughput (currently 5); each property makes ~2 external API calls

### Relevant Files
- `server/jobs/consumer.ts` — Main consumer orchestrator
- `server/jobs/processes/` — Individual pipeline step functions
- `database/schemas/msas.schema.ts` — MSA table schema

---

## Environment Variables

The following environment variables are required or used by the application. **Never read, commit, or expose `.env` files.**

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Drizzle ORM + Neon PostgreSQL connection |
| `SESSION_SECRET` | Express session signing (server exits if unset) |
| `SFR_API_URL` | Base URL for the SFR external property data API |
| `SFR_API_KEY` | Auth key for the SFR API (used in data pipeline) |
| `POSTMARK_SERVER_API_KEY` | Postmark transactional email — server API key |
| `POSTMARK_ACCOUNT_TOKEN` | Postmark account-level token |
| `DEFAULT_CONTACT_RECIPIENT` | Default recipient address for contact/notification emails |
| `DEFAULT_FROM_EMAIL` | Default sender address for outgoing emails |
| `GOOGLE_API_KEY` | Google Maps / Geocoding API key |

---

## Security Rules
- NEVER read, display, print, or access any `.env` file or any file containing secrets/credentials
- If a task requires environment variables, ask the user to provide only the variable NAME, not the value

---

## Coding Style
> **Full reference**: `.claude/docs/code-standards.md` — authoritative source for all coding conventions (naming, file organization, component structure, route/controller/service patterns, error handling, formatting, and more). Apply these standards when adding or updating any code.

---

## Design
> **Full reference**: `.claude/docs/design.md` — authoritative source for all design decisions (colors, typography, spacing, breakpoints, components, interaction states). Style tokens live in `tailwind.config.ts` and `client/src/index.css`.

---

## Testing
> **Full reference**: `.claude/docs/testing.md` — read this before writing any test. For new API routes, the access-control and validation integration tests described there are mandatory.

---

## References
- `.claude/docs/code-standards.md` — coding conventions for the entire codebase
- `.claude/docs/design.md` — UI design system (colors, typography, components, dark mode)
- `.claude/docs/testing.md` — testing guidelines, helpers, and mandatory baseline for new routes
- `.claude/docs/data.md` — data pipeline feature design and integration notes

---

## Verification
Before completing any task, run: `npm run check`
