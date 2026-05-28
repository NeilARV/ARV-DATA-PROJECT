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

---

## Security Rules
- NEVER read, display, print, or access any `.env` file or any file containing secrets/credentials
- If a task requires environment variables, ask the user to provide only the variable NAME, not the value

---

## Apps

The application is organized as three distinct feature areas that function like separate apps, all sharing the some code like auth, providers, and backend.

### Data
Property intelligence platform. Browse SFR transaction data by MSA, filter by company/status/price/location, view a Leaflet map, company directory, and property detail. Powered by the SFR data pipeline that syncs external property data into the database. You MUST reference this document when working on the data side of the application.

> **Full reference**: `.claude/docs/data.md` | `/` | `data.services.ts`, `data.controllers.ts`, `data.routes.ts`

### Deals
Deal marketplace. Users post wholesale, agent, and sold deals; other investors browse, filter by location, and request contact info. Subscription-gated for deal creation. You MUST reference this document when working on the deals side of the application.

> **Full reference**: `.claude/docs/deals.md` | `/deals` | `deals.services.ts`, `deals.controllers.ts`, `deals.routes.ts`

### Vendors
Community hub. Two-panel layout: an activity feed for community posts (with rich text + vendor/category mentions) and a vendor directory organized by trade category. You MUST reference this document when working on the vendors side of the application.

> **Full reference**: `.claude/docs/vendors.md` | `/vendors` | `vendors.services.ts`, `vendors.controllers.ts`, `vendors.routes.ts`

---

## Coding Style
Before adding or modifying ANY code, read `.claude/docs/code-standards.md` and follow it. This is the authoritative source for naming, file organization, component structure, route/controller/service patterns, and error handling.

> **Full reference**: `.claude/docs/code-standards.md` — authoritative source for all coding conventions (naming, file organization, component structure, route/controller/service patterns, error handling, formatting, and more). Apply these standards when adding or updating any code.

---

## Design
Before adding or modifying ANY UI (components, pages, styling), read `.claude/docs/design.md` first and stay within its tokens and conventions.

> **Full reference**: `.claude/docs/design.md` — authoritative source for all design decisions (colors, typography, spacing, breakpoints, components, interaction states). Style tokens live in `tailwind.config.ts` and `client/src/index.css`.

---

## Testing
Before writing or running ANY test, read `.claude/docs/testing.md`. For new API routes, the access-control and validation integration tests described there are mandatory.

> **Full reference**: `.claude/docs/testing.md` — read this before writing any test. For new API routes, the access-control and validation integration tests described there are mandatory.

---

## References
- `.claude/docs/code-standards.md` — coding conventions for the entire codebase
- `.claude/docs/design.md` — UI design system (colors, typography, components, dark mode)
- `.claude/docs/testing.md` — testing guidelines, helpers, and mandatory baseline for new routes
- `.claude/docs/data.md` — Data app overview (property intelligence, map, company directory, SFR pipeline)
- `.claude/docs/deals.md` — Deals app overview (deal marketplace, subscription gate, email notifications)
- `.claude/docs/vendors.md` — Vendors app overview (vendor directory, community posts, mentions)

---

## Verification
Before completing any task, run: `npm run check`
