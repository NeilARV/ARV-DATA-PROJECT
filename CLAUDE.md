# Project: ARV Finance Data App
[One-liner: e.g., "Next.js 14 e-commerce app with Stripe, Prisma ORM, and PostgreSQL"]

## Architecture
- `/app` — Next.js App Router pages and layouts
- `/components/ui` — Reusable UI components
- `/lib` — Utilities and shared logic
- `/prisma` — Database schema and migrations
- `/app/api` — API routes

## Tech Stack
- TypeScript (strict mode, no `any`)
- React 18 + Next.js App Router
- Tailwind CSS for styling
- Prisma ORM + PostgreSQL

## Commands
- `npm run dev` — Start dev server (port 3000)
- `npm run build` — Production build
- `npm run test` — Run Jest tests
- `npm run test:e2e` — Playwright end-to-end tests
- `npm run lint` — ESLint check
- `npm run db:migrate` — Run Prisma migrations (requires DATABASE_URL)

## Code Style
- Named exports only, no default exports
- ES modules throughout
- Co-locate tests with source files (*.test.ts)

## Important Notes
- NEVER read or commit .env files
- Stripe webhook handler in /app/api/webhooks/stripe MUST validate signatures
- Auth flow is documented in @docs/authentication.md
- Product images are stored in Cloudinary, not locally

## Verification
Before completing any task, run: `npm run lint && npm run test`