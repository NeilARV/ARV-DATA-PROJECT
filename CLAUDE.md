# ARV Finance Data App

Express + Vite full-stack app for ARV (After Repair Value) real-estate finance data: property intelligence by MSA (Denver, Miami, San Diego, LA, SF, Port St. Lucie), a deal marketplace, a vendor community, and a real-time mastermind — plus admin auth, code-violation tracking, and scheduled email updates.

## Stack

TypeScript (strict, ES modules) · React 18 + Vite · Wouter · TanStack Query · Tailwind + Radix UI · Recharts · Leaflet · react-hook-form · Express · express-session + Passport (local) · Drizzle ORM + Neon PostgreSQL · Zod · `ws` (Mastermind real-time) · Supabase Storage · Postmark (email).

## Commands

| | |
|---|---|
| `npm run dev` | Dev server (Express + Vite HMR) |
| `npm run build` | Client build + esbuild server bundle → `dist/` |
| `npm run start` | Production server (`node dist/index.js`) |
| `npm run check` | TypeScript type-check (also run by the `Stop` hook) |
| `npm run db:push` | Push Drizzle schema (needs `DATABASE_URL`) |
| `npm run test` / `test:watch` | Unit tests (Vitest) |
| `npm run test:integration` | Integration tests |
| `npm run test:all` | Unit + integration |

## Architecture

Four layers, split by responsibility. **Dependencies point inward:** `client` and `server` may import from `shared` and `database`; `shared`/`database` import from no one; `client` and `server` never import from each other.

```
client/    React SPA (Vite) — frontend only
  src/{api, components, constants, hooks, lib, pages, types, utils}
server/    Express API — never imported by the client
  {controllers, routes, services, middleware, jobs, websocket, lib, utils, constants, assets}
database/  Source of truth for data shapes — Drizzle + Zod (both sides import this)
  {schemas, inserts, updates, validation, types}
shared/    Imported by BOTH client and server (the only neutral layer)
  {types, utils, constants, mastermind}
```

- **controllers** parse req → call service → shape res; **services** own business logic + Drizzle I/O; **routes** wire paths + middleware → controllers.
- **jobs** — `data_v2/` sync pipeline, `code-violations/`, email, cache cleanup.
- **websocket** — Mastermind real-time layer; protocol lives in `shared/mastermind/events.ts`.
- `tests/` mirrors the `client`/`server` tree.

**Where types live** — narrowest place that holds all consumers; move outward only when a wider consumer appears (1 spot → co-locate; 2+ → a types folder). Plain `.ts` with explicit `export`, never `.d.ts`.

