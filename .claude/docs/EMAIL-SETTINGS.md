# Email Notification Settings — Planning Document

## Overview

This document outlines the plan to give users granular control over which emails they receive, from which apps, and for which geographic markets. The system is built around two independent axes of control:

- **MSA subscriptions** ("where") — which Metropolitan Statistical Areas the user wants to hear about
- **App subscriptions** ("what type") — which of the four email feeds the user is subscribed to

The intersection of both determines what a user receives. A user subscribed to **San Diego** and **Deals** gets deal notifications for San Diego. Subscribe them to **Vendors** too and they get vendor notifications for San Diego as well. Unsubscribe from San Diego and neither fires for that market, even if both app toggles are on.

There are four known email apps: **Data App**, **Deals**, **Vendors**, and **Analytics**. Each has its own trigger mechanism, email content, and — where applicable — its own set of status-based filters.

---

## Current State

### What exists today
- `users.notifications` — single boolean; global master toggle (on/off for everything)
- `user_msa_subscriptions` — stores which MSAs a user is subscribed to (presence/absence only, no app-level settings)
- `sent_property_ids` — global per-MSA deduplication: prevents the same property from being emailed twice to anyone in that MSA
- Daily emails fire at fixed cron times per MSA (`server/jobs/index.ts`); all users subscribed to that MSA receive the same 3 properties
- Deal notifications fire on every deal creation via `sendDealNotification()` in `deals.services.ts`; currently checks only `users.notifications` and MSA subscription — no per-app filtering
- No vendor or analytics notifications yet

### Key limitations of the current design
1. One toggle controls everything — disabling notifications blocks all feeds
2. No app-level toggles — can't opt out of deals while keeping Data App emails
3. No status filtering — users receive all property statuses (wholesale, sold, on-market, in-renovation)
4. No deal type filtering — users receive all deal types (wholesale, agent, sold)
5. No analytics emails exist yet
6. No vendor/post notifications yet
7. Email delivery time is hardcoded per MSA cron; users cannot choose when they receive it

---

## Four Email Apps

### 1. Data App — Daily Property Updates
- **Trigger**: Scheduled cron job (runs once per MSA per day at a fixed server time)
- **Content**: 3 most recent properties with Street View images for the MSA
- **Recipients**: All users subscribed to that MSA with `dataAppEnabled = true` and master notifications on
- **Status filter**: `dataAppStatusFilter: text[]`
  - Values: `'in-renovation' | 'on-market' | 'wholesale' | 'sold'`
  - Empty array = all statuses (default behavior)
  - If filter is non-empty and 0 properties match → skip user that day (no fallback)
- **Frequency**: Fixed daily per MSA cron. No per-user frequency control in V1.

### 2. Deals — Deal Notifications
- **Trigger**: Event-driven — fires when a deal is posted to an MSA the user is subscribed to
- **Content**: Single deal card (address, price, specs, type)
- **Recipients**: All users subscribed to that MSA with `dealNotificationsEnabled = true` and master notifications on; the poster is excluded
- **Deal type filter**: `dealTypeFilter: text[]`
  - Values: `'wholesale' | 'agent' | 'sold'` (matches `dealTypeEnum` in `deals.schema.ts`)
  - Empty array = receive all deal types (default behavior)
  - `sold` is a first-class filter value — users opt in to sold notifications explicitly
  - Filter logic: if filter is non-empty and deal type is NOT in filter → skip user
- **Frequency**: Event-driven per deal creation. No batching in V1.

### 3. Vendors / Posts — Vendor & Community Notifications
- **Trigger**: TBD — likely event-driven (new vendor added, new post published)
- **Content**: TBD
- **Recipients**: All users subscribed to matching MSA with `vendorNotificationsEnabled = true` and master notifications on
- **Status/type filter**: TBD — vendor/post content doesn't map to property statuses. Filter values and behavior to be defined when vendor email content is specified. **Do not add a filter column until this is resolved** (see Open Questions).
- **Frequency**: TBD

