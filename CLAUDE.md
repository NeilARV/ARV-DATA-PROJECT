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

- **Indentation**: 4 spaces (no tabs)
- **TypeScript**: Strict mode; avoid `any`
- **Modules**: ES modules throughout; path aliases: `@/*` (client), `@shared/*`, `@database/*`
- **Exports**: Default exports for pages and route modules; named exports for UI components and utilities

### Destructuring Spacing
- **Object destructuring** (custom hooks / context): include a space after `{` and before `}`
  ```ts
  const { filters, setFilters } = useFilters();
  const { user, setUser } = useAuth();
  ```
- **Array destructuring** (React state, etc.): no spaces inside `[` and `]`
  ```ts
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  ```

---

## Design Style Guide

Style and design tokens live in `tailwind.config.ts` and `client/src/index.css`.

### Colors

**Brand / Primary**
| Token | HSL | Approx Hex | Used For |
|---|---|---|---|
| `primary` | `192 67% 65%` | `#5BC8DC` | Main CTAs, buttons, links, focus rings, active sidebar states |
| `primary-foreground` | `0 0% 100%` | `#FFFFFF` | Text/icons on primary backgrounds |

**Backgrounds & Surfaces**
| Token | Light HSL | Dark HSL | Used For |
|---|---|---|---|
| `background` | `0 0% 100%` | `220 13% 9%` | Page-level background |
| `card` | `0 0% 98%` | `220 13% 11%` | Card/panel surfaces |
| `sidebar` | `220 9% 96%` | `220 13% 13%` | Sidebar background |
| `popover` | `0 0% 96%` | `220 13% 15%` | Dropdowns, tooltips |

**Text / Foreground**
| Token | Light HSL | Dark HSL | Used For |
|---|---|---|---|
| `foreground` | `220 9% 15%` | `220 9% 98%` | Primary body text |
| `muted-foreground` | `220 9% 40%` | `220 9% 65%` | Placeholder text, descriptions, secondary labels |

**Interactive / Semantic**
| Token | HSL | Used For |
|---|---|---|
| `secondary` | `220 14% 93%` (light) | Secondary/ghost buttons, alternative CTAs |
| `muted` | `220 13% 95%` (light) | Disabled backgrounds |
| `accent` | `220 14% 95%` (light) | Hover/selected states on items |
| `destructive` | `0 84% 42%` | Delete buttons, error alerts, warnings |
| `ring` | `192 67% 65%` | Focus ring (same as primary) |
| `input` | `220 13% 80%` (light) | Input field borders |
| `border` | `220 13% 91%` (light) | Default borders everywhere |

**Status Colors**
| Token | Hex | Used For |
|---|---|---|
| Status Online | `#22C55E` | Green dot indicators |
| Status Away | `#F59E0B` | Yellow/amber dot indicators |
| Status Busy | `#EF4444` | Red dot indicators |
| Status Offline | `#9CA3AF` | Gray dot indicators |

**Financial / Data**
| Token | Hex | Used For |
|---|---|---|
| Spread Positive | `#22C55E` | Positive P&L, gains |
| Spread Negative | `#FF0000` | Negative P&L, losses |

**Chart Colors**
| Token | Light HSL | Used For |
|---|---|---|
| `chart-1` | `192 67% 65%` | Primary chart series (matches brand primary) |
| `chart-2` | `142 76% 36%` | Secondary series, positive indicators |
| `chart-3` | `262 83% 48%` | Tertiary series |
| `chart-4` | `32 95% 44%` | Quaternary series |
| `chart-5` | `340 82% 52%` | Quinary series |

### Border Radius
| Token | Value | Used For |
|---|---|---|
| `sm` | `3px` | Checkbox, tight UI elements |
| `md` | `6px` | Buttons, inputs, badges, selects, tooltips |
| `lg` | `9px` | Dialogs, alerts, larger containers |
| `xl` | `12px` | Cards |

### Typography
**Font Family**: `Inter` (Google Fonts, weights 300–700) → fallback `sans-serif`

| Role | Size | Weight | Used For |
|---|---|---|---|
| Card Title | `24px` | 600 | Large card headings |
| Dialog Title | `18px` | 600 | Modal titles |
| Button / Label | `14px` | 500 | Button text, form labels |
| Body | `16px` | 400 | General content |
| Badge / Caption | `12px` | 600 | Small status badges |
| Description | `14px` | 400 | Card descriptions, dialog subtext |
| Input | `16px` mobile → `14px` desktop | 400 | Form inputs |

Placeholder text always uses `muted-foreground`.

### Elevation System
Shadows are disabled (opacity 0) — depth is expressed through background overlays:

| Class | Effect | Used On |
|---|---|---|
| `hover-elevate` | Subtle bg tint on hover (~3–4% opacity) | Buttons, badges, list items |
| `active-elevate-2` | Stronger tint on press (~8–9% opacity) | Pressed buttons |
| `toggle-elevate` | Background tint for toggleable items | Sidebar items, toggles |

### Interaction States
All interactive elements share these consistent patterns:
- **Focus**: `ring-2 ring-ring ring-offset-2` (teal/primary color)
- **Disabled**: `opacity-50 pointer-events-none`
- **Placeholder**: `text-muted-foreground`
- **Checked/Active**: `bg-primary text-primary-foreground`

### Dark Mode
Full dark mode support via CSS variables. The `dark` class on `<html>` swaps all tokens.
- Backgrounds darken significantly
- Foregrounds flip light
- Primary teal stays the same across both modes
- Chart colors get slightly lighter for readability

---

## Verification
Before completing any task, run: `npm run check`