| Location | For |
|---|---|
| co-located | used by one file (props, local state, a service's I/O type) |
| `client/src/types/` | 2+ **client** files, never crosses the wire (filters, view-models) |
| `shared/types/` | used by **both** sides — API request/response/wire contracts (`Deal`, `Roles`, …) |
| `database/types/` | entity/row shapes **derived** from a schema (`$inferSelect`, `z.infer`) — never hand-written |

## Apps

Four feature areas that behave like separate apps over shared code (auth, providers, backend). **Read the matching section of `.claude/docs/apps.md` before working on a side.**

- **Data** (`/`) — property intelligence: browse SFR transactions by MSA, filter, Leaflet map, company directory, property detail, code-violation records. Fed by the SFR sync pipeline. → `properties.services.ts`, `companies.services.ts`, `code-violations.services.ts`
- **Deals** (`/deals`) — deal marketplace: post wholesale/agent/sold/REO deals, browse, request contact, submit offers. App-access gated. → `deals.services.ts`
- **Vendors** (`/vendors`) — community hub: activity feed of posts (rich text + vendor/category mentions) beside a vendor directory. → `vendors.services.ts`, `posts.services.ts`, `categories.services.ts`
- **Mastermind** (`/mastermind`) — Slack-style real-time community (the live layer of the mastermind subscription): channels, messages, DMs, @mentions, reactions, pins, attachments, notifications. App-access gated; channel management is admin/owner only. → `channels.services.ts`, `messages.services.ts`, `notifications.services.ts` · design: `.claude/docs/features/mastermind.md`

## Read before you touch

These docs are canonical — read the relevant one before writing code in that area. Where any doc disagrees with the one named here, the one named here wins.

| Touching… | Read first | Owns |
|---|---|---|
| any code | `.claude/docs/standards/typescript.md` | `TS.*` |
| React / frontend | `.claude/docs/standards/react.md` | `RX.*` |
| Express / Drizzle | `.claude/docs/standards/express.md` | `EX.*`, `DB.*` |
| access by role / subscription / auth | `.claude/docs/access-control.md` | route permission tables, middleware, status codes |
| any UI (components, styling, tokens) | the `ui-design` skill | token lookup + `check-hex.sh` enforcement; `DS.*` rule definitions live in `DESIGN.md`, values in `tailwind.config.ts` + `client/src/index.css` |
| tests | `.claude/docs/standards/testing.md` | `TST.*` |

## Coding standards

**General principles.** Clarity over cleverness. Consistency over preference — match the surrounding pattern. One responsibility (if you say "and" to describe it, split it). No dead code (git is the history). No speculative abstraction (three similar lines beats a premature helper). Fail loudly — explicit errors and early returns over silent fallbacks.

**Comments — canonical policy.** The per-layer rules (`TS.JSDOC-EXPORT`, `TS.JSDOC-BUDGET`, `TS.COMMENT-WHY`, `EX.JSDOC-EXPORT`, `RX.JSDOC-EXPORT`) enforce this section and defer to it.

- **JSDoc `/** … */` — the caller's contract.** Every exported function/component/hook gets one; the default is a **single sentence**, and for most exports that's the whole comment (the tooltip already shows the types). Escalate only for what the signature can't express, one line each: `@param` when a param's meaning isn't evident from name + type; `@returns` for semantics the type doesn't carry (null cases, units, format); `Side effect:` when it emails / writes storage / fires a WS event; one cross-file invariant named by file/function. **Ceiling:** never more than one line per item, never longer than the function body. **Never** put in JSDoc: caller enumerations, design rationale, restatements of the type, or re-explanations of what a canonical doc owns — name it.
- **Inline `//` — the maintainer's why.** For a non-obvious *why* (constraint, workaround, invariant) at the exact line it applies to. One sentence, no JSDoc tags. A why lives in exactly one place, closest to the code — never duplicated into the header.
- **Hygiene.** Delete stale comments; one that contradicts the code is worse than none.

**Formatting** is Prettier's, run automatically by the `PostToolUse` hook — don't restate or fight it. Semantic choices it can't make (quote intent, `T[]` vs `Array<T>`, import order) live in `typescript.md`.

**Project rules.**
- **ARV.RAW-COMPANY-NAME** — DB company names are ALL CAPS; always pass through `formatCompanyName` from `@shared/utils/formatCompanyName` before rendering **or** returning in any user-facing response (cards, modals, directory, tables, search, tooltips).
- **ARV.SECRET-ACCESS** — never read/print/access any `.env` or secret; reference env vars by NAME only (also hook-enforced).

## Environment & security

**Never read, commit, or expose any `.env` file or secret.** If a task needs an env var, ask for the variable NAME, not its value.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Drizzle + Neon connection |
| `SESSION_SECRET` | Session signing (server exits if unset); also unsigns the WS-upgrade cookie |
| `SFR_API_URL` / `SFR_API_KEY` | SFR external property-data API (sync pipeline) |
| `POSTMARK_SERVER_API_KEY` | Postmark transactional email |
| `POSTMARK_ACCOUNT_TOKEN` | Postmark account token (creates RM sender signatures) |
| `DEFAULT_CONTACT_RECIPIENT` / `DEFAULT_FROM_EMAIL` | Default email recipient / sender |
| `GOOGLE_API_KEY` | Google Maps / Geocoding |
| `MICROLINK_API_KEY` | Link-preview API (optional; a key raises rate limits) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Supabase Storage (uploads) |
| `APP_URL` | Public base URL for email links, via `getAppBaseUrl()` (optional; falls back to `https://data.arvfinance.com`) |

Non-secret constants that are **not** env vars: Postmark template aliases (`server/services/postmark/templates.ts`), Storage bucket names (`server/lib/supabase.ts`, `*-dev` / `*-prod` by `NODE_ENV`). Supabase buckets must be public; the Mastermind bucket's MIME/size allowlist (JPEG, PNG, PDF, CSV, TXT ≤10 MB) must match `server/services/messages/attachments.services.ts`.

## Skills & commands

Quality and workflow tools are invoked deliberately — none is wired into a hook. Each self-describes; run `/` to list them. The most-used:

- **Build** — `/implement` (build from a spec/tickets), `tdd` (red-green-refactor).
- **Plan & scope** — `/to-spec`, `/to-tickets`, `/wayfinder` (map work too big for one session), `/triage`, `grilling` (stress-test a plan), `/project-setup` (one-time tracker/label config).
- **Design & model** — `codebase-design`, `improve-codebase-architecture`, `domain-modeling`.
- **Review** — `/hunt <file|folder>` (deep bug hunt + standards/design pass), `/smell commit|pr` (Clean Code + GoF review of committed work), `/audit` (repo-wide standards drift), `/test` (generate tests for the current diff), `/code-review` (working-diff correctness + cleanups).
- **Debug & git** — `diagnosing-bugs`, `resolving-merge-conflicts`, `ui-design`.

## Git & verification

Default to a **feature branch** off updated `main` (`git switch -c feat/<name>`); use a worktree only for genuinely parallel work. Commit/push only when asked; if on `main`, branch first. Force-push is hook-blocked. Worktrees have no `node_modules`/`.env` — run DB commands from the main checkout.

Before finishing any task, `npm run check` must pass (enforced by the `Stop` hook).

## Design context

Two root docs carry the product's design intent (maintained with the `impeccable` skill — `/impeccable`):

- **`PRODUCT.md`** — the strategic brief: register (**product**, with a one-page marketing layer on `Home`), users (ARV's borrower-clients — mostly wholesalers & fix-and-flip operators), positioning, the "trusted insider + sharp analyst" personality, and anti-references (generic AI/SaaS template, cluttered legacy portal, cold enterprise/bank, consumer-toy).
- **`DESIGN.md`** — the visual identity ("The Insider's Desk"): palette, type, elevation, components, do's/don'ts. Its frontmatter mirrors `client/src/index.css` in the source's own HSL.

Division of labor for anything visual: **`DESIGN.md` owns the identity *and* the canonical `DS.*` rule definitions** (each a Named Rule in a section); the **`ui-design` skill** owns the operational layer — the which-token-when lookup tables and the `check-hex.sh` enforcement — and cites the `DS.*` rules by ID; `client/src/index.css` + `tailwind.config.ts` own the values and win when any doc disagrees. Design *work* (building, redesigning, auditing a surface) is driven through `/impeccable`, for which `DESIGN.md` + `PRODUCT.md` are the context. `DESIGN.md`'s frontmatter is canonical HSL, mirroring `index.css`; a regeneration must preserve HSL.

## References

- `.claude/docs/apps.md` — all four apps, in depth
- `.claude/docs/api.md` — every route, request/response shapes, params
- `.claude/docs/access-control.md` — canonical route permissions + middleware
- `.claude/docs/database.md` — full schema (tables, columns, constraints, indexes)
- `.claude/docs/standards/{typescript,react,express,testing}.md` — layer standards
- `.claude/docs/features/{mastermind,cv,email-settings}.md` — feature deep-dives (Mastermind, Code Violations, email notification settings)