### 4. Analytics — Market Summary Reports
- **Trigger**: TBD — likely a scheduled cron job (weekly or monthly per MSA)
- **Content**: TBD — expected to be a market summary report (price trends, volume, ARV activity) for the user's subscribed MSAs
- **Recipients**: All users subscribed to matching MSA with `analyticsEnabled = true` and master notifications on
- **Status/type filter**: TBD — it is unclear whether market summary reports have meaningful per-status filtering. **Do not add a filter column until Analytics email content is defined** (see Open Questions).
- **Frequency**: TBD (weekly or monthly)

---

## Proposed Database Schema Changes

### New Table: `user_notification_preferences`
One row per user. Stores global notification preferences that apply across all MSA subscriptions.

```ts
export const userNotificationPreferences = pgTable("user_notification_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),

  // Per-app toggles (replaces users.notifications long-term)
  dataAppEnabled: boolean("data_app_enabled").notNull().default(true),
  dealNotificationsEnabled: boolean("deal_notifications_enabled").notNull().default(true),
  vendorNotificationsEnabled: boolean("vendor_notifications_enabled").notNull().default(false),
  analyticsEnabled: boolean("analytics_enabled").notNull().default(false),

  // Data App: which property statuses to include in emails
  // Values: array of 'in-renovation' | 'on-market' | 'wholesale' | 'sold'
  // Empty array = all statuses (default behavior)
  dataAppStatusFilter: text("data_app_status_filter").array().notNull().default([]),

  // Deals: which deal types to receive notifications for
  // Values: array of 'wholesale' | 'agent' | 'sold'
  // Empty array = all types (default behavior)
  dealTypeFilter: text("deal_type_filter").array().notNull().default([]),

  // Vendor and Analytics filters: deferred — no columns added until content and filter
  // values are defined (see Open Questions #3 and #4).

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

### `user_msa_subscriptions` — No Changes
MSA subscriptions stay in their existing junction table. `user_notification_preferences` is one row per user and cannot model many-to-many MSA relationships. The existing table is correctly structured.

### `users.notifications` — Master Kill-Switch
`users.notifications` remains the **master kill-switch**. If `notifications = false`, nothing sends regardless of individual app toggles. This preserves existing behavior for users who have explicitly disabled all notifications.

**Migration strategy for new users:**
1. When a user first saves preferences, create a `user_notification_preferences` row
2. Use `users.notifications` as the master gate at send time (check first, then check per-app toggle)
3. Deprecate `users.notifications` in a future cleanup pass once all users have preference rows and the UI reflects the new model

---

## How Each Control Works

### MSA × App Model
The two axes are evaluated independently and ANDed together at send time:

1. **Is the user subscribed to this MSA?** (`user_msa_subscriptions` — presence check)
2. **Is the master toggle on?** (`users.notifications = true`)
3. **Is the app toggle on?** (e.g. `dataAppEnabled = true`)
4. **Does the content pass the user's filter?** (if a filter is configured)

All four must be true for an email to be sent. Steps 1–3 are checked in order; step 4 only applies to apps that have filters defined.

### Master Kill-Switch
`users.notifications = false` → skip the user entirely. No per-app checks needed.
`users.notifications = true` → proceed to per-app toggle checks.

### App Toggles
Simple boolean per app. Checked after the master kill-switch passes.

- In `emailUpdates.ts`: check `dataAppEnabled` before queuing a user for an email.
- In `deals.services.ts > sendDealNotification`: check `dealNotificationsEnabled` before including a user.
- Analytics and Vendors: check their respective toggle when those jobs are implemented.

### Data App Status Filter
Stored as `dataAppStatusFilter: text[]`. Empty array = all statuses (default).

Current `emailUpdates.ts` fetches a single candidate pool and sends the same 3 properties to everyone. With per-user status filtering, users may get different property sets from the same candidate pool. This requires a refactor:

**New flow:**
1. Fetch an expanded candidate pool (increase `CANDIDATE_POOL_SIZE`) — include all active statuses, no per-user filtering at the DB level
2. Pre-check Street View availability and cache results in memory for the duration of the job (`Map<propertyId, imageUrl | null>`)
3. For each user:
   a. Filter the candidate pool to their preferred statuses (or all if filter is empty)
   b. Pick the first 3 with cached Street View images
   c. If 0 properties match their filter — **skip, do not send** (no fallback)
   d. Build and send their personalized email
4. Mark all properties that were checked in `sent_property_ids`

**Known limitation**: `sent_property_ids` is currently global per MSA. A wholesale property sent to wholesale-only users gets marked as sent, preventing it from being included for a sold-only user. Acceptable for V1. V2 will migrate to per-user sent tracking if needed.

### Deal Type Filter
Stored as `dealTypeFilter: text[]`. Empty array = all types (default).

In `sendDealNotification`:
1. After the master kill-switch and `dealNotificationsEnabled` checks pass
2. Check if the deal's type is in the user's `dealTypeFilter`
3. If filter is empty → include user (receives all deal types)
4. If filter is non-empty and deal type is NOT in filter → skip user
5. If filter is non-empty and deal type IS in filter → send notification

The `sold` type is a first-class filter value. Users who want sold notifications opt in to `sold` explicitly. Users who only want `['wholesale']` will not receive sold notifications.

### Analytics Toggle (V1 — toggle only)
In V1, the `analyticsEnabled` toggle is wired up in the UI and stored in `user_notification_preferences`, but no analytics email job exists yet. When the analytics cron job is built, it will check this toggle. No filter values are defined until analytics email content is specified.

### Vendor Toggle (V1 — toggle only)
Same as Analytics. The `vendorNotificationsEnabled` toggle is stored, but no vendor notification job fires yet. Filter values are deferred until vendor email content is specified.

### MSA Subscriptions
No changes. Users manage which MSAs they subscribe to via checkboxes in the Profile page, backed by `user_msa_subscriptions`. All notification app preferences are global and apply to every MSA subscription.

---

## UI Plan

### Profile Page Changes
The current Profile page has:
- Email Notifications: single checkbox (on/off)
- Location Subscriptions: MSA checkboxes (shown only when notifications are on)

Replace the single checkbox section with a new **"Notification Preferences"** panel. Suggested layout:

```
Notification Preferences
│
├── [master toggle] Enable email notifications
│   (when off, hides all sub-sections below)
│
├── Data App Updates
│   ├── [toggle] Enable daily property update emails
│   └── Property Statuses (shown only when Data App enabled):
│       [checkboxes: Renovating | On Market | Wholesale | Sold]
│       (empty = all statuses)
│
├── Deal Notifications
│   ├── [toggle] Receive deal notifications when new deals are posted to your MSAs
│   └── Deal Types (shown only when Deal Notifications enabled):
│       [checkboxes: Wholesale | Agent | Sold]
│       (empty = all types)
│
├── Vendor Notifications
│   └── [toggle] Receive vendor & community post notifications (coming soon)
│       (no filter UI in V1 — filter values TBD)
│
└── Analytics Reports
    └── [toggle] Receive market analytics reports (coming soon)
        (no filter UI in V1 — filter values TBD)

