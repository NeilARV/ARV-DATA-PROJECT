# Offer-Nudge Email — Design & Plan

> **Status:** Design only. No code written yet.
> **Goal:** When a posted deal gets no offers after a configurable delay, send an email to
> subscribers in the deal's MSA: *"Don't like the price? What would you offer?"* — showing the
> deal card and a button that deep-links straight to the deal (where the **Send Offer** button
> lives).

---

## 1. Product Summary

- A deal is posted. If nobody submits an **offer** (a `deal_bids` row) within ~4 hours, we email
  everyone subscribed to that deal's MSA inviting them to make an offer.
- The email reuses the existing deal-card layout (like `new-deal-v1.mustache`) but with
  offer-focused copy and a CTA that opens the deal directly via page + query params.
- The cadence is **interval-driven and configurable**:
  - `MAX_COUNT = 1` → one email, ~4h after the deal is posted.
  - `MAX_COUNT = 2` → first email ~4h after posting, a second ~4h after the first (≈8h total).
  - `MAX_COUNT = 3` → a third ~4h after the second (≈12h total). Etc.
- **We ship with `MAX_COUNT = 1`** but build the mechanism so bumping the number "just works."

---

## 2. Decisions (locked in)

| Question | Decision |
|---|---|
| What counts as a "response" that suppresses the nudge? | **Offers only** (`deal_bids`). Inquiries (Request More Info) are *not* persisted today, so they cannot suppress. See Known Limitations. |
| Recurrence | **Run once for now** (`MAX_COUNT = 1`), but design for N intervals (1/2/3…). Nth nudge fires after N × interval hours of no offers. |
| Anti-spam (thundering herd) | **No mitigation in v1.** Documented below as a **CRITICAL** follow-up. |
| Which deal types | **All types except `sold`** (`wholesale`, `agent`, `reo`). |

---

## 3. How "no response" is detected

A deal is **eligible** for its next nudge when **all** hold:

1. `deals.type <> 'sold'`
2. **No offers:** `NOT EXISTS (SELECT 1 FROM deal_bids WHERE deal_bids.deal_id = deals.id)`
3. **Under the cap:** `offer_nudge_count < MAX_COUNT`
4. **Interval elapsed:** `now() - COALESCE(last_offer_nudge_at, created_at) >= INTERVAL_HOURS`
   - First nudge measures from `created_at`.
   - Each subsequent nudge measures from the previous `last_offer_nudge_at`.

This single predicate produces the entire cadence — no special-casing the first vs. later nudges.

---

## 4. Schema changes

Add two columns to the `deals` table (`database/schemas/deals.schema.ts`):

```ts
// How many offer-nudge emails have gone out for this deal (0 = none yet).
offerNudgeCount: integer('offer_nudge_count').notNull().default(0),
// When the most recent offer-nudge email was sent (null = none yet).
lastOfferNudgeAt: timestamp('last_offer_nudge_at', { withTimezone: true }),
```

Apply with `npm run db:push`.

**Why columns, not a flag:** the interval logic needs a count (to know which nudge is next and
when to stop) and a timestamp (to measure the gap). A boolean can't express `MAX_COUNT = 2/3`.

**Optional (nice-to-have, not required for v1):** a `deal_offer_nudges` log table
(`id, dealId, nudgeNumber, sentAt, recipientCount`) for auditing/debugging, mirroring the
`sent_property_ids` cache pattern. Skip for v1 unless we want the history.

---

## 5. Configuration

Define as named constants in the service (top of `deals.services.ts`, near
`COMPANION_NOTIFICATION_MSAS`), so tuning is a one-line change:

```ts
const OFFER_NUDGE_INTERVAL_HOURS = 4; // gap between nudges (and initial delay after posting)
const OFFER_NUDGE_MAX_COUNT = 1;      // number of nudges per deal (1 now; 2 or 3 later)
```

(Could later be promoted to env vars if we want to tune without a deploy.)

---

## 6. Backend logic

### New service function: `sendOfferNudges()` in `server/services/deals/deals.services.ts`

1. **Select eligible deals** with one query implementing the §3 predicate (joins to `msas` for
   the area label, `users` for the poster). Order by `created_at` for determinism.
