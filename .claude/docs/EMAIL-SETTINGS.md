# Email Notification Settings — Planning Document

## Overview

This document outlines the plan to give users granular control over which emails they receive, from which feeds, and how often. The system covers three distinct notification channels: **Data App daily updates**, **Deal notifications**, and **Vendor/Post notifications** (future). Because these channels work fundamentally differently, they require different controls.

---

## Current State

### What exists today
- `users.notifications` — single boolean; global master toggle (on/off for everything)
- `user_msa_subscriptions` — stores which MSAs a user is subscribed to (presence/absence only, no settings)
- `sent_property_ids` — global per-MSA deduplication: prevents the same property from being emailed twice to anyone in that MSA
- Daily emails fire at fixed cron times per MSA (`server/jobs/index.ts`), all users subscribed to that MSA receive the same 3 properties
- Deal notifications fire on every deal creation via `sendDealNotification()` in `deals.services.ts`
- No vendor/post notifications yet

### Key limitations of the current design
1. One toggle controls everything — disabling notifications blocks all feeds
2. No status filtering — users receive all property statuses (wholesale, sold, on-market, in-renovation)
3. No per-feed toggles — can't opt out of deals while keeping data app emails
4. No deal type filtering — users receive all deal types (wholesale, agent, sold)
5. Email delivery time is hardcoded per MSA cron; users cannot choose when they receive it

---

## Three Email Channels and Their Differences

### 1. Data App — Daily Property Updates
- **Trigger**: Scheduled cron job (runs once per MSA per day at a fixed server time)
- **Content**: 3 most recent properties with Street View images for the MSA
- **Recipients**: All users subscribed to that MSA with notifications enabled
- **Meaningful user controls**: on/off, status filter (which property statuses to include)
- **Frequency**: Fixed daily — no per-user frequency control in V1. Cron times stay fixed per MSA.

### 2. Deals — Deal Notifications
- **Trigger**: Event-driven — fires when a deal is posted to an MSA you're subscribed to
- **Content**: Single deal card (address, price, specs, type)
- **Recipients**: All users subscribed to that MSA with notifications enabled (excluding the poster)
- **Meaningful user controls**: on/off toggle, deal type filter (wholesale / agent / sold)
- **Deal type filter logic**: If a user subscribes to `agent` deals, they receive notifications for `agent`-type deals. The `sold` type is its own filter value — users opt in to sold notifications independently. Empty filter = receive all deal types.

### 3. Vendors / Posts — Future
- **Trigger**: TBD (likely event-driven like deals)
- **Controls**: on/off toggle (add now, implement later)

---

## Proposed Database Schema Changes

### New Table: `user_notification_preferences`
One row per user. Stores global notification preferences that apply across all MSA subscriptions.

```ts
export const userNotificationPreferences = pgTable("user_notification_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),

  // Per-feed toggles (replaces users.notifications long-term)
  dataAppEnabled: boolean("data_app_enabled").notNull().default(true),
  dealNotificationsEnabled: boolean("deal_notifications_enabled").notNull().default(true),
  vendorNotificationsEnabled: boolean("vendor_notifications_enabled").notNull().default(false),

  // Data app: which property statuses to include in emails
  // Values: array of 'in-renovation' | 'on-market' | 'wholesale' | 'sold'
  // Empty array = all statuses (default behavior)
  dataAppStatusFilter: text("data_app_status_filter").array().notNull().default([]),

  // Deal notifications: which deal types to receive
  // Values: array of 'wholesale' | 'agent' | 'sold'
  // Empty array = all types (default behavior)
  dealTypeFilter: text("deal_type_filter").array().notNull().default([]),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

### `user_msa_subscriptions` — No Changes
MSA subscriptions stay in their existing junction table. `userNotificationPreferences` is one row per user and cannot model many-to-many MSA relationships. The existing table is correctly structured. No `lastSentAt` column needed since we removed per-user frequency control from V1.

### `users.notifications` — Master Kill-Switch
`users.notifications` remains the **master kill-switch**. If `notifications = false`, nothing sends regardless of individual preference toggles. This preserves existing behavior for users who have explicitly disabled all notifications.

Migration strategy for new users:
1. When a user first saves preferences, create a `user_notification_preferences` row
2. Use `users.notifications` as the master gate at send time (check first, then check per-feed toggle)
3. Deprecate `users.notifications` in a future cleanup pass once all users have preferences rows and the UI reflects this clearly

---

## How Each Control Works

### Master Kill-Switch
`users.notifications = false` → skip the user entirely. No per-feed checks needed.
`users.notifications = true` → proceed to per-feed toggle checks.

### Feed Toggles
Simple boolean per feed. Checked after the master kill-switch passes.

In `emailUpdates.ts`: check `dataAppEnabled` before queuing a user for an email.
In `deals.services.ts > sendDealNotification`: check `dealNotificationsEnabled` before including a user.

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

The `sold` type is a first-class filter value. Users who want sold notifications opt in to `sold` explicitly. Users who only want `['wholesale']` will not receive sold notifications even if the sold deal was originally wholesale.

### MSA Subscriptions
No changes. Users manage which MSAs they subscribe to via checkboxes in Profile page, backed by `user_msa_subscriptions`. All notification preferences are global and apply to every MSA subscription.

---

## UI Plan

### Profile Page Changes
The current Profile page has:
- Email Notifications: single checkbox (on/off)
- Location Subscriptions: MSA checkboxes (shown only when notifications are on)

Replace the single checkbox section with a new **"Notification Preferences"** panel. Suggested layout:

```
Notification Preferences
└── Data App Updates
    ├── [toggle] Enable daily property update emails
    └── Property Statuses: [checkboxes: Renovating | On Market | Wholesale | Sold]
        (shown only when Data App enabled; empty = all statuses)
