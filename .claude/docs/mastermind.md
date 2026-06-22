# Mastermind — Messaging Feature Design & Build Plan

**Feature name:** Mastermind
**Application:** ARV Property Intelligence Platform (4th app, alongside Data · Deals · Vendors)
**Tech Stack:** React 18 + Vite + Wouter + TanStack Query / Express + Passport + Drizzle ORM / PostgreSQL (Neon) / Replit Deployment
**Current Users:** ~150 | Target: 1K–5K | Max Design Ceiling: 10K
**Date:** June 8, 2026

---

## What Mastermind Is

Mastermind is a Slack-style real-time community built into ARV. It is **not** positioned as
"a Slack clone" — it's the live layer of a **mastermind subscription**: a place where members
get up-to-the-minute market information and talk to each other directly, instead of waiting on
email digests. Think topic channels (`#general`, `#first-time-flippers`, `#san-diego-market`),
real-time messages, @mentions, reactions, and notifications — scoped to paying members and the
ARV team.

It sits beside the three existing apps and reuses the shared foundation: auth/session, the
5-provider context tree, Drizzle/Neon, Supabase Storage (already used for vendor/post images),
Postmark (already used for deal emails), and the TipTap rich-text + mention stack already built
for the Vendors activity feed.

> **Route:** `/mastermind` · **Backend:** `messages.*`, `channels.*`, `notifications.*`

---

## Table of Contents

