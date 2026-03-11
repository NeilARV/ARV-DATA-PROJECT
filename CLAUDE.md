# Project: ARV Finance Data App
Express + Vite full-stack app for ARV (After Repair Value) / real estate finance data: property listings, market sync by MSA (Denver, Miami, San Diego, LA, SF, Port St. Lucie), resale verification, admin auth, and scheduled email updates.

## Architecture
- `/client` — React SPA (Vite): pages, components, hooks, `lib`, UI (Radix + Tailwind)
- `/server` — Express API: routes (auth, admin, properties, companies, geocoding, users), controllers, services, jobs (cron data sync, email, cache cleanup)
- `/database` — Drizzle schemas, inserts, updates, types
- `/shared` — Shared utilities (formatting, etc.)

## Tech Stack
- TypeScript (strict mode, ES modules)
- React 18 + Vite, Wouter (routing), TanStack Query
- Express, express-session, Passport (local), Neon serverless PostgreSQL session store
- Drizzle ORM + PostgreSQL (Neon)
- Tailwind CSS, Radix UI, Recharts, Leaflet, react-hook-form + Zod

## Commands
- `npm run dev` — Start dev server (Express + Vite HMR)
- `npm run build` — Vite client build + esbuild server bundle to `dist/`
- `npm run start` — Run production server (`node dist/index.js`)
- `npm run check` — TypeScript type-check (`tsc`)
- `npm run db:push` — Push Drizzle schema (requires `DATABASE_URL`)

## Code Style
- TypeScript strict; avoid `any`
- ES modules throughout; path aliases: `@/*` (client), `@shared/*`, `@database/*`
- Default exports for pages and route modules; named exports for UI components and utilities

## Important Notes
- NEVER read or commit `.env` files
- `SESSION_SECRET` is required (server exits if unset) for secure admin authentication
- `DATABASE_URL` is required for Drizzle and the Neon session store
- Scheduled jobs (node-cron) run data sync and email by MSA; timezone is `America/Los_Angeles`

## Verification
Before completing any task, run: `npm run check`
