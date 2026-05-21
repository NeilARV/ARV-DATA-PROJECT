# Email Notification Settings

## Overview

Users have granular control over which email feeds they receive and for which markets. The system is built on two independent axes:

- **MSA subscriptions** ("where") — which Metropolitan Statistical Areas the user wants to hear about. MSA is the subscription unit.
- **App subscriptions** ("what type") — which of the four email feeds the user is subscribed to.

The intersection of both determines what a user receives. A user subscribed to **San Diego** and **Deals** gets deal notifications for San Diego. Subscribe them to **Vendors** too and they get vendor notifications for San Diego. Unsubscribe from San Diego and neither fires for that market, even if both app toggles remain on.

> **Preferred market vs MSA subscriptions**: These are two different things. The "preferred market" (county + state) selected at signup and on the Profile page is a *browsing preference* — it controls what data the app shows by default. MSA subscriptions control what emails fire. At signup, the county selection is automatically mapped to the corresponding MSA to seed the user's first subscription. Users manage their MSA subscriptions directly from the Profile page.

---

## Architecture

### Master Kill-Switch

`users.notifications` remains the **master kill-switch**. If `notifications = false`, nothing sends regardless of individual app toggles. This preserves the original single-toggle behavior for users who want to opt out of all email entirely.

### Per-App Toggles (user_notification_preferences)

One row per user. Stores global notification preferences that apply across all MSA subscriptions.

```ts
userNotificationPreferences = {
  userId: uuid (PK → users.id CASCADE)

  // Per-app toggles
  dataAppEnabled: boolean (default true)
  dealNotificationsEnabled: boolean (default true)
  vendorNotificationsEnabled: boolean (default false)
  analyticsEnabled: boolean (default false)

  // Data App filter: 'in-renovation' | 'on-market' | 'wholesale' | 'sold'
  // Empty array = all statuses
  dataAppStatusFilter: text[] (default [])

  // Deals filter: 'wholesale' | 'agent' | 'sold'
  // Empty array = all deal types
  dealTypeFilter: text[] (default [])

  createdAt, updatedAt
}
```

### Send-Time Logic

All four conditions must be true for an email to be sent:

1. **MSA subscription present** — `user_msa_subscriptions` has a row for this user + MSA
2. **Master toggle on** — `users.notifications = true`
3. **App toggle on** — e.g. `dataAppEnabled = true`
4. **Content passes filter** — if a filter is configured and non-empty, the content type must be in the filter

Steps 1–3 are evaluated at the DB query level. Step 4 is applied in memory per-user after candidate content is fetched.

---

## Four Email Apps

### 1. Data App — Daily Property Updates

- **Trigger**: Scheduled cron job (once per MSA per day at a fixed server time — see `server/jobs/index.ts`)
- **Content**: Up to 3 most recent properties with Street View images for the MSA
- **Recipients**: All users subscribed to that MSA with `dataAppEnabled = true` and master notifications on
- **Status filter** (`dataAppStatusFilter: text[]`):
  - Values: `'in-renovation' | 'on-market' | 'wholesale' | 'sold'`
  - Empty array = all statuses (default)
  - If filter is non-empty and 0 properties match → skip user that day (no fallback)
- **Whitelist recipients**: `email_subscription_list` entries for the MSA also receive the unfiltered default set

### 2. Deals — Deal Notifications

- **Trigger**: Event-driven — fires when a deal is posted to an MSA the user is subscribed to
- **Content**: Single deal card (address, price, specs, type)
- **Recipients**: All users subscribed to that MSA with `dealNotificationsEnabled = true` and master notifications on; the poster is excluded
- **Deal type filter** (`dealTypeFilter: text[]`):
  - Values: `'wholesale' | 'agent' | 'sold'`
  - Empty array = receive all deal types (default)
  - `sold` is a first-class filter value — users opt in to sold notifications explicitly
  - If filter is non-empty and deal type is NOT in filter → skip user
- **Whitelist recipients**: `email_subscription_list` entries for the MSA also receive all deal notifications

### 3. Vendors / Posts — Vendor & Community Notifications

- **Trigger**: TBD — likely event-driven (new vendor added, new post published)
- **Toggle**: `vendorNotificationsEnabled` (stored, UI wired up — no job fires yet)
- **Filter columns**: Deferred — do not add filter columns until vendor email content and filter values are defined

### 4. Analytics — Market Summary Reports

- **Trigger**: TBD — likely a scheduled cron job (weekly or monthly per MSA)
- **Toggle**: `analyticsEnabled` (stored, UI wired up — no job fires yet)
- **Filter columns**: Deferred — do not add filter columns until analytics email content and filter values are defined

---

## Implementation Details

### Auto-Create Preferences on Signup

`user_notification_preferences` row is created immediately after `createUser()` in `registration.controllers.ts`, using all DB defaults. No lazy creation.

This allows email jobs to use `INNER JOIN` instead of `LEFT JOIN + OR(isNull(...), eq(..., true))`. Existing users without a preferences row are backfilled via `database/insert-preferences.sql`.

### Data App Per-User Filtering

`emailUpdates.ts` fetches an expanded candidate pool (up to 30 properties), pre-caches Street View availability for all candidates in a single pass, then for each user:

1. Filters the candidate pool to their `dataAppStatusFilter` (or all statuses if empty)
2. Picks the first 3 with cached Street View images
3. If 0 match their filter — skips user, no email sent
4. Builds and sends their personalized email

All evaluated property IDs are marked in `sent_property_ids` regardless of outcome. `sent_property_ids` is currently global per MSA (V1 limitation — see Open Questions).

### Deal Type Filtering

In `sendDealNotification` (`deals.services.ts`):

1. Master toggle + `dealNotificationsEnabled` checked at the DB query level
2. After deduplication (poster excluded), `dealTypeFilter` applied per user in memory
3. Empty filter → include user (receives all deal types)
4. Non-empty filter, deal type NOT in filter → skip user

---

## API

### `PATCH /api/auth/me/notifications`

Updates the user's `user_notification_preferences` row (upsert).

**Accepts:**
```json
{
  "dataAppEnabled": boolean,
  "dealNotificationsEnabled": boolean,
  "vendorNotificationsEnabled": boolean,
  "analyticsEnabled": boolean,
  "dataAppStatusFilter": ["in-renovation", "wholesale", ...],
  "dealTypeFilter": ["wholesale", "agent", "sold"]
}
```

All fields are optional. Validated by `updateNotificationPreferencesSchema` in `database/updates/users.update.ts`.

**Returns:** `{ success: true, preferences: NotificationPreferences }`

### `PATCH /api/auth/me`

Handles master toggle + MSA subscriptions (among other profile fields).

**Relevant fields:**
- `notifications: boolean` — master kill-switch
- `msaSubscriptions: string[]` — replaces the user's full MSA subscription list by name

---

## UI — Profile Page

The `NotificationPreferencesPanel` component (`client/src/components/profile/NotificationPreferencesPanel.tsx`) renders:

```
Notification Preferences
│
├── [master toggle] Email Notifications
│   (when off, hides all sub-sections below)
│
├── Data App Updates
│   ├── [toggle] Enable daily property update emails
│   └── Property Statuses (shown only when Data App enabled):
│       [checkboxes: Renovating | On Market | Wholesale | Sold]
│       (empty = all statuses)
│
├── Deal Notifications
│   ├── [toggle] Receive deal notifications
│   └── Deal Types (shown only when Deal Notifications enabled):
│       [checkboxes: Wholesale | Agent | Sold]
│       (empty = all types)
│
├── Vendor Notifications
│   └── [toggle] (coming soon — no filter UI yet)
│
└── Analytics Reports
    └── [toggle] (coming soon — no filter UI yet)

Location Subscriptions
└── [MSA checkboxes — shown when master toggle is on]
```

The panel makes two parallel API calls on save:
- `PATCH /api/auth/me` for master toggle + MSA subscriptions
- `PATCH /api/auth/me/notifications` for per-app toggles and filters

---

## Files

| File | Role |
|---|---|
| `database/schemas/users.schema.ts` | `userNotificationPreferences` table definition |
| `database/updates/users.update.ts` | `updateNotificationPreferencesSchema` Zod validation |
| `database/insert-preferences.sql` | One-time SQL backfill for existing users |
| `server/services/auth/user.services.ts` | `getUserNotificationPreferences`, `upsertUserNotificationPreferences` |
| `server/controllers/auth/session.controllers.ts` | `updateNotifications` handler (`PATCH /api/auth/me/notifications`) |
| `server/controllers/auth/registration.controllers.ts` | Auto-creates prefs row on signup |
| `server/routes/auth.routes.ts` | Route: `PATCH /me/notifications` |
| `server/jobs/email/processes/emailUpdates.ts` | Data App per-user status filtering |
| `server/services/deals/deals.services.ts` | Deal notification `dealNotificationsEnabled` + `dealTypeFilter` |
| `client/src/hooks/use-auth.ts` | `AuthUser`, `NotificationPreferences`, `DataAppStatus`, `DealTypeFilter` types |
| `client/src/components/profile/NotificationPreferencesPanel.tsx` | Profile page preferences UI |
| `client/src/pages/Profile.tsx` | Renders `NotificationPreferencesPanel` |

---

## Open Questions

1. **`emailSubscriptionList` table** (whitelist for non-user recipients): These records have no notification preferences. Current behavior: whitelist recipients receive all emails they're listed for, unchanged. App toggles do not apply to whitelist entries.

2. **Per-user sent property tracking (V2)**: `sent_property_ids` is global per MSA. A wholesale property sent to a wholesale-only user gets marked sent globally — a sold-only user subscribed later won't see it. Acceptable for V1.

