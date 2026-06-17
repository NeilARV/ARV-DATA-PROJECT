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
| `MICROLINK_API_KEY` | Microlink link-preview API key (optional — the free public endpoint works without it; a key raises rate/concurrency limits) |
| `SUPABASE_URL` | Supabase project URL — required for all Storage uploads (posts, vendors, users, Mastermind) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key — server-side Storage auth (required for uploads) |
| `SUPABASE_STORAGE_BUCKET` | Bucket for post images (default `post-images-dev`) |
| `SUPABASE_VENDOR_STORAGE_BUCKET` | Bucket for vendor images (default `vendor-images-dev`) |
| `SUPABASE_USER_STORAGE_BUCKET` | Bucket for user/avatar images (default `user-images-dev`) |
| `SUPABASE_MASTERMIND_STORAGE_BUCKET` | Bucket for Mastermind message attachments — images + docs (default `mastermind-files-dev`) |

> **Supabase Storage buckets must be public** and configured to allow the app's MIME types and size limits. The Mastermind bucket allows **JPEG, PNG, PDF, CSV, TXT at ≤10 MB** — this must match the server allowlist in `server/services/messages/attachments.services.ts` (`ALLOWED_ATTACHMENT_TYPES` / `MAX_ATTACHMENT_BYTES`).

---

## Security Rules
- NEVER read, display, print, or access any `.env` file or any file containing secrets/credentials
- If a task requires environment variables, ask the user to provide only the variable NAME, not the value

---

## Apps

The application is organized as three distinct feature areas that function like separate apps, all sharing the some code like auth, providers, and backend. All three are documented in a single reference: `.claude/docs/apps.md`. You MUST read the relevant section of that document when working on the corresponding side of the application.

### Data
Property intelligence platform. Browse SFR transaction data by MSA, filter by company/status/price/location, view a Leaflet map, company directory, and property detail. Powered by the SFR data pipeline that syncs external property data into the database.

> **Full reference**: `.claude/docs/apps.md` (Data section) | `/` | `properties.services.ts`, `companies.services.ts`

### Deals
Deal marketplace. Users post wholesale, agent, and sold deals; other investors browse, filter by location, and request contact info. Subscription-gated for deal creation.

> **Full reference**: `.claude/docs/apps.md` (Deals section) | `/deals` | `deals.services.ts`, `deals.controllers.ts`, `deals.routes.ts`

### Vendors
Community hub. Two-panel layout: an activity feed for community posts (with rich text + vendor/category mentions) and a vendor directory organized by trade category.

> **Full reference**: `.claude/docs/apps.md` (Vendors section) | `/vendors` | `vendors.services.ts`, `posts.services.ts`, `categories.services.ts`

---

## Access Control
Before building any backend route or frontend component that restricts access by role, subscription, or authentication state, read `.claude/docs/access-control.md`. It is the single source of truth for what each route requires. The three files that implement access control are `server/middleware/requireAuth.ts`, `server/middleware/requireRole.ts`, and `client/src/hooks/use-auth.ts`.

> **Full reference**: `.claude/docs/access-control.md` — canonical route permission tables, middleware behavior, status code contract, and guidance for writing access-control tests.

---

## Coding Style
Before adding or modifying ANY code, read `.claude/docs/code-standards.md` and follow it. This is the authoritative source for naming, file organization, component structure, route/controller/service patterns, and error handling.

> **Full reference**: `.claude/docs/code-standards.md` — authoritative source for all coding conventions (naming, file organization, component structure, route/controller/service patterns, error handling, formatting, and more). Apply these standards when adding or updating any code.

---

## Design
Before adding or modifying ANY UI (components, pages, styling), read `.claude/docs/design-guidelines.md` first and stay within its tokens and conventions.

> **Full reference**: `.claude/docs/design-guidelines.md` — authoritative source for all design decisions (colors, typography, spacing, breakpoints, components, interaction states). Style tokens live in `tailwind.config.ts` and `client/src/index.css`.

---

## Testing
Before writing or running ANY test, read `.claude/docs/testing.md`. For new API routes, the access-control and validation integration tests described there are mandatory.

> **Full reference**: `.claude/docs/testing.md` — read this before writing any test. For new API routes, the access-control and validation integration tests described there are mandatory.

---

## Automated Agents

The following subagents MUST be invoked via the `Agent` tool at the end of every task where files were modified. This is mandatory — not optional, not skippable. Run `npm run check` first, fix any errors, then invoke both agents before finishing.

- **Code Optimizer** (`.claude/agents/code-optimizer.md`) — reviews all changed files for bugs, security, and performance issues. Pass it the list of modified files and instruct it to run `git diff HEAD~1` to orient itself.
- **Agent Updater** (`.claude/docs/agent-updater.md`) — checks if code changes made any agent documentation stale. Will ask for approval before modifying any agent files. This document can run as you see fit, but it 100% MUST run when we make database and API changes so those changes can be reflected in the markdown documentation

---

## References
- `.claude/docs/api.md` — complete API documentation (all routes, request/response shapes, params)
- `.claude/docs/access-control.md` — canonical route permission tables and middleware reference
- `.claude/docs/code-standards.md` — coding conventions for the entire codebase
- `.claude/docs/design-guidelines.md` — UI design system (colors, typography, components, dark mode)
- `.claude/docs/testing.md` — testing guidelines, helpers, and mandatory baseline for new routes
- `.claude/docs/apps.md` — Combined overview of all three apps: Data (property intelligence, map, company directory, SFR pipeline), Deals (marketplace, subscription gate, email notifications), and Vendors (vendor directory, community posts, mentions)
- `.claude/docs/new-msa.md` — Documentation on how to add a new MSA to the application

---

## Requirements
1. You must refer to the Data section of `.claude/docs/apps.md` when working on the data side of the application
2. You must refer to the Deals section of `.claude/docs/apps.md` when working on the deals side of the application
3. You must refer to the Vendors section of `.claude/docs/apps.md` when working on the vendors side of the application
4. Before adding or modifying ANY code, read `.claude/docs/code-standards.md`
5. Before building any backend route or frontend component that restricts access by role, subscription, or authentication state, read `.claude/docs/access-control.md`
6. Before adding or modifying ANY UI (components, pages, styling), read `.claude/docs/design-guidelines.md`
7. Before writing or running ANY test, read `.claude/docs/testing.md`
8. After modifying any files, you MUST invoke the `code-optimizer` agent via the `Agent` tool before finishing. No exceptions.

---

## Verification
Before completing any task, run: `npm run check`