Location Subscriptions
└── [MSA checkboxes — unchanged, shown when master toggle is on]
```

The `components/profile/` directory should hold isolated components:
- `NotificationPreferencesPanel.tsx`
- `MsaSubscriptionsPanel.tsx`
- `AccountInfoPanel.tsx`
- `RelationshipManagerPanel.tsx`

### API
Dedicated endpoint: `PATCH /api/auth/me/notifications`
- Cleaner validation scope, separate from profile updates
- Accepts: `dataAppEnabled`, `dealNotificationsEnabled`, `vendorNotificationsEnabled`, `analyticsEnabled`, `dataAppStatusFilter`, `dealTypeFilter`
- Returns the updated preferences row
- Note: `analyticsStatusFilter` and `vendorStatusFilter` are **not** accepted until those filter values are defined

---

## Resolved Decisions

| Question | Decision |
|---|---|
| `users.notifications` role | Master kill-switch — if false, nothing sends regardless of per-app toggles |
| MSA × App model | Global app toggles apply to all subscribed MSAs. Not per-MSA per-app. |
| Data app frequency control | Removed from V1 — emails remain fixed daily per MSA cron |
| Status filter with 0 results | Skip user that day — no fallback to all statuses |
| Deal notification frequency | On/off only — event-driven notifications don't batch in V1 |
| Endpoint location | New dedicated `PATCH /api/auth/me/notifications` |
| MSA subscription location | Stays in `user_msa_subscriptions` junction table — correct architecture |
| Deal type filter | Added — `dealTypeFilter: text[]` with values `'wholesale' \| 'agent' \| 'sold'` |
| Analytics as 4th app | Added — `analyticsEnabled` boolean, no filter column until content is defined |
| Vendor/Analytics filter columns | Deferred — do not add filter array columns until email content and filter values are defined |

---

## Open Questions

1. **`emailSubscriptionList` table** (whitelist for non-user recipients): These records have no notification preferences. V1 assumption: whitelist recipients receive all emails they're listed for, unchanged. App toggles do not apply to whitelist entries.

2. **Per-user sent property tracking (V2)**: `sent_property_ids` is global per MSA. A wholesale property sent to User A (wholesale filter) gets marked sent globally — User B (wholesale filter, subscribed later) won't see it. Acceptable for V1.

3. **Analytics email content and filter values**: What does an analytics email contain — price trend charts, volume summaries, ARV deal counts? Does the user need to filter by property status, deal type, or something else entirely? **This must be defined before implementing the analytics email job or adding a filter column to the schema.**

4. **Vendor/Post email content and filter values**: What triggers a vendor notification — a new vendor profile added, a new community post published, or both? Are these separate notification types (vendor vs. post) or one combined feed? Does the filter apply to vendor category (e.g., "only notify me for General Contractor vendors")? **Define before implementing vendor notifications or adding filter columns.**

---

## Phased Implementation Plan

### Phase 1 — Foundation (current focus)
- [ ] Create `user_notification_preferences` table schema + migration (includes `analyticsEnabled`)
- [ ] Write data migration: populate `user_notification_preferences` rows from existing `users.notifications`
- [ ] Extend Zod validation for new notification preference fields
- [ ] Add service functions for reading/writing notification preferences
- [ ] Add `PATCH /api/auth/me/notifications` endpoint (accepts all 4 app toggles + 2 filter arrays)
- [ ] Refactor `emailUpdates.ts`: per-user status filtering + skip-if-no-match
- [ ] Update `sendDealNotification` in `deals.services.ts` to check `dealNotificationsEnabled` + `dealTypeFilter`
- [ ] Build `components/profile/NotificationPreferencesPanel.tsx` and related components
- [ ] Update `Profile.tsx` to use the new panel components

### Phase 2 — Polish
- [ ] Per-user sent property tracking (replace/extend `sent_property_ids`)
- [ ] Deal notification daily digest (batch multiple deals into one email per day)
- [ ] Per-MSA notification preferences (if demand arises)

### Phase 3 — Analytics & Vendor Emails
- [ ] Define analytics email content, cadence, and filter values (answer Open Question #3)
- [ ] Build analytics cron job + email template
- [ ] Enable `analyticsEnabled` filter UI in the profile panel
- [ ] Define vendor/post notification trigger and content (answer Open Question #4)
- [ ] Build vendor notification trigger in posts/vendors services
- [ ] Enable `vendorNotificationsEnabled` filter UI in the profile panel
- [ ] Define and add filter columns for both apps once values are known

---

## Files That Will Change in Phase 1

| File | Change |
|---|---|
| `database/schemas/users.schema.ts` | Add `userNotificationPreferences` table (4 app toggles + 2 filter arrays) |
| `database/updates/users.update.ts` | Add Zod schema for notification preferences |
| `server/services/users/users.services.ts` | Add preference read/write functions |
| `server/controllers/auth/session.controllers.ts` | Add `PATCH /api/auth/me/notifications` handler |
| `server/routes/auth/auth.routes.ts` | Register new notifications route |
| `server/jobs/email/processes/emailUpdates.ts` | Per-user status filtering, skip-if-no-match |
| `server/services/deals/deals.services.ts` | Check `dealNotificationsEnabled` + `dealTypeFilter` |
| `client/src/pages/Profile.tsx` | Refactor to use isolated panel components |
| `client/src/components/profile/` | New directory — panel components |