└── Deal Notifications
    ├── [toggle] Receive deal notifications when new deals are posted to your MSAs
    └── Deal Types: [checkboxes: Wholesale | Agent | Sold]
        (shown only when Deal Notifications enabled; empty = all types)
└── Vendor Notifications (show as disabled/coming-soon)
    └── [toggle - disabled] Receive vendor notifications (coming soon)

Location Subscriptions
└── [MSA checkboxes - unchanged]
```

The `components/profile/` directory should hold isolated components:
- `NotificationPreferencesPanel.tsx`
- `MsaSubscriptionsPanel.tsx`
- `AccountInfoPanel.tsx`
- `RelationshipManagerPanel.tsx`

### API
Dedicated endpoint: `PATCH /api/auth/me/notifications`
- Cleaner validation scope, separate from profile updates
- Accepts: `dataAppEnabled`, `dealNotificationsEnabled`, `vendorNotificationsEnabled`, `dataAppStatusFilter`, `dealTypeFilter`
- Returns the updated preferences row

---

## Resolved Decisions

| Question | Decision |
|---|---|
| `users.notifications` role | Master kill-switch — if false, nothing sends regardless of per-feed toggles |
| Data app frequency control | Removed from V1 — emails remain fixed daily per MSA cron |
| Status filter with 0 results | Skip user that day — no fallback to all statuses |
| Deal notification frequency | On/off only — event-driven notifications don't batch in V1 |
| Endpoint location | New dedicated `PATCH /api/auth/me/notifications` |
| MSA subscription location | Stays in `user_msa_subscriptions` junction table — correct architecture |
| Deal type filter | Added — `dealTypeFilter: text[]` with values `'wholesale' \| 'agent' \| 'sold'` |

---

## Open Questions

1. **`emailSubscriptionList` table** (whitelist for non-user recipients): These records have no notification preferences. V1 assumption: whitelist recipients receive all emails they're listed for, unchanged.

2. **Per-user sent property tracking (V2)**: `sent_property_ids` is global per MSA. A wholesale property sent to User A (wholesale filter) gets marked sent globally — User B (who later adds wholesale to their filter) won't see it. Acceptable for V1?

---

## Phased Implementation Plan

### Phase 1 — Foundation (current focus)
- [ ] Create `user_notification_preferences` table schema + migration
- [ ] Write data migration: populate `user_notification_preferences` rows from existing `users.notifications`
- [ ] Extend Zod validation for new notification preference fields
- [ ] Add service functions for reading/writing notification preferences
- [ ] Add `PATCH /api/auth/me/notifications` endpoint
- [ ] Refactor `emailUpdates.ts`: per-user status filtering + skip-if-no-match
- [ ] Update `sendDealNotification` in `deals.services.ts` to check `dealNotificationsEnabled` + `dealTypeFilter`
- [ ] Build `components/profile/NotificationPreferencesPanel.tsx` and related components
- [ ] Update `Profile.tsx` to use the new panel components

### Phase 2 — Polish
- [ ] Per-user sent property tracking (replace/extend `sent_property_ids`)
- [ ] Deal notification daily digest (batch multiple deals into one email per day)
- [ ] Per-MSA notification preferences

### Phase 3 — Vendor/Post Notifications
- [ ] Add vendor notification trigger in posts/vendors services
- [ ] Enable `vendorNotificationsEnabled` toggle in UI
- [ ] Define vendor notification template

---

## Files That Will Change in Phase 1

| File | Change |
|---|---|
| `database/schemas/users.schema.ts` | Add `userNotificationPreferences` table |
| `database/updates/users.update.ts` | Add Zod schema for notification preferences |
| `server/services/users/users.services.ts` | Add preference read/write functions |
| `server/controllers/auth/session.controllers.ts` | Add `PATCH /api/auth/me/notifications` handler |
| `server/routes/auth/auth.routes.ts` | Register new notifications route |
| `server/jobs/email/processes/emailUpdates.ts` | Per-user status filtering, skip-if-no-match |
| `server/services/deals/deals.services.ts` | Check `dealNotificationsEnabled` + `dealTypeFilter` |
| `client/src/pages/Profile.tsx` | Refactor to use isolated panel components |
| `client/src/components/profile/` | New directory — panel components |