3. **Analytics email content and filter values**: What does an analytics email contain? This must be defined before implementing the analytics email job or adding a filter column to the schema.

4. **Vendor/Post email content and filter values**: What triggers a vendor notification — new vendor profile, new community post, or both? Filter values must be defined before adding filter columns.

---

## Planned: RecipientResolver Pattern (Phase 2)

Build a shared `resolveRecipients` module at `server/services/email/recipientResolver.ts`. Each email app gets its own resolver function that returns eligible recipients + their filter context for a given MSA. Email jobs call the resolver and focus only on content building and sending.

**Why**: `emailUpdates.ts`, `deals.services.ts`, future `analyticsJob.ts`, and future `vendorJob.ts` all need the same subscriber resolution logic: master toggle check, app toggle check, MSA subscription presence. Duplicating this JOIN across each job creates drift.

**Planned shape:**
```ts
interface RecipientContext {
    userId: string;
    email: string;
    firstName: string;
    rmEmail?: string;
    dataAppStatusFilter: string[];
    dealTypeFilter: string[];
}

async function resolveDataAppRecipients(msaId: number): Promise<RecipientContext[]>
async function resolveDealRecipients(msaId: number): Promise<RecipientContext[]>
async function resolveVendorRecipients(msaId: number): Promise<RecipientContext[]>
async function resolveAnalyticsRecipients(msaId: number): Promise<RecipientContext[]>
```

**Status**: Phase 2. Will be implemented when a second email app type is ready to ship, to avoid building the abstraction before there's a second real consumer.

---

## Changelog

### Patch 1 — Signup Auto-Create + Backfill SQL
*Resolved design question: whether to lazily create notification preferences or guarantee a row at signup.*

- Added `user_notification_preferences` table to `database/schemas/users.schema.ts` with 4 app toggles (`dataAppEnabled`, `dealNotificationsEnabled`, `vendorNotificationsEnabled`, `analyticsEnabled`) and 2 filter arrays (`dataAppStatusFilter`, `dealTypeFilter`)
- `registration.controllers.ts` — after `createUser()`, immediately calls `upsertUserNotificationPreferences(newUser.id, {})` with no fields so DB defaults apply
- `database/insert-preferences.sql` — one-time SQL backfill query (idempotent) for existing users with no preferences row
- Decision: guarantees all users have a preferences row, eliminates LEFT JOIN null-handling in email jobs, avoids silent include/exclude bugs for users without rows

### Patch 2 — MSA Subscription Model Decision
*Resolved design question: MSA vs county vs hybrid for email subscriptions.*

- Decision: **MSA is the subscription unit**. Users subscribe to entire MSAs (Denver, Miami, San Diego, LA, SF, Port St. Lucie, Seattle, Tampa). No county-level filtering within an MSA in V1.
- Rationale: cron jobs already run per-MSA; county-within-MSA adds significant query complexity for unclear user benefit given the small active MSA set; users never need to know what an MSA is — they pick their county at signup and the registration controller maps it to the MSA automatically
- "Preferred market" (county + state) remains a separate browsing preference — it sets the default view in the app and is not the same as email subscriptions
- `user_msa_subscriptions` table stays unchanged — no county column needed
- County-within-MSA approach was considered and rejected for V1; can be revisited in V2 if demand arises

### Patch 3 — Phase 1 Full Implementation
*All foundation components built and wired together.*

- **Zod schema** — `updateNotificationPreferencesSchema` added to `database/updates/users.update.ts`; validates all 4 toggles + 2 filter arrays; strict mode (no extra fields)
- **Service functions** — `getUserNotificationPreferences` and `upsertUserNotificationPreferences` added to `server/services/auth/user.services.ts`
- **API endpoint** — `PATCH /api/auth/me/notifications` added to `server/routes/auth.routes.ts`; handler `updateNotifications` in `session.controllers.ts`
- **`emailUpdates.ts` refactor** — expanded candidate pool (30 properties), Street View pre-cached in one pass, per-user status filter applied in memory, skip-if-no-match behavior
- **`sendDealNotification` update** — `dealNotificationsEnabled` and `dealTypeFilter` checks added; `sold` treated as a first-class opt-in filter value
- **`NotificationPreferencesPanel.tsx`** — new component under `client/src/components/profile/`; renders master toggle, per-app toggles + filter checkboxes, MSA subscription checkboxes; two parallel PATCH calls on save
- **`Profile.tsx`** — replaced inline notification checkbox with `<NotificationPreferencesPanel user={user} />`
- **`use-auth.ts`** — added `NotificationPreferences`, `DataAppStatus`, `DealTypeFilter` types; `AuthUser` extended with `msaSubscriptions` and `notificationPreferences` fields
- `GET /api/auth/me` — extended to include `msaSubscriptions` (array of MSA names) and `notificationPreferences` in the response alongside the existing user object
