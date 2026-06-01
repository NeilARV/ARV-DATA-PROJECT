# Adding a New MSA

An MSA (Metropolitan Statistical Area) defines a geographic market the platform supports. Adding a new MSA touches the database, backend utilities, frontend constants, and optionally the data pipeline. This document is the single source of truth for the process.

---

## Minimum Requirements by Feature Area

Not every MSA addition needs the full pipeline. Use the table below to scope the work.

| What you want to support | Steps required |
|---|---|
| **Deals only** (users can post/browse deals in the new market) | Steps 1–11 |
| **Data app** (property intelligence, map pins, company directory) | Steps 1–12 |
| **Email notifications** | Steps 1–12, then step 13 |
| **Vendors** | No MSA-specific steps — Vendors uses `COUNTIES`/`MSA` from `filters.constants.ts`, which is already covered by steps 3–5 |
| **User market preference / signup / profile** | Steps 1–10 are sufficient; new state → also step 8 |

> **Deals without the Data pipeline**: Users can post and browse deals in the new MSA. The `resolveMsaId` function uses a three-tier lookup (zip → city/state DB match → static zip-prefix fallback in step 10). Add the static ranges in step 10 so Deals work immediately on launch, before any pipeline data exists.

---

## Step-by-Step Checklist

### Step 1 — Add MSA to the `msas` database table

**File:** `database/seed.ts`

Add the new MSA name to the `db.insert(msas).values([...])` array. The name must exactly match the official MSA designation (e.g., `"Phoenix-Mesa-Chandler, AZ"`). The `.onConflictDoNothing()` guard makes re-runs safe.

```ts
{ name: "Phoenix-Mesa-Chandler, AZ" },
```

Then apply to the production Neon database directly via SQL (the initial row insert is too lightweight to warrant a full migration):
```sql
INSERT INTO msas (name) VALUES ('Phoenix-Mesa-Chandler, AZ') ON CONFLICT DO NOTHING;
```

> The MSA row must exist in the database before any deal, property, or user subscription can reference it via FK.

---

### Step 2 — Add MSA name to the validation schema

**File:** `database/inserts/users.insert.ts`

Add the exact MSA name string to the `MSA_NAMES` const array. This array validates entries in the admin email list panel (`insertEmailSubscriptionListSchema`).

```ts
const MSA_NAMES = [
  // ...existing entries...
  "Phoenix-Mesa-Chandler, AZ",
] as const;
```

---

### Step 3 — Add MSA to the frontend MSA constant

**File:** `client/src/constants/filters.constants.ts`

Add the MSA name to the `MSA` array. This drives the MSA-level filter suggestions in the Deals location search.

```ts
export const MSA = [
    // ...existing entries...
    "Phoenix-Mesa-Chandler, AZ",
]
```

---

### Step 4 — Add counties to the COUNTIES constant

**File:** `client/src/constants/filters.constants.ts`

Add one entry per county in the MSA to the `COUNTIES` array. Each entry needs the county name, 2-letter state abbreviation, and approximate geographic center `[lat, lng]`.

```ts
export const COUNTIES = [
    // ...existing entries...

    // Phoenix MSA (AZ)
    { county: "Maricopa", state: "AZ", center: [33.4484, -112.0740] },
    { county: "Pinal",    state: "AZ", center: [32.8795, -111.2600] },
];
```

`COUNTIES` drives:
- The county dropdown in `FilterHeader`
- The county/state dropdowns in `Signup.tsx` and `Profile.tsx` (via `UNIQUE_STATES` derived from this array)
- The Deals location search county suggestions
- `getZipCodesForCounty` and `getCountyCenter` in `client/src/lib/county.ts`

---

### Step 5 — Add zip codes for each county

**File:** `client/src/constants/filters.constants.ts`

Add a new exported constant named `${MSA_SHORT_NAME}_MSA_ZIP_CODES`. Keys are snake_case county names (e.g., `"Miami-Dade"` → `miami_dade`, `"St. Lucie"` → `st_lucie`). Each value is an array of `{ zip, city }` objects.

```ts
export const PHOENIX_MSA_ZIP_CODES = {
    maricopa: [
        { zip: '85001', city: 'Phoenix' },
        { zip: '85002', city: 'Phoenix' },
        // ...all zip codes for Maricopa County
    ],
    pinal: [
        { zip: '85120', city: 'Apache Junction' },
        // ...all zip codes for Pinal County
    ],
};
```

The county key normalization rule (used by `countyNameToKey` in `county.ts`):
- Lowercase everything
- Remove periods (`.`)
- Replace spaces and hyphens with underscores (`_`)

Examples: `"San Diego"` → `san_diego`, `"Miami-Dade"` → `miami_dade`, `"St. Lucie"` → `st_lucie`, `"Clear Creek"` → `clear_creek`

---

### Step 6 — Wire zip codes into `getZipCodesForCounty`

**File:** `client/src/lib/county.ts`

**6a.** Import the new constant:

```ts
import {
  // ...existing imports...
  PHOENIX_MSA_ZIP_CODES,
} from "@/constants/filters.constants";
```

**6b.** Add a new `else if` branch for the new state (if it's a new state), or add county-name checks inside the existing state branch (if the state already has multiple MSAs like FL):

```ts
} else if (state === "AZ") {
    msaZipCodes = PHOENIX_MSA_ZIP_CODES;
}
```

> FL already has three MSAs — see the existing `countyName === "St. Lucie" || ...` check pattern for how to distinguish them within a single state branch.

---

### Step 7 — Add counties to the shared `COUNTY_TO_MSA` map

**File:** `shared/constants/countyToMsa.ts`

This is the **single source of truth** for county → MSA name mappings. Both the client (`county.ts`) and server (`countyToMsa.ts`) import from here — no duplication needed.

```ts
export const COUNTY_TO_MSA: Record<string, string> = {
    // ...existing entries...
    "Maricopa": "Phoenix-Mesa-Chandler, AZ",
    "Pinal":    "Phoenix-Mesa-Chandler, AZ",
};
```

This mapping is used when a new user registers to auto-subscribe them to the correct MSA, and on the server when resolving a county to an MSA during data sync.

---

### Step 8 — Handle new state in signup and profile (new state only)

**File:** `shared/constants/stateDefaults.ts`

Both `Signup.tsx` and `Profile.tsx` import `STATE_DEFAULT_COUNTY` from this shared file. If the new MSA introduces a **new state**, add an entry here once and both forms update automatically.

```ts
export const STATE_DEFAULT_COUNTY: Record<string, string> = {
    CA: "San Diego",
    CO: "Denver",
    FL: "Miami-Dade",
    WA: "King",
    AZ: "Maricopa",   // ← new state
};
```

> If the new MSA is in a state already present in this map (e.g., a second FL or CA MSA), no change is needed.

---

### Step 9 — Add to `COUNTY_STATE_MAP`

**File:** `server/utils/dataSyncHelpers.ts`

Add each county → state abbreviation mapping. Used by the data sync pipeline when normalizing incoming property records.

```ts
const COUNTY_STATE_MAP: Record<string, string> = {
    // ...existing entries...
    'Maricopa': 'AZ',
    'Pinal':    'AZ',
};
```

---

### Step 10 — Add static zip-prefix fallback to `resolveMsa.ts`

**File:** `server/utils/resolveMsa.ts`

`resolveMsaId` resolves a deal's MSA from city/state/zip via a three-tier lookup:
1. DB match by zip code
2. DB match by city + state
3. Static zip-prefix map (this step)

The static fallback is critical for new MSAs that have no data in the DB yet. Add inclusive zip range checks inside `zipToStaticMsaName`:

```ts
// Arizona
if ((z >= 85001 && z <= 85399) || (z >= 85600 && z <= 85799))
    return "Phoenix-Mesa-Chandler, AZ";
```

Look up the USPS zip code ranges for each county in the MSA. Group multiple bands with `||` as shown in the existing blocks. Add a comment labeling which counties/cities each range covers.

---

### Step 11 — Add to `MSA_STATE` (data pipeline state fallback)

**File:** `server/jobs/data_v2/msa-states.ts`

Add the new MSA → state abbreviation. This is the authoritative fallback used by the SFR ingestion pipeline when the API response omits or misnames the state field.

```ts
export const MSA_STATE: Record<string, string> = {
    // ...existing entries...
    "Phoenix-Mesa-Chandler, AZ": "AZ",
};
```

---

### Step 12 — Run the initial data backfill (Data app only)

**File:** `server/jobs/data_v2/scan-window-init.ts`

One-shot scanner that backfills a single MSA without touching existing MSAs.

1. Set `MSA_NAME` at the top of the file to the exact string in the `msas` table
2. Set `MODE` to `"test"` first — scans only 0–30 days as a sanity check
3. Temporarily enable `scanWindowInit` in `server/jobs/index.ts` and trigger it
4. Confirm data appears correctly in the DB
5. Change `MODE` to `"full"` and run again for the complete 0–180 day backfill
6. Comment out the cron entry when done and reset `MODE` to `"test"`

```ts
// scan-window-init.ts
const MSA_NAME = "Phoenix-Mesa-Chandler, AZ";
const MODE: "test" | "full" = "test"; // change to "full" for production backfill
```

> The initial backfill must be run **locally** with `DATABASE_URL` pointed at the production Neon database. It is too heavy for production servers and will time out on large MSAs.

---

### Step 13 — Create the email notification job

**File:** `server/jobs/email/${city-slug}-email.ts` (new file)  
**File:** `server/jobs/index.ts` (register the cron)

Every MSA has a dedicated one-liner job file that calls the shared `sendEmailUpdatesForMsa` engine. Create a new file following this exact pattern:

```ts
// server/jobs/email/phoenix-email.ts
import { sendEmailUpdatesForMsa } from "server/jobs/email/processes/emailUpdates";

const MSA   = "Phoenix-Mesa-Chandler, AZ";
const CITY  = "Phoenix";
const STATE = "AZ";

export async function sendPhoenixEmail() {
    await sendEmailUpdatesForMsa(MSA, CITY, STATE);
}
```

- `MSA` must exactly match the string in the `msas` table
- `CITY` is the primary city name shown in the email subject/body
- `STATE` is the 2-letter abbreviation

Then register it in `server/jobs/index.ts` inside the email cron block:

```ts
import { sendPhoenixEmail } from "./email/phoenix-email"

// Inside startScheduledJobs(), in the email cron block:
cron.schedule("20 9 * * *", sendPhoenixEmail, { timezone: "America/Los_Angeles" })
```

**How the engine works** (`server/jobs/email/processes/emailUpdates.ts`):
- Queries all users subscribed to the MSA with `dataAppEnabled = true` and `notifications = true`
- Fetches up to 30 recent unsent properties for the MSA from the DB (excludes Vacant Land and properties > $4M)
- Pre-warms Street View availability for each candidate in one pass
- ARV-funded properties are prioritized in each user's set
- Each user gets a personalized set of up to 3 properties filtered by their `dataAppStatusFilter` preference
- Whitelist recipients (from the admin email list) always get the unfiltered top-3
- Properties are marked sent after the job runs so they won't repeat
- Uses Postmark templates — `POSTMARK_TEMPLATE_ALIAS` env var must be set

**Scheduling notes:** Stagger email times by 5 minutes to avoid Postmark rate limits. The existing schedule for reference:
```
6:00am PST — Miami, Tampa, Port St. Lucie (FL markets)
8:00am PST — Denver (MT/CO market)
9:00am PST — San Diego, Los Angeles, San Francisco, Seattle (PST markets)
```
Add new MSAs at a 5-minute offset from the nearest existing market in the same timezone.

---

### Step 14 — Run the type check

```bash
npm run check
```

Fix any TypeScript errors before deploying. Also confirm the MSA row exists in production:
```sql
SELECT * FROM msas WHERE name = 'Phoenix-Mesa-Chandler, AZ';
```

---

## Files Changed Summary

| File | What changes |
|---|---|
| `database/seed.ts` | New MSA in `msas` insert |
| `database/inserts/users.insert.ts` | New name in `MSA_NAMES` const |
| `client/src/constants/filters.constants.ts` | New entry in `MSA[]`, new entries in `COUNTIES[]`, new `${MSA}_MSA_ZIP_CODES` export |
| `client/src/lib/county.ts` | Import new zip constant, new branch in `getZipCodesForCounty` |
| `shared/constants/countyToMsa.ts` | New county → MSA entries (single source of truth for both client and server) |
| `shared/constants/stateDefaults.ts` | New state → default county entry (new states only) |
| `server/utils/dataSyncHelpers.ts` | New county → state entries in `COUNTY_STATE_MAP` |
| `server/utils/resolveMsa.ts` | New zip-prefix ranges in `zipToStaticMsaName` |
| `server/jobs/data_v2/msa-states.ts` | New MSA → state entry in `MSA_STATE` |
| `server/jobs/data_v2/scan-window-init.ts` | Temporary: set `MSA_NAME` and run backfill, then reset |
| `server/jobs/email/${city}-email.ts` | New file — one-liner job wrapper for the MSA |
| `server/jobs/index.ts` | Import and register new email cron |

---

## Notes and Gotchas

**`COUNTY_TO_MSA` is now in one place.** `shared/constants/countyToMsa.ts` is the single source of truth. Both `client/src/lib/county.ts` and `server/utils/countyToMsa.ts` import and re-export from there. Only edit the shared file.

**`STATE_DEFAULT_COUNTY` is now in one place.** `shared/constants/stateDefaults.ts` is imported by both `Signup.tsx` and `Profile.tsx`. Only edit the shared file when adding a new state.

**County name casing and formatting are exact-match.** Every map and array across the codebase uses the county name as a string key. `"Miami-Dade"` and `"miami_dade"` are different — the raw name (e.g., `"Miami-Dade"`) is always used in maps; `countyNameToKey()` derives the snake_case key only for the zip code lookup.

**The initial data backfill cannot run on production servers.** The SFR API bulk fetch for 0–180 days of an MSA is too heavy. It must be run locally with `DATABASE_URL` pointed at the production Neon database.

**Deals work without the data pipeline.** Steps 1–11 are sufficient for Deals. The static zip-prefix fallback in step 10 ensures `resolveMsaId` can link a deal to the correct MSA even before any pipeline data exists in the DB.

**Vendors requires no MSA-specific changes.** The Vendors page has no MSA-gated features.

**The email engine requires DB data.** `sendEmailUpdatesForMsa` queries `properties` for unsent candidates. It will silently skip (log a message and return) if no properties exist for the MSA yet. The email job is only meaningful after the data backfill in step 12 has run and the pipeline is filling data regularly.
