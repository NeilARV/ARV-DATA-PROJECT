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
3. No frequency control — daily emails arrive every day, no skip options
4. No per-feed toggles — can't opt out of deals while keeping data app emails
5. Email delivery time is hardcoded per MSA cron; users cannot choose when they receive it

---

## Three Email Channels and Their Differences

### 1. Data App — Daily Property Updates
- **Trigger**: Scheduled cron job (runs once per MSA per day at a fixed server time)
- **Content**: 3 most recent properties with Street View images for the MSA
- **Recipients**: All users subscribed to that MSA with notifications enabled
- **Meaningful user controls**: on/off, frequency (daily/every other day/weekly), status filter (which property statuses to include)
- **Timing control**: Out of scope for V1. Cron times stay fixed per MSA.

### 2. Deals — Deal Notifications
- **Trigger**: Event-driven — fires when a deal is posted to an MSA you're subscribed to
- **Content**: Single deal card (address, price, specs, type)
- **Recipients**: All users subscribed to that MSA with notifications enabled (excluding the poster)
- **Meaningful user controls**: on/off toggle only (frequency doesn't apply — real-time notifications), optionally deal type filter (wholesale/sold/agent) — V2
- **Note**: "Every other day" or "weekly" frequency doesn't apply here the same way. You'd want to receive a deal notification when it happens, or not at all.

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

  // Data app: how often should we send (checked at send time)
  // Values: 'daily' | 'every_other_day' | 'weekly'
  dataAppFrequency: text("data_app_frequency").notNull().default("daily"),

  // Data app: which property statuses to include in emails
  // Values: array of 'in-renovation' | 'on-market' | 'wholesale' | 'sold'
  // Empty array = all statuses (default behavior)
  dataAppStatusFilter: text("data_app_status_filter").array().notNull().default([]),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

### Modify `userMsaSubscriptions` — Add `lastSentAt`
Required for frequency tracking. When a user subscribes to an MSA, this tracks when the data app last sent them an email for that MSA. The emailUpdates job checks this to decide whether to include them in the current run.

```ts
// Add to userMsaSubscriptions:
lastSentAt: timestamp("last_sent_at"),
```

### `users.notifications` — Migration Strategy
The existing `users.notifications` boolean becomes **redundant** once `userNotificationPreferences` exists, but we should not drop it immediately. Plan:

1. When `user_notification_preferences` row exists for a user, use it as the source of truth
2. Fall back to `users.notifications` for users without a preferences row (backward compat)
3. Automatically create a `user_notification_preferences` row on first profile save or via migration script:
   - `notifications=true` → `dataAppEnabled=true`, `dealNotificationsEnabled=true`
   - `notifications=false` → `dataAppEnabled=false`, `dealNotificationsEnabled=false`
4. Deprecate `users.notifications` in a future cleanup pass once all users have rows

---

## How Each Control Works

### Feed Toggles
Simple boolean per feed. Already covered by `dataAppEnabled` / `dealNotificationsEnabled` / `vendorNotificationsEnabled`.

In `emailUpdates.ts`: check `dataAppEnabled` (or fall back to `users.notifications`) before queuing a user for an email.
In `deals.services.ts > sendDealNotification`: check `dealNotificationsEnabled` before including a user.

### Frequency Control (Data App only)
Values: `daily` | `every_other_day` | `weekly`

Logic in `emailUpdates.ts`:
1. For each user in the MSA subscriber list, load their `userMsaSubscriptions.lastSentAt` and their `dataAppFrequency`
2. **daily** — always include (current behavior)
3. **every_other_day** — include only if `lastSentAt` is null or >= 2 days ago
4. **weekly** — include only if `lastSentAt` is null or >= 7 days ago
5. After sending, update `lastSentAt = NOW()` for each included user/MSA pair

This keeps the cron schedule unchanged (runs daily per MSA) but skips users whose preferred frequency hasn't elapsed yet.

### Status Filter (Data App only)
Stored as `dataAppStatusFilter: text[]`. Empty array = all statuses (default).

Current `emailUpdates.ts` fetches a single candidate pool and sends the same 3 properties to everyone. With per-user status filtering, users may get different property sets from the same candidate pool. This requires a refactor:

**New flow:**
1. Fetch an expanded candidate pool (increase `CANDIDATE_POOL_SIZE`) — include all active statuses, no per-user filtering at the DB level
2. Pre-check Street View availability and cache results in memory for the duration of the job (`Map<propertyId, imageUrl | null>`)
3. For each user (or each unique status filter profile to reduce iterations):
   a. Filter the candidate pool to their preferred statuses
   b. Pick the first 3 with cached Street View images
   c. Build and send their personalized email
4. Mark all properties that were checked (regardless of whether they ended up in any email) in `sent_property_ids`

**Known limitation**: `sent_property_ids` is currently global per MSA. A wholesale property sent to wholesale-only users gets marked as sent, preventing it from being included for a sold-only user who later adds wholesale to their filter. This is acceptable for V1. V2 will migrate to per-user sent tracking if needed.

### MSA Subscriptions
No changes to `user_msa_subscriptions` structure beyond adding `lastSentAt`. Users manage which MSAs they subscribe to the same way as today — checkboxes in Profile page.

### Per-MSA Settings
Out of scope for V1. All notification preferences are global and apply to every MSA subscription. A user subscribed to Denver and Miami gets the same frequency, status filter, and feed toggles applied to both.

---

## UI Plan

### Profile Page Changes
The current Profile page has:
- Email Notifications: single checkbox (on/off)
- Location Subscriptions: MSA checkboxes (shown only when notifications are on)

Replace the single checkbox section with a new **"Notification Preferences"** panel (or eventually a separate settings tab). Suggested layout:

```
Notification Preferences
└── Data App Updates
    ├── [toggle] Enable daily property update emails
    ├── Frequency: [select: Daily | Every Other Day | Weekly]
    └── Property Statuses: [checkboxes: Renovating | On Market | Wholesale | Sold]
└── Deal Notifications
    └── [toggle] Receive deal notifications when new deals are posted to your MSAs
└── Vendor Notifications (show as disabled/coming-soon)
    └── [toggle - disabled] Receive vendor notifications (coming soon)

Location Subscriptions
└── [MSA checkboxes - unchanged]
```

The `components/profile/` directory should be created to hold isolated components for this section:
- `NotificationPreferencesPanel.tsx`
- `MsaSubscriptionsPanel.tsx`
- `AccountInfoPanel.tsx`
- `RelationshipManagerPanel.tsx`

### API
User updates their notification preferences via `PATCH /api/auth/me` (same endpoint used today for profile updates). The `updateUserProfileSchema` Zod schema will be extended to include the new notification preference fields.

Alternatively, a dedicated `PATCH /api/auth/me/notifications` endpoint could be added for separation of concerns — simpler validation, clearer intent. Decision TBD.

---

## Open Questions / Decisions Needed

1. **`users.notifications` deprecation timing**: Keep it as a master override that takes precedence over per-feed settings (i.e., if `notifications=false`, everything is off regardless of individual toggles)? Or migrate it fully to the new table and remove it eventually?

2. **Deal notification frequency nuance**: Deals are event-driven — "every other day" doesn't translate cleanly. One interpretation: if the user receives a deal notification today, suppress the next one for the day (daily digest model). Is this desired, or is on/off sufficient for V1?

3. **Status filter interaction with candidate pool**: If a user selects only "Wholesale" but there are no new wholesale properties in the candidate pool, they get no email that day. Is this expected/acceptable behavior, or do we fall back to showing all statuses?

4. **Sent property tracking with user-specific filters**: A property sent to a wholesale-only subscriber gets marked globally sent. A later subscriber who adds wholesale to their filter won't see it. Acceptable for V1?

5. **Weekly frequency — which day?**: Does "weekly" mean the next occurrence of the cron job that fires >= 7 days after `lastSentAt`? Or should users pick a specific day (Mon/Wed/Fri)? Specific-day selection requires more logic; interval-based is simpler.

6. **Endpoint location**: `PATCH /api/auth/me` (extend existing) vs `PATCH /api/auth/me/notifications` (new dedicated endpoint)?

7. **`emailSubscriptionList` table** (whitelist for non-user recipients): These records have no notification preferences. Do they always receive everything, or should they also gain preferences? V1 assumption: whitelist recipients receive all emails they're listed for, unchanged.

---

## Phased Implementation Plan

### Phase 1 — Foundation (current focus)
- [ ] Create `user_notification_preferences` table schema + migration
- [ ] Add `lastSentAt` to `userMsaSubscriptions`
- [ ] Write data migration: populate `user_notification_preferences` rows from existing `users.notifications`
- [ ] Extend `updateUserProfileSchema` (Zod) to include new preference fields
- [ ] Add service functions for reading/writing notification preferences
- [ ] Update `PATCH /api/auth/me` (or add new endpoint) to persist preferences
- [ ] Refactor `emailUpdates.ts`: per-user status filtering + frequency gate + lastSentAt update
- [ ] Update `sendDealNotification` in `deals.services.ts` to check `dealNotificationsEnabled`
- [ ] Build `components/profile/NotificationPreferencesPanel.tsx` and related components
- [ ] Update `Profile.tsx` to use the new panel components

### Phase 2 — Polish
- [ ] Per-user sent property tracking (replace/extend `sent_property_ids`)
- [ ] Deal notification frequency (daily digest model)
- [ ] Deal type filter (wholesale-only deal notifications)
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
| `database/schemas/msas.schema.ts` | Add `lastSentAt` to `userMsaSubscriptions` |
| `database/updates/users.update.ts` | Extend Zod schema for profile update |
| `server/services/users/users.services.ts` | Add preference read/write functions |
| `server/controllers/auth/session.controllers.ts` | Update `updateProfile` to handle preferences |
| `server/jobs/email/processes/emailUpdates.ts` | Per-user filtering, frequency gate, lastSentAt update |
| `server/services/deals/deals.services.ts` | Check `dealNotificationsEnabled` |
| `client/src/pages/Profile.tsx` | Refactor to use isolated panel components |
| `client/src/components/profile/` | New directory — panel components |


## Where we left off:
# Big Picture
The core insight is that your three email channels are architecturally different:

Data App: scheduled/batch, one email per MSA per day → frequency + status filtering makes sense
Deals: event-driven, fires on every deal post → frequency doesn't really apply, on/off is the primary control
Vendors: future, likely mirrors deals
So the settings surface is asymmetric by design — not every control applies to every channel.

# The Hardest Part
Right now emailUpdates.ts builds one property set and blasts it to all MSA subscribers. With per-user status filters, two users in the same MSA might want different properties. This means we either:

Process per-user (everyone gets their own filtered list from a shared candidate pool) — more sends, but clean
Group by filter profile (users with identical filters share a property set) — more efficient but complex
I recommend option 1 with a Street View cache in memory per job run to avoid redundant API calls. The doc reflects this.

The other sharp edge: sent_property_ids is currently global per MSA. A wholesale property sent to User A gets marked sent — User B (a new wholesale subscriber) will never see it. This is a known V1 limitation and is documented.

# Questions for You
users.notifications — keep as master kill-switch or migrate away? I'd lean toward keeping it temporarily as a fallback for users without preferences rows, then removing it later.

Deal notification frequency — does on/off suffice for V1, or do you want any kind of "daily digest" batching for deals? (e.g., get one deal email per day even if 3 deals were posted)

Status filter default — if a user's filter returns 0 matching properties, should we fall back to all statuses or just skip them that day?

Weekly frequency — simple "7 days since last send" interval, or let users pick a specific day of the week?

One endpoint or two — extend PATCH /api/auth/me or add PATCH /api/auth/me/notifications? The dedicated route is cleaner to test and maintain.