2. **For each eligible deal** (wrapped in its own `try/catch` so one failure doesn't abort the run):
   - Reuse the existing **subscriber fan-out** from `sendDealNotification`:
     - MSA subscribers (`user_msa_subscriptions` + `user_notification_preferences`, with
       `users.notifications = true` and `dealNotificationsEnabled = true`),
     - **companion-MSA** fan-out via `COMPANION_NOTIFICATION_MSAS`,
     - **deal-type filter** (`userNotificationPreferences.dealTypeFilter`),
     - **poster excluded** (except `neil@arvfinance.com`, matching current behavior),
     - **whitelist recipients** (`getWhitelistRecipientsForMsa`, deduped by email).
   - Build the template model (deal card) and send via `sendTemplateToUsers` with the new
     template alias.
   - **After processing**, set `last_offer_nudge_at = now()` and `offer_nudge_count = offer_nudge_count + 1`.
     - **Decision to confirm at build time:** increment even when there are zero subscribers, so a
       deal in an empty/quiet MSA isn't re-evaluated forever. Tradeoff: a "nudge" is consumed
       without an email actually going out. (Alternative: only increment when ≥1 email was
       attempted — but then quiet deals are re-queried every run until the cap is somehow reached,
       which never happens. Recommend: increment on processing.)

### Refactor opportunity (recommended)

`sendDealNotification` already contains all the reusable pieces: the subscriber + companion-MSA
query, the deal-type filter, whitelist dedup, street-view resolution, price/specs formatting, and
the `deal_url` builder (page + query params). Extract these into shared helpers so the new nudge
path doesn't copy-paste:

- `getDealNotificationRecipients(deal, msaId, posterUserId)` → `{ users, whitelist, companionMsaIds }`
- `buildDealCardTemplateModel(deal, msaName)` → the `image_block`/`no_image_block`/specs/price/
  `deal_url`/etc. object shared by `new-deal`, `deal-sold`, `price-update`, and the new nudge.

This keeps the offer-nudge template model identical to the new-deal card with only the copy
differing. (If we'd rather not touch `sendDealNotification` now, the nudge can duplicate the
logic — but note the duplication as tech debt.)

### Deep link (already solved — reuse as-is)

`sendDealNotification` already builds:
```
{APP_URL}/deals?dealId={id}&filterType=county&filterValue={county}&filterState={state}
```
The Deals page reads these (`useDealsNav`: `?dealId`, `?filterType/Value/State`) and opens the
deal. The deal card exposes the **Send Offer** button. So the CTA needs no new frontend work —
just point the button at this URL.

---

## 7. New email template

- File: `server/assets/email/templates/deal-offer-nudge-v1.mustache`
  - Clone `new-deal-v1.mustache`'s deal-card markup (image column, badges, address, 2×2 financial
    grid, notes block, CTA). All the same template variables apply.
  - **Header:** e.g. *"What would you offer?"*
  - **Intro copy:** e.g. *"Don't like the asking price on this {county} deal? Make an offer — the
    seller may be open to it."*
  - **CTA button:** *"View Deal & Make an Offer"* → `{{deal_url}}`.
  - **Footer:** same subscription/notification footer.
- **Postmark:** create a matching Postmark template and add a new env var
  `POSTMARK_DEAL_OFFER_NUDGE_TEMPLATE_ALIAS`. The service skips sending (with a warning log) if the
  alias is unset, matching the existing offer/sold/price templates.

---

## 8. Cron registration

New job wrapper `server/jobs/send-offer-nudges.ts` (thin, mirrors the email job wrappers):

```ts
import { sendOfferNudges } from 'server/services/deals/deals.services';
export async function runOfferNudges() { await sendOfferNudges(); }
```

Register in `server/jobs/index.ts`, **production-guarded** like the other send jobs:

```ts
// Offer nudges — hourly during daytime hours (PT). A deal that crosses the 4h
// threshold overnight is caught the next morning, so we never email at 3 AM.
cron.schedule('0 8-20 * * *', runOfferNudges, { timezone: 'America/Los_Angeles' });
```