1. [Access Model](#access-model)
2. [Architecture Overview](#architecture-overview)
3. [Deployment & Known Scaling Limitation](#deployment--known-scaling-limitation)
4. [Feature Phases at a Glance](#feature-phases-at-a-glance)
5. [Phase 1 — Must Have](#phase-1--must-have)
6. [Phase 2 — Should Have](#phase-2--should-have)
7. [Phase 3 — Could Have](#phase-3--could-have)
8. [Won't Build](#wont-build)
9. [Database Schema](#database-schema)
10. [Real-Time / WebSocket Design](#real-time--websocket-design)
11. [Notifications Design](#notifications-design)
12. [Open Decisions](#open-decisions)
13. [Testing & Access-Control Requirements](#testing--access-control-requirements)

---

## Access Model

**Who can use Mastermind:** authenticated users who have **any team role** OR **any
subscription tier**. Authenticated users with *no role and no subscription* are blocked.
Unauthenticated users are blocked.

| Caller | Access |
|---|---|
| Unauthenticated | ✗ (401) |
| Authenticated, no role, no subscription | ✗ (403) |
| Subscriber: basic / pro / premium | ✓ |
| Team role: member / relationship-manager / admin / owner | ✓ |

**Implementation — reuse existing middleware, no new primitive:**

```ts
// Gate every Mastermind read/write route with this chain.
const requireMastermind = requireSub(["basic", "pro", "premium"], {
  bypassRoles: ["admin", "owner", "relationship-manager", "member"],
});
```

This is identical in meaning to the frontend `canAccessApp` flag (`useAuth()` → true if any
tier OR any team role), so the client gate is `canAccessApp` and the server gate is the chain
above. They must agree. See `.claude/docs/access-control.md` (the authoritative source — its
tables must be updated *before* the routes are written).

**Within Mastermind, privilege tiers:**

| Action | Member/subscriber | Admin / Owner |
|---|---|---|
| Read channels, send messages | ✓ | ✓ |
| Edit / delete **own** message | ✓ | ✓ |
| Delete **any** message | ✗ | ✓ |
| Edit **another user's** message | ✗ | ✗ (by design — never alter what someone said) |
| Create / rename / archive channels | ✗ | ✓ |
| Pin / unpin a message | ✓ (any member) *(open decision)* | ✓ |

> **Design principle (explicit):** admins/owners may **delete** any message but may **never
> edit** another person's message. If the content is objectionable, remove it — don't rewrite it.

---

## Architecture Overview

**Pattern: REST for the read/write lifecycle + WebSocket purely for live fan-out.** This is the
right call and keeps everything on the stack we already run.

- **Writes go over REST.** `POST /api/messages` authenticates via the existing Passport
  session, persists through Drizzle, then the server broadcasts the new message over WebSocket
  to everyone connected to that channel. Same for edits/deletes/reactions (REST mutation →
  broadcast).
- **History loads over REST.** Opening a channel does a paginated `GET` (infinite scroll). The
  WebSocket only carries *new* events from that point forward.
- **TanStack Query is the source of truth.** A WS event doesn't hold UI state — it triggers a
  cache update/invalidation for the relevant query. The message list re-renders from the cache.
- **No messages are ever lost.** Messages live in Postgres; the socket is just a notifier. On
  reconnect the client calls a "give me everything since message X / timestamp T" backfill
  endpoint, so a dropped socket causes at most a momentary gap, never data loss.

**Why WebSocket and not polling (resolved):** polling the DB on a 2–3s interval to feel
"instant" means every open tab queries Postgres continuously whether or not anything changed —
tens of thousands of wasted queries per hour at modest user counts, and it still feels laggy. A
WebSocket pushes only when a message actually exists: ~zero idle traffic, genuinely instant.
WebSocket is the decision.

**What we reuse (keeps Phase 1 small):**

| Need | Reuse |
|---|---|
| Rich text + formatting (bold/italic/code/links) | TipTap editor + HTML render from Vendors `PostComposer`/`PostCard` |
| `@mention` / `#mention` autocomplete + parsing | The vendor/category mention extraction in `posts.services.ts` |
| Image upload + inline render + lightbox | Supabase Storage flow + `ImageLightbox` from vendor posts |
| Transactional email | Postmark (`deals.services.ts` patterns, templates) |
| Auth / session / role / sub gating | `requireAuth`, `requireRole`, `requireSub`, `useAuth()` |
| Mobile two-panel tab layout | Vendors' Browse/Activity tab pattern |

**WebSocket library:** `ws`, attached to the existing Express HTTP server (same port).
Session-cookie auth on the upgrade request. Heartbeat ping every ~30s to reap dead connections.

---

## Deployment & Known Scaling Limitation

**Phase 1 decision: Replit Reserved VM (always-on).** We stay on Replit so we don't take on a
migration mid-build. A Reserved VM is a config change (not an architecture change) and keeps
long-lived WebSocket connections alive — unlike Replit *Autoscale*, which spins containers down
and kills every open socket.

> ### ⚠️ KNOWN LIMITATION — must be solved before scale
>
> Today the **entire system runs on a single Replit server**: the SFR data pipeline cron, all
> three existing apps' APIs, and (in Phase 1) the Mastermind WebSocket layer. A single
> always-on container is fine at ~150–500 concurrent users, but it is a real ceiling and a
> single point of failure. WebSocket connections are memory-resident and long-lived; the
> data-pipeline cron competes with them for the same CPU/memory. **This will not scale as-is and
> must be addressed.** Candidate solutions, in rough order of preference:
>
> 1. **Move the SFR data pipeline off Replit to lighten the app server.** The pipeline is a
>    batch cron with no WebSocket needs — it's the cleanest thing to peel off. Running it on its
>    own worker (AWS — e.g. a scheduled ECS/Fargate task or Lambda — or another always-on
>    worker) frees the app/WS server's CPU/memory and removes cron/socket contention. **Strong
>    first move; low risk.**
> 2. **Split the WebSocket server out to its own service.** A thin (~100-line) Node `ws` app
>    that authenticates connections and fans out messages, with the main API staying on Replit.
>    Hosting preference, given services we already use: **AWS** (ECS Fargate / a small
>    always-on task) or **Supabase** if we adopt **Supabase Realtime** (Postgres-backed
>    realtime channels — could replace a hand-rolled `ws` layer entirely and we already use
>    Supabase Storage). **Railway** is a viable lighter-weight alternative noted in earlier
>    drafts but is a new vendor.
> 3. **Add Redis (Upstash/ElastiCache) for pub/sub + presence + unread caching** once we run
>    more than one server instance. Required the moment horizontal scaling is on the table; not
>    needed for a single Reserved VM.
>
> **Action:** revisit before we cross ~500 concurrent connections or before the pipeline + WS
> contention shows up in latency. Track as a dedicated infra ticket.

---

## Feature Phases at a Glance

Phases are **priority buckets**, not time estimates: **Must Have** (ship the core community),
**Should Have** (high-value, soon after), **Could Have** (nice-to-have / polish).

### Phase 1 — MUST HAVE

| Feature | Notes |
|---|---|
| Public channels | Admin-created; every eligible user auto-joined to all |
| Real-time delivery | WebSocket fan-out + reconnect backfill |
| Message history & persistence | Postgres, soft-delete only (nothing hard-deleted) |
| Unread indicators & badges | Per-channel unread counts + mention highlight |
| Message edit / delete | Own edit+delete; admin/owner delete any (never edit others') |
| File / image sharing | Upload + **inline image render**; docs = **download link** (viewer is later) |
| Clickable links | Links are clickable text (part of formatting) |
| @mentions (user) + `@here` / `@channel` | Notify a user or the whole channel |
| In-app notifications | Bell icon, notification feed, deep-link to the message |
| Message timestamps | `created_at` on every message |
| Emoji reactions | **Fixed set** (👍 👎 😀 😢 😂 ❤️) — no custom emoji |
| Pin message | One pin per channel at a time |
| Email notifications | On mention / `@here` / `@channel`, **rate-limited ≤3/day per user** |
| Message formatting | Reuse TipTap (bold, italic, code, links) |
| Channel archive | Delete → archive first; delete-again from archive (safety net) |

### Phase 2 — SHOULD HAVE

| Feature | Notes |
|---|---|
| Direct messages (1:1) | Private conversation between two users |
| Group DMs | Private conversation, 3+ users |
| Threads / replies | `parent_message_id` already in schema |
| Message search | Postgres `tsvector` full-text (no Elasticsearch at this scale) |
| User profiles in chat | Click a username → profile; depends on building public profiles |
| Link preview cards (unfurling) | **Moved here from Phase 1** — see Open Decisions (SSRF/caching cost) |
| Per-channel notification level / mute | all / mentions-only / muted (`is_muted` already in schema) |
| Moderation: remove / mute a user in a channel | Beyond message deletion |

### Phase 3 — COULD HAVE

| Feature | Notes |
|---|---|
| Typing indicators | "User is typing…" |
| Online / offline presence | Green/gray dots; low value at this scale |
| Custom status | "In a meeting", etc. |
| Private channels | Invite-only |
| Scheduled messages | Write now, send later |
| Reminders | "Remind me in 2 hours" |
| Clips (audio/video messages) | Record/send short clips — useful for property walkthroughs |
| In-app document viewer | Embedded PDF/doc preview (else download stays the answer) |
| User groups | `@investors`, `@agents` bulk mentions |
| Message bookmarks | Save messages for later |
| Do Not Disturb / pause notifications | Time-boxed mute (per-user notif toggle already exists) |
| Report a message | User-flag a message for admin review |
| Data export & compliance | Export all messages |
| Guest accounts | Limited, time-boxed trial access |
| Retention policies | Auto-archive/delete old messages (storage control, long-term) |

### Won't Build

Shared channels (cross-org) · Slack Connect · custom emoji · Workflow Builder · app
integrations / bots · Huddles (real-time voice/video) · Canvas (collaborative docs).

---

## Phase 1 — Must Have

Broken into **developable parts**. Each part is a self-contained unit with a clear done-state;
build roughly in order (later parts depend on earlier ones). Per `CLAUDE.md`: after any code
change run `npm run check`, then the `code-optimizer` agent, and the agent-updater for
DB/API changes.

### Part 1 — Schema & migrations | Completed
Create Drizzle schemas + indexes for: `channels`, `channel_members`, `messages`,
`message_attachments`, `message_reactions`, `message_mentions`, `pinned_messages`,
`notifications`. (Full definitions in [Database Schema](#database-schema).) Seed the initial
channels (`#general`, `#first-time-flippers`, `#san-diego-market`, …). Add Zod insert/validation
schemas in `/database`. **Done:** `npm run db:push` succeeds; tables + indexes exist.

### Part 2 — Access gate, channel routes, auto-join | Completed
- Wire `requireMastermind` (the `requireSub` chain above) onto a new `messages.routes.ts` /
  `channels.routes.ts`.
- Channel CRUD: `GET /api/channels` (list channels the caller is in), admin-only
  `POST/PATCH/POST :id/archive`. Archive is a soft flag; a second delete from the archive view
  hard-deletes (cascade).
- **Auto-join:** every eligible user is a member of every public channel. Implement as: on
  channel create, backfill `channel_members` for all eligible users **or** treat public-channel
  membership as implicit and only write a `channel_members` row lazily on first read (to carry
  `last_read_at`). *(Open decision — see below.)*
- Update `access-control.md` tables **first**, then write routes + access-control tests.
**Done:** an eligible user lists channels; a no-role/no-sub user gets 403; unauth gets 401.

### Part 3 — Message REST lifecycle | Completed
- `GET /api/channels/:id/messages?cursor=&limit=` — paginated history (newest-first, cursor on
  `created_at` / `id`).
- `GET /api/channels/:id/messages?since=<id|ts>` — reconnect backfill.
- `POST /api/channels/:id/messages` — create (validates membership + content length, rate-limit).
- `PATCH /api/messages/:id` — author-only edit (sets `is_edited`).
- `DELETE /api/messages/:id` — author OR admin/owner; **soft delete** (`is_deleted=true`,
  content blanked, "message deleted" tombstone). Never hard-delete.
- Anti-spam: per-user post rate limit (e.g. burst cap) in the controller/service.
**Done:** full CRUD with role rules enforced + tested; nothing is ever hard-deleted.

### Part 4 — WebSocket layer | Completed
- Attach `ws` to the existing Express HTTP server. Authenticate the upgrade via the session
  cookie; reject if not `canAccessApp`-eligible. Heartbeat ping ~30s.
- Server broadcasts `message.created` / `message.updated` / `message.deleted` /
  `reaction.changed` / `message.pinned` to clients subscribed to that channel.
- Client hook `useChannelSocket(channelId)` updates the TanStack Query cache on each event;
  reconnect runs the `since=` backfill.
**Done:** two browsers in the same channel see each other's messages instantly; killing/restoring
the socket backfills with no lost messages.

### Part 5 — Frontend shell | Completed
- Page `client/src/pages/Mastermind.tsx` in the shared provider tree; nav entry gated on
  `canAccessApp`.
- Layout: channel sidebar (list + unread badges) · message list (infinite scroll) · composer.
- Composer reuses the TipTap stack; messages render formatted HTML (reuse `PostCard` render).
- Mobile: sidebar/messages tab-switch (mirror Vendors' Browse/Activity pattern).
- **URL-based channel routing:** the open channel lives in the URL as a path param —
  `/mastermind/:channelName` (keyed on the unique channel **name** slug, not the id), with both
  `/mastermind` and `/mastermind/:channelName` rendering the same page (Wouter, not file-based).
  Channel links are shareable and browser back/forward works. A bare `/mastermind` or an
  unknown/archived name redirects to the first channel. Notification deep-links are
  `/mastermind/<name>?m=<messageId>` (channel in the path, highlight target as the only query
  param, stripped after it fires).
**Done:** a member can open `/mastermind`, pick a channel, send a formatted message, and scroll
history on desktop + mobile.

### Part 6 — Mentions (`@user`, `@here`, `@channel`) | Completed
- Autocomplete in the composer (reuse vendor mention machinery): `@` → user list (channel
  members), plus literal `@here` / `@channel`.
- On send, parse mentions out of the TipTap HTML → write `message_mentions` rows
  (`@here`/`@channel` expand to all channel members at notify time, not stored per-user).
- Render mention chips as clickable.
**Done:** mentioning a user records a mention; `@channel` targets everyone in the channel.

### Part 7 — Unread indicators & badges | Completed
- Track `channel_members.last_read_at` / `last_read_message_id`; advance it when a user views a
  channel (debounced).
- Sidebar shows per-channel unread count; a **mention** in an unread channel gets a stronger
  highlight (red dot) vs. plain unread (bold).
- Unread count = messages in channel newer than `last_read_*`.
**Done:** unread badges appear/clear correctly across tabs and reconnects.
**Live cross-channel sync (resolved):** a client subscribes over WS to only the channel it's
viewing, so `message.created` (a `broadcastToChannel` firehose) never reaches a user looking at a
different channel — the original bug where unread badges didn't move until a refresh. Fixed by a
per-user **activity doorbell**: on message create the controller also fans out a lightweight
`channel.activity` event via `broadcastToOtherUsers` (every eligible connected user except the
sender; admin-only channels scoped to admins/owners). It carries only `channelId` +
mention flags — never the body — and `Mastermind.tsx` uses it to bump the sidebar unread badge
for any non-active channel live, with no refresh.

### Part 8 — In-app notifications (bell) | Completed
- `notifications` table rows created when a user is mentioned (or `@here`/`@channel` hits them).
- `GET /api/notifications` (feed, unread count), `PATCH /api/notifications/:id/read`,
  `PATCH /api/notifications/read-all`.
- Bell icon in the header with unread count; clicking a notification **deep-links** to the exact
  channel + message (scroll-to + highlight).
- New notifications also arrive over the WebSocket for instant badge updates.
**Done:** getting mentioned lights the bell; clicking it jumps to the message.
**Notes:** `@channel` fans out to **all eligible users** (minus the sender). Deep-link is
**graceful**: the message is scrolled-to + highlighted only when it's within the loaded page
(newest ~30); older targets just open the channel (full jump-to-any waits on pagination).
Bell lives in the global header, gated on `canAccessApp`, so mentions surface on every page.

### Part 9 — Reactions, pins, attachments | Completed
- **Reactions:** fixed emoji set (👍 👎 😀 😢 😂 ✅); `POST/DELETE /api/messages/:id/reactions`;
  reaction counts render as pills under the message; changes broadcast over WS as a per-user
  `reaction.changed` delta so each client computes its own `reactedByMe`. (`UNIQUE(message_id,user_id,emoji)`.)
- **Pin:** **admin/owner only** (decided) set/replace **one** message per channel via
  `POST /api/channels/:id/pin`; `DELETE /api/channels/:id/pin` to unpin; `GET /api/channels/:id/pin`
  for the header bar (shows who pinned it). Broadcast `message.pinned` on change.
- **Attachments:** upload-first flow — `POST /api/mastermind/attachments` (multipart) uploads to
  Supabase Storage and returns metadata; the metadata is sent back on `POST .../messages` (re-validated
  against our bucket URL prefix). Images render inline + lightbox (reuse vendor `ImageLightbox`);
  docs show a **download link**. Allowed types: JPEG, PNG, PDF, CSV, TXT (must match the Supabase
  bucket config). Limits: **10 MB/file, 5/message**.
**Done:** members react, admins pin (who-pinned shown), images render inline, docs download.
**Notes:** message wire now carries `attachments[]` + `reactions[]`; the read pipeline hydrates
both in two batched queries (no N+1). Edits/deletes merge field-wise on the client so live
reaction/attachment state survives a `message.updated`. Soft-delete also drops the message's
attachment storage objects, reaction rows, and pin. The per-message hover toolbar (react · pin ·
edit · delete) was added here (edit/delete connect the Part 3 routes that previously had no UI).

### Part 10 — Link previews (unfurling) | Completed
- **What:** any `<a href>` in a message's sanitized HTML gets a Slack-style preview card (image +
  publisher/favicon + title + description), capped at **2 per message** (`MAX_LINK_PREVIEWS_PER_MESSAGE`).
- **Provider:** **Microlink** metadata API (`server/lib/microlink.ts` — the only place the provider
  is named; swapping is a one-file change). Optional `MICROLINK_API_KEY` env var (free public
  endpoint works without it). Microlink fetches the target URL on its infra, so server-side SSRF is
  out of scope; `image`/`logo` URLs are still scheme-validated before storage.
- **Cache:** `link_previews` table, keyed by **normalized** URL (lowercase host, no #fragment, query
  kept), write-once and kept forever. `getOrFetchPreview` is **cache-first** — it hits Microlink only
  on a never-before-seen URL, so a request is spent per unique URL, never per user or per view. The
  rare simultaneous-first-paste race is absorbed by `UNIQUE(url)` + `onConflictDoNothing`.
- **Flow:** send is never blocked — `createMessage`/`updateMessage` broadcast immediately, then a
  fire-and-forget `unfurlMessageLinks` (controller) ensures the previews are cached and re-broadcasts
  `message.updated` **only if** a new preview was actually fetched. `hydrateMessages` attaches
  previews to each message by matching its anchor URLs against the cache (one batched query).
**Notes:** message wire now also carries `linkPreviews[]`. No per-message join table — edits add or
drop previews implicitly via the message's anchors, so no reconciliation is needed.

---

## Phase 2 — Should Have

High-value once the core community is live. Schema already anticipates most of this
(`type` enum on `channels` covers DMs/group DMs; `parent_message_id` covers threads).

- **DMs / Group DMs** — `channels.type` `dm` / `group_dm`; a DM is a channel with 2 members, a
  group DM 3+. Reuse the entire message pipeline; add a DM-creation flow + DM list in the sidebar.
  **1:1 DMs are specced + in progress — see Part 2 below. Group DMs remain deferred.**
- **Threads / replies** — reply to a message via `parent_message_id`; thread panel UI; thread
  reply counts; notify thread participants.
- **Message search** — Postgres `tsvector` GIN index on `messages.content`; scoped to channels
  the caller can see.
- **User profiles in chat** — click a username → profile card/page. Gated on building
  publicly-visible user profiles (doesn't exist yet — a prerequisite project).
- **Link preview cards (unfurling)** — server-side fetch of OpenGraph tags with SSRF guards,
  timeouts, and a cache table. Render a preview card under messages containing a URL. *(Moved
  here from Phase 1 — see Open Decisions.)*
- **Per-channel notification level / mute** — all / mentions-only / muted per channel
  (`channel_members.is_muted` + a level column). Pairs with the email rate limit.
- **Moderation** — admin/owner can remove or mute a specific user within a channel (beyond
  deleting individual messages).
  

### Part 1 — Email notifications (rate-limited)
- When a user is mentioned (`@user` / `@here` / `@channel`) and isn't actively viewing, queue an
  email via Postmark (new template, e.g. `mastermind-mention`) with deep link back to the message.
- **Rate limit: ≤3 Mastermind emails per user per day.** Beyond the cap, suppress further emails
  that day (in-app notifications still accrue); optionally fold the rest into a future digest.
- Respect the existing per-user notification toggle; honor a Mastermind-specific opt-out.
**Done:** a mention emails the user (with deep link), capped at 3/day, never spams `@channel`.

### Part 2 — Direct Messages (1:1) | In progress

Private 1:1 conversations between two users, reusing the entire message pipeline. **Group DMs are
explicitly out of scope for this part** (the `group_dm` channel type stays reserved for later).

**Decisions (resolved with the product owner):**
1. **Creation is lazy** — clicking "Send message" opens an empty composer; the conversation row
   and both sidebar entries persist only when the **first message is sent**. The recipient sees the
   conversation only once a real message exists. No ghost/empty conversations.
2. **Audience is any Mastermind-eligible user**, discoverable three ways: the per-message hover
   toolbar (a new message icon, on **channel** messages only), the user profile/mention card, and a
   dedicated **"New message"** button + user search in the DM section of the sidebar.
3. **Notify on every DM, but suppress when the recipient has that conversation open** (i.e. is
   currently subscribed to the DM channel over the socket — they'll see it live). Bell only; **no
   email** for DMs.
4. **DMs are fully private** — admins/owners have **no** read/list/delete access. Delete is
   **author-only** in a DM; the "admin can delete any message" power never reaches a DM.

**Data model (no new tables):** a DM is a `channels` row with `type='dm'` and exactly two
`channel_members` rows. The channel `name` is a deterministic, sorted pair `dm:<lo>:<hi>` of the
two user ids, so the existing `UNIQUE(channels.name)` enforces "exactly one conversation per pair"
and get-or-create is race-safe. The synthetic name is never shown to users (the UI keys off the
counterparty and routes by their id). `notification_type` gains `direct_message` (applied as a
targeted `ALTER TYPE … ADD VALUE`, per the db:push drift note — see `scripts/add-dm-notification-enum.ts`).

**Routing:** `/mastermind/dm/:userId` — keyed on the **counterparty's** user id (clean, stable,
doesn't leak the synthetic name). A bare/unknown id behaves like an unknown channel.

**Backend (`server/services/dms/dms.services.ts`):**
- `getOrCreateDmChannel(callerId, otherUserId)` — validates both are eligible + distinct; upserts the
  `dm:` channel + both member rows; idempotent. Used lazily on first send.
- `assertDmMembership(channelId, userId)` — the single guard the message/reaction/read paths reuse;
  returns the counterparty id, 404s a non-member (existence never disclosed).
- `listDirectMessages(userId)` — the sidebar list: counterparty profile + unread + last-activity,
  newest-first, conversations with no surviving messages omitted.
- **No mentions in a DM:** `createMessage`/`updateMessage` skip mention parsing/persistence and the
  `@announcement` gate when the channel is a DM.

**Routes (gated by `requireMastermind`; tables in `access-control.md` §5.15):**
- `GET /api/dms` — the sidebar list.
- `POST /api/dms/:userId/messages` — create-or-get the DM channel, then send (the lazy-create entry).
- `GET /api/dms/:userId/messages?cursor=` — history (delegates to the existing list logic).
- Edit/delete/react reuse the existing `/api/messages/:id*` routes — now membership-guarded.
- Read-state reuses `PATCH /api/channels/:id/read` — now DM-aware.

**Security hardening (mandatory):** the message-id-scoped routes (`PATCH`/`DELETE /api/messages/:id`,
reactions) are not channel-scoped, so each now resolves the message's channel and, when it is a DM,
calls `assertDmMembership` — a non-member 404s, and admin delete-any is disabled for DMs.

**Real-time & notifications:** DM messages broadcast over the **same** `message.created/updated/
deleted` + `reaction.changed` events (subscribed by `channelId`). The cross-channel activity
doorbell and the bell are scoped to the single counterparty (never the all-eligible firehose). A
`direct_message` notification is created for the recipient **unless** they are currently subscribed
to that DM channel; clicking it deep-links to `/mastermind/dm/:actorId`.

**Frontend:** DM list in `ChannelSidebar` (replaces the "Coming soon" stub) + "New message" picker;
a message icon in `MessageActions` (channel messages only); a "Send message" action on the profile
card; `ChannelHeader` renders the counterparty's avatar + name in DM mode; `MessageComposer`
placeholder `Message {FirstName}…` with mentions disabled; `Mastermind.tsx` handles the
`/mastermind/dm/:userId` route + the lazy draft-DM view.

**Done:** two eligible users can open a private conversation from any of the three entry points;
messages, reactions, edits, deletes, and attachments work live; the recipient gets a bell
notification (suppressed while they're viewing it); no admin can read or delete a DM; no `@mentions`
function in a DM.

> **Build status:** schema/enum + backend services + the message-pipeline DM-awareness and security
> guards are built. Remaining: DM controllers + `dms.routes.ts`, the WS `subscribe` gate for DM
> members, the doorbell/notification wiring (suppress-when-viewing), and all frontend.

---

## Phase 3 — Could Have

Polish and power features; build only as demand appears.

- **Typing indicators** — ephemeral WS events, no persistence.
- **Online/offline presence** — in-memory (or Redis once multi-instance) presence map; green/gray
  dots. Low value at this scale.
- **Custom status** — "In a meeting", "On vacation".
- **Private channels** — invite-only; `channels.type = 'private'` + membership gating.
- **Scheduled messages** — compose now, deliver later (cron/queue).
- **Reminders** — "remind me about this message in N hours."
- **Clips (audio/video messages)** — record + send short clips; genuinely useful for real-estate
  walkthroughs. Storage via Supabase/S3.
- **In-app document viewer** — embedded PDF/doc preview (otherwise download remains the answer).
- **User groups** — named groups (`@investors`, `@agents`) for bulk mentions.
- **Message bookmarks** — personal saved-messages list.
- **Do Not Disturb** — time-boxed notification pause (builds on the existing per-user toggle).
- **Report a message** — user flags a message → admin review queue.
- **Data export & compliance** — export all messages.
- **Guest accounts** — limited, time-boxed access (useful for trials into the mastermind).
- **Retention policies** — auto-archive/delete old messages once storage/volume warrants it.

---

## Won't Build

Out of scope for this product at any planned phase: **shared channels** (cross-org),
**Slack Connect**, **custom emoji**, **Workflow Builder**, **app integrations / bots**,
**Huddles** (real-time voice/video), **Canvas** (collaborative docs).

---

## Database Schema

Phase 1 uses `channels` (public only), `channel_members`, `messages`, `message_attachments`,
`message_reactions`, `message_mentions`, `pinned_messages`, `link_previews`, `notifications`.
Phase 2+ adds the `dm`/`group_dm`/`private` channel types, `parent_message_id` threads, and the
search index. Follow `/database` conventions (Drizzle schema + Zod inserts + types).

```
channels
├── id (uuid, PK)
├── name (text, unique)              ← e.g. "san-diego-market"
├── description (text, nullable)     ← channel topic
├── type (enum: 'public','private','dm','group_dm')   ← Phase 1 only 'public'
├── created_by (uuid, FK → users.id)
├── is_archived (boolean, default false)   ← archive safety-net
├── is_admin_only (boolean, default false) ← admin/owner-only visibility (service-enforced)
├── created_at (timestamp)
└── updated_at (timestamp)

channel_members
├── id (uuid, PK)
├── channel_id (uuid, FK → channels.id)
├── user_id (uuid, FK → users.id)
├── role (enum: 'owner','admin','member')   ← channel-scoped role
├── last_read_at (timestamp)            ← unread calculation
├── last_read_message_id (uuid, nullable)
├── is_muted (boolean, default false)   ← Phase 2 notification level
├── joined_at (timestamp)
└── UNIQUE(channel_id, user_id)

messages
├── id (uuid, PK)
├── channel_id (uuid, FK → channels.id)
├── sender_id (uuid, FK → users.id)
├── parent_message_id (uuid, nullable, FK → messages.id)  ← Phase 2 threads
├── content (text)                     ← TipTap HTML
├── is_edited (boolean, default false)
├── is_deleted (boolean, default false) ← SOFT delete only; never hard-delete
├── created_at (timestamp)
└── updated_at (timestamp)

message_attachments
├── id (uuid, PK)
├── message_id (uuid, FK → messages.id)
├── file_url (text)                    ← Supabase Storage URL
├── file_name (text)
├── file_type (text)                   ← image/* render inline; others = download
├── file_size_bytes (integer)
└── created_at (timestamp)

message_reactions
├── id (uuid, PK)
├── message_id (uuid, FK → messages.id)
├── user_id (uuid, FK → users.id)
├── emoji (text)                       ← from the fixed set
├── created_at (timestamp)
└── UNIQUE(message_id, user_id, emoji)

message_mentions
├── id (uuid, PK)
├── message_id (uuid, FK → messages.id)
├── mentioned_user_id (uuid, FK → users.id)   ← @here/@channel expanded at notify time
├── created_at (timestamp)
└── UNIQUE(message_id, mentioned_user_id)

pinned_messages
├── id (uuid, PK)
├── message_id (uuid, FK → messages.id)
├── channel_id (uuid, FK → channels.id)   ← UNIQUE(channel_id): one pin per channel
├── pinned_by (uuid, FK → users.id)
└── pinned_at (timestamp)

link_previews                             ← global URL→metadata cache, write-once, kept forever
├── id (uuid, PK)
├── url (text, UNIQUE)                    ← normalized: lowercase host, no #fragment
├── title (text, nullable)
├── description (text, nullable)
├── image (text, nullable)               ← og:image URL (remote)
├── logo (text, nullable)                ← favicon URL (remote)
├── publisher (text, nullable)           ← site name, e.g. "YouTube"
└── fetched_at (timestamp)
    NOTE: no per-message FK — messages reference previews implicitly via <a href> anchors in
    their sanitized HTML, so editing a message to add/remove a link needs no reconciliation.

notifications
├── id (uuid, PK)
├── user_id (uuid, FK → users.id)      ← recipient
├── type (enum: 'mention','channel_mention','announcement','deal_bid','direct_message')
├── channel_id (uuid, FK → channels.id)
├── message_id (uuid, FK → messages.id)   ← deep-link target
├── actor_id (uuid, FK → users.id)     ← who triggered it
├── is_read (boolean, default false)
├── emailed_at (timestamp, nullable)   ← supports the ≤3/day email cap
└── created_at (timestamp)
```

**Indexes (critical):**
- `messages(channel_id, created_at DESC)` — history pagination + backfill
- `messages(parent_message_id)` — thread loading (Phase 2)
- `channel_members(user_id)` — "which channels am I in?"
- `message_mentions(mentioned_user_id, created_at DESC)` — mention feed
- `notifications(user_id, is_read, created_at DESC)` — bell feed + unread count
- (Phase 2) GIN `tsvector` on `messages.content` — full-text search

At ~150 users and a few thousand messages/day, Neon handles this trivially — no partitioning or
read replicas needed for years.

---

## Real-Time / WebSocket Design

- **Connection:** one WS per browser tab to the Express server; authenticated on the HTTP
  upgrade by validating the session cookie and confirming `canAccessApp` eligibility.
- **Subscription model:** client tells the server which channel(s) it's viewing; server tracks
  `connection → channelId` and fans out only relevant events. (Single instance keeps this in
  memory; multi-instance later needs Redis pub/sub — see Known Limitation.)
- **Event types:** `message.created`, `message.updated`, `message.deleted`,
  `reaction.changed`, `message.pinned`, `notification.created`, `channel.activity` (cross-channel
  unread doorbell — per-user, body-less), (Phase 3) `typing`, `presence`.
- **Delivery guarantee:** REST write → DB commit → broadcast. If the server dies between commit
  and broadcast, the client's reconnect backfill (`GET …?since=`) recovers the gap. The DB is
  always the source of truth; the socket is a notifier.
- **Heartbeat:** ping every ~30s; a connection that misses pongs is closed and cleaned up.
- **Client integration:** WS events mutate the TanStack Query cache (optimistic insert on the
  sender's own send; cache update on others' events) — components render from the cache, not
  from socket state.

---

## Notifications Design

**In-app (bell):**
- A `notifications` row is created when a user is mentioned (`@user`) or covered by
  `@here`/`@channel`.
- The bell shows an unread count; the feed lists recent notifications; clicking one deep-links
  to the channel + message (scroll-to + highlight).
- New notifications push over the WebSocket so the badge updates instantly.

**Email (Postmark) — rate-limited:**
- Triggered by the same mention events when the user isn't actively viewing.
- **Hard cap: ≤3 Mastermind emails per user per day** (tracked via `notifications.emailed_at`
  counts or a small per-user daily counter). Past the cap, stop emailing for the day; in-app
  notifications keep accruing. A daily digest is a future option to carry the overflow.
- New Postmark template (e.g. `mastermind-mention`) with the message excerpt + deep link.
- Respects the existing per-user notification toggle plus a Mastermind-specific opt-out.
- `@channel`/`@here` must respect the per-user cap so a single broadcast can't email everyone
  repeatedly.

---

## Open Decisions

These are the items still worth an explicit call before/while building. Recommendations given.

1. **Link preview cards — Phase 1 or Phase 2?** *Recommendation: Phase 2.* Posting a
   **clickable link** is Phase 1 (it's just formatting). The **preview card** requires
   server-side unfurling (fetch the page, parse OpenGraph) with SSRF protection, timeouts, and
   caching — real work that isn't part of the core loop. Slotted to Phase 2 above; move it up if
   you want it at launch.

2. **Can regular members pin, or admins only?** You said pin is "easy" and "one per channel."
   *Recommendation: allow any member to set/replace the single channel pin in Phase 1* (cheap,
   collaborative), with admins able to override. Tighten to admin-only if pin-fighting becomes a
   problem. (Schema supports either — it's a permission check.)

3. **Auto-join: eager backfill vs. implicit membership.** With "auto-join all public channels,"
   either (a) write a `channel_members` row for every eligible user when a channel is created
   (and when a new user becomes eligible), or (b) treat public membership as implicit and only
   write a row lazily on first visit to carry `last_read_*`. *Recommendation: (b) lazy* — avoids
   fan-out writes and a backfill job every time someone subscribes; you only persist read-state
   for channels a user has actually opened.

4. **Document viewing.** Confirmed: Phase 1 = upload + **download link** for non-images (images
   render inline via the existing lightbox). An embedded in-app document viewer stays Phase 3.

5. **Notification scope in Phase 1.** Recommendation: Phase 1 in-app/email notifications fire
   **only** for mentions (`@user`/`@here`/`@channel`). Reactions-to-your-message, thread replies,
   etc. come with their features in Phase 2+. Keeps the Phase 1 notification surface small.

---

## Testing & Access-Control Requirements

Per `CLAUDE.md` and `.claude/docs/testing.md`, for every new route:

1. **Update `access-control.md` first** — add a Mastermind section with a permission table for
   each new route (the `requireMastermind` chain: 401 unauth, 403 no-role/no-sub, ✓ otherwise;
   plus admin-only channel-management and any-vs-author message mutations).
2. **Mandatory access-control integration tests** per route: one allowed role/tier → 2xx; the
   boundary blocked case (authenticated, no role + no sub) → 403; unauthenticated → 401; for
   ownership routes (edit/delete message), a non-author authenticated user → 403; for the
   `requireSub` bypass, a bypass-role user with no subscription → 2xx.
3. **Validation tests** for message/channel insert Zod schemas (content length, required fields,
   attachment type/size, emoji from the fixed set).
4. After any code change: `npm run check`, then the **code-optimizer** agent, and the
   **agent-updater** for DB/API changes (so `api.md`, `access-control.md`, and `apps.md` stay
   current — Mastermind should be added to `apps.md` as the 4th app).

---

## Summary

Mastermind is the live, members-only community layer of ARV — built on the stack we already
run, reusing TipTap, Supabase Storage, Postmark, and the existing auth/role/subscription
middleware. **Phase 1 (Must Have)** delivers the full real-time core: public channels,
WebSocket delivery, history, edits/deletes with the "delete-not-edit-others" rule, files/images,
mentions, in-app + rate-limited email notifications, reactions, pins, unread badges, and the
archive safety-net. **Phase 2 (Should Have)** adds DMs, threads, search, link previews, and
moderation. **Phase 3 (Could Have)** is presence/typing, private channels, clips, and other
polish. The one thing to keep on the radar from day one is the **single-Replit-server
limitation** — the first move when it bites is to lift the SFR data pipeline off the app server.