**Why hourly + daytime window:** the interval is 4h, so hourly granularity adds at most ~1h of lag
— fine. Restricting to ~8 AM–8 PM PT avoids overnight sends for deals posted late evening; they
queue up and go out at 8 AM. (Caveat: the daytime cap is PT-based and the audience spans EST→PST
MSAs; acceptable for v1. Revisit if eastern markets want earlier sends.)

---

## 9. ⚠️ CRITICAL follow-up — thundering herd / email spam

**Problem (explicitly flagged, NOT solved in v1):** If several deals are posted around the same
time and none get offers, they all cross the 4h threshold together. The v1 job sends **one email
per deal**, so a user subscribed to that MSA receives a **burst** of near-simultaneous nudge
emails. This is a real spam/deliverability risk and **must be addressed before this scales.**

**Candidate solutions (to design later):**

1. **Per-MSA digest (recommended).** Bundle *all* eligible deals for an MSA into **one email per
   user per run**, rendered as a list/stack of deal cards. A user gets at most one nudge email per
   run no matter how many deals qualify. Requires a new multi-deal template and shifts the
   `offer_nudge_count`/`last_offer_nudge_at` increment to "per deal included in a sent digest."
2. **Per-user daily cap + batching.** Keep one-deal-per-email but cap each recipient to N
   nudge emails/day and process only a limited batch of deals per run, deferring the rest.
3. **Global send-rate throttle.** Spread sends over time within a run.

**Recommendation:** plan for **#1 (per-MSA digest)** as the v2 once v1 proves the concept.

---

## 10. Known limitations (v1)

- **Inquiries don't suppress.** Request-More-Info is fire-and-forget with no DB record, so a deal
  that received inquiries but no *offers* will still be nudged. To fix, persist inquiries (new
  `deal_inquiries` table or a `last_inquiry_at` column) and add it to the §3 predicate.
- **Deleted offers re-qualify.** If a deal's only offer is later deleted, `NOT EXISTS` makes the
  deal eligible again — but `offer_nudge_count < MAX_COUNT` still bounds total sends, so the blast
  radius is limited.
- **No anti-spam** (see §9).
- **Daytime window is PT-only** across multi-timezone MSAs (see §8).

---

## 11. File-change checklist

| File | Change |
|---|---|
| `database/schemas/deals.schema.ts` | Add `offerNudgeCount`, `lastOfferNudgeAt` columns (+ optional `deal_offer_nudges` log table). Run `npm run db:push`. |
| `server/services/deals/deals.services.ts` | Add `OFFER_NUDGE_*` constants + `sendOfferNudges()`; (recommended) extract `getDealNotificationRecipients` + `buildDealCardTemplateModel` shared helpers. |
| `server/jobs/send-offer-nudges.ts` | New thin job wrapper. |
| `server/jobs/index.ts` | Register the cron (production-guarded, `0 8-20 * * *`, LA tz). |
| `server/assets/email/templates/deal-offer-nudge-v1.mustache` | New offer-nudge template (deal card + offer copy). |
| Postmark + env | New Postmark template; add `POSTMARK_DEAL_OFFER_NUDGE_TEMPLATE_ALIAS`. Add to the env table in `CLAUDE.md` (and the user-managed `.env`). |
| `.claude/docs/apps.md` (Deals) | Document the offer-nudge job in the Deal Lifecycle + backend sections. |
| `.claude/docs/api.md` / `.claude/docs/database.md` | Reflect the new `deals` columns (and log table if added). |
| Tests | Unit-test the eligibility predicate (no offers, type≠sold, interval elapsed, count<max) and the count/timestamp increment; verify a deal with an offer is excluded. Follow `.claude/docs/testing.md`. |

---

## 12. Build order (when implemented)

1. Schema columns + `db:push`.
2. Postmark template + `deal-offer-nudge-v1.mustache` + env var.
3. (Recommended) refactor shared helpers out of `sendDealNotification`.
4. `sendOfferNudges()` service (eligibility query → fan-out → send → increment).
5. Job wrapper + cron registration.
6. Tests.
7. Docs + run `code-optimizer` + `agent-updater`.
8. **Before scaling:** design & ship the §9 anti-spam digest.
