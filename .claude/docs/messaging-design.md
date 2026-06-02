# Feature Design: Slack-Like Messaging App

**Application:** SFR Property Intelligence Platform
**Tech Stack:** React 18 + Vite + Wouter + TanStack Query / Express + Passport + Drizzle ORM / PostgreSQL (Neon) / Replit Deployment
**Current Users:** ~150 | Target: 1K–5K | Max Design Ceiling: 10K
**Date:** June 2, 2026

---

## Table of Contents

1. [Complete Slack Feature Inventory](#complete-slack-feature-inventory)
2. [Approach A: Minimal Viable (500 Users, 3–6 Month Horizon)](#approach-a-minimal-viable-messaging)
3. [Approach B: Solid Mid-Tier (1K–5K Users, 12-Month Horizon)](#approach-b-solid-mid-tier-messaging)
4. [Approach C: Future-Proofed (5K–10K, 2–3 Year Horizon)](#approach-c-future-proofed-messaging)
5. [Deployment & WebSocket Considerations](#deployment--websocket-considerations)
6. [Database Schema](#database-schema)
7. [Timelines](#timelines)
8. [Recommendation](#recommendation)

---

## Complete Slack Feature Inventory

Before choosing what to build, here's a full accounting of everything Slack does so you can cherry-pick. I've grouped them into tiers based on what matters for your use case.

### Tier 1 — Core (You Almost Certainly Need These)

| Feature | What It Does | Complexity |
|---|---|---|
| Channels (public) | Shared topic-based conversations anyone can join | Medium |
| Direct Messages (1:1) | Private conversation between two users | Medium |
| Group DMs | Private conversation among 3+ users | Medium |
| Real-time message delivery | Messages appear instantly without refresh | High |
| Message history & persistence | All messages stored, scrollable, searchable | Low |
| Unread indicators & badges | Show which channels have new messages, unread counts | Medium |
| Typing indicators | "User is typing..." display | Low |
| Online/offline presence | Green/yellow/gray dots showing user status | Low–Medium |
| Message editing & deletion | Author can edit or delete their own messages | Low |
| File/image sharing | Upload and share files within a conversation | Medium |
| @mentions (user) | Notify a specific user in a message | Low |
| Notifications (in-app) | Bell icon, toast, unread count | Medium |
| Message timestamps | When each message was sent | Trivial |

### Tier 2 — Nice to Have (Improves Experience Significantly)

| Feature | What It Does | Complexity |
|---|---|---|
| Threads / replies | Reply to a specific message without cluttering the channel | Medium–High |
| Emoji reactions | React to messages with emoji (👍, ❤️, etc.) | Low |
| Channel topics/descriptions | Set a description for what a channel is about | Trivial |
| Pin messages | Pin important messages to the top of a channel | Low |
| Search (messages) | Full-text search across all messages | Medium |
| @channel / @here | Notify everyone in a channel | Low |
| Email notifications | Notify via email for mentions when user is offline | Low |
| Message formatting (markdown) | Bold, italic, code blocks, links | Low |
| Link previews / unfurling | Show a preview card when someone pastes a URL | Medium |
| User profiles in chat | Click a username to see their info | Low |

### Tier 3 — Power Features (Skip Unless Specifically Requested)

| Feature | What It Does | Complexity |
|---|---|---|
| Private channels | Invite-only channels | Medium |
| Channel archival | Archive old channels without deleting | Low |
| Shared channels (cross-org) | Share a channel between two different organizations | Very High |
| Slack Connect (external) | Message people outside your org | Very High |
| Custom emoji | Upload custom emoji for the workspace | Medium |
| Scheduled messages | Write a message now, send it later | Medium |
| Reminders / Slackbot | Set reminders ("remind me in 2 hours") | High |
| Workflow Builder | No-code automations triggered by events | Very High |
| App integrations / bots | Third-party apps posting to channels | High |
| Huddles (audio/video) | Real-time voice/video in a channel | Very High |
| Clips (audio/video messages) | Record and send short audio/video | High |
| Canvas (docs) | Collaborative documents embedded in channels | Very High |
| User groups | Create named groups (@design-team) for bulk mentions | Medium |
| Message bookmarks | Save messages for later | Low |
| Do Not Disturb | Pause all notifications for a time range | Low |
| Custom status | "In a meeting", "On vacation", etc. | Low |
| Admin dashboard | Workspace analytics, user management | Medium |
| Data export / compliance | Export all messages for legal/compliance | Medium |
| SSO / SAML | Enterprise single sign-on | High |
| Guest accounts | Limited access for external collaborators | Medium |
| Retention policies | Auto-delete messages after X days | Medium |

### My Recommendation for Your App

Given ~150 users, property intelligence context, and speed-of-deployment priority:

**Build now:** Everything in Tier 1 minus file sharing (add it in sprint 2), plus emoji reactions and message formatting from Tier 2.

**Build in month 2–3:** Threads, search, pin messages, file/image sharing, email notifications.

**Build only if users ask:** Everything in Tier 3. Most of it you'll never need at your scale.

---

## Approach A: Minimal Viable Messaging

**Target:** 500 users | **Horizon:** 3–6 months | **Time to build:** 2–3 weeks

### Architecture

This is the fastest path to a working chat. You keep your entire current stack exactly as-is and layer messaging on top.

**WebSocket layer:** Use the `ws` library you already have in your dependencies. Your Express server creates a WebSocket server on the same port, attached to your existing HTTP server. In-memory — no Redis, no pub/sub, no external broker.

**How it works:**
- User opens the app → browser establishes a single WebSocket connection to your Express server.
- User sends a message → it hits a REST endpoint (POST /api/messages), gets persisted to Postgres via Drizzle, then the server broadcasts it over WebSocket to everyone connected to that channel.
- When a user first opens a channel, they load history via a normal GET request (paginated). WebSocket only handles live messages from that point forward.

**Why REST + WebSocket hybrid instead of pure WebSocket:**
- Your existing auth (Passport sessions) works seamlessly for REST calls.
- Message persistence is just another Drizzle insert — no new patterns.
- WebSocket only carries the lightweight real-time broadcast, not the full read/write lifecycle.
- If the WebSocket drops, messages aren't lost — they're in the database. The client just re-fetches on reconnect.

**State management:** TanStack Query handles all message fetching and caching. When a WebSocket event arrives, you invalidate or optimistically update the relevant query cache. This means your message list component doesn't need to manage its own state — TanStack Query is the source of truth, WebSocket is just the trigger.

**What you skip:**
- No Redis.
- No message queue.
- No horizontal scaling.
- No read receipts.
- No threads.
- No file uploads (plain text messages only in v1).

**What you get:**
- Real-time 1:1 DMs, group DMs, and public channels.
- Typing indicators.
- Online/offline presence.
- Unread counts.
- Message editing and deletion.
- Emoji reactions.
- Markdown formatting.
- @mentions with in-app notification.

### Pros
- Can ship in 2–3 weeks.
- Zero new infrastructure. Same DB, same server, same deployment.
- Dead simple to debug — everything is in one process.

### Cons
- Single-server bottleneck. If your Replit instance restarts, all WebSocket connections drop (clients reconnect automatically, but there's a brief gap).
- In-memory presence means if the server restarts, all users briefly show as offline.
- No horizontal scaling — you can't run two instances of the server behind a load balancer because they wouldn't share WebSocket state.
- At 500+ concurrent WebSocket connections, Replit's single-container model may start to feel the memory pressure.

### When to Upgrade
When you consistently have 200+ simultaneous connected users, or when you need to run multiple server instances, move to Approach B.

---

## Approach B: Solid Mid-Tier Messaging

**Target:** 1K–5K users | **Horizon:** 12 months | **Time to build:** 5–7 weeks

### Architecture

Same React + Express + Drizzle + Neon stack, but you add two things: **Redis** and a **proper WebSocket gateway**.

**Redis (Upstash or ElastiCache):** You add Redis for three specific jobs:
1. **Pub/Sub for WebSocket broadcasting** — If you later need two server instances, Redis pub/sub ensures a message sent to Server A gets broadcast to users connected to Server B.
2. **Presence** — Store user online/offline status in Redis with TTLs instead of in-memory. Survives server restarts.
3. **Unread counts** — Cache unread counts per user per channel in Redis. Way faster than counting rows in Postgres on every page load.

**WebSocket handling:** Still using `ws`, but now you authenticate WebSocket connections using your existing session cookie (parse it on upgrade). You also add a heartbeat (ping every 30 seconds) so the server can detect dead connections and clean up presence.

**What you add over Approach A:**
- Threads (reply to a specific message).
- Full-text search on messages (Postgres `tsvector` — no Elasticsearch needed at this scale).
- File/image sharing via Supabase Storage (you already use Supabase).
- Pin messages.
- Email notifications for offline users (you already have Postmark).
- Private channels.

**Message delivery guarantee:** Approach A had a tiny window where a message could be written to the DB but the WebSocket broadcast could fail (server crash between write and broadcast). In Approach B, the flow is: write to DB → publish to Redis pub/sub → all connected servers broadcast. If the server crashes after DB write but before Redis publish, the client detects the WebSocket reconnect and fetches missed messages from the REST API using a "give me messages since timestamp X" endpoint. No messages are ever lost.

### Pros
- Handles 1K–5K users without breaking a sweat.
- Presence and unread counts survive server restarts.
- Foundation for horizontal scaling is in place (Redis pub/sub) even if you don't use it yet.
- Full-featured: threads, search, files, pins.

### Cons
- Redis is a new dependency (~$10–25/month on Upstash for this scale).
- More moving parts = more to debug.
- Takes 5–7 weeks instead of 2–3.

---

## Approach C: Future-Proofed Messaging

**Target:** 5K–10K users | **Horizon:** 2–3 years | **Time to build:** 10–14 weeks

### Architecture

Full event-driven architecture with a dedicated real-time service.

- **Dedicated WebSocket service** on ECS Fargate or a small EC2 instance. Runs independently from your Express API.
- **Redis Cluster** (ElastiCache) for pub/sub, presence, rate limiting, and caching.
- **Message queue (SQS or BullMQ)** between your API and the WebSocket service. Decouples message persistence from real-time delivery.
- **S3 + CloudFront** for file/media storage instead of Supabase Storage (you're on AWS already).
- **Postgres partitioning** on the messages table by channel and month, so queries stay fast as message volume grows over years.

**What you add over Approach B:**
- Read receipts (who has seen each message).
- Scheduled messages.
- Custom status ("In a meeting", "On vacation").
- User groups for bulk mentions.
- Admin dashboard with usage analytics.
- Message retention policies.
- Data export.

### Pros
- Truly scalable architecture.
- Each component can be scaled independently.
- Clean separation of concerns.

### Cons
- 10–14 weeks of work.
- Significantly more infrastructure to manage.
- Overkill for 150–500 users.
- Higher monthly cost (~$50–100/month for the additional services).

---

## Deployment & WebSocket Considerations

This deserves its own section because it's the biggest technical decision for the messaging feature.

### The Replit Problem

Replit's Autoscale deployments are designed for request/response HTTP traffic. They spin containers up and down based on load. WebSocket connections are long-lived — they need a container that stays alive. If Replit spins down your container, every connected user gets disconnected.

### Options

| Option | Effort | Cost | Reliability |
|---|---|---|---|
| **Replit Reserved VM** — Keep everything on Replit but use a reserved (always-on) deployment | None (config change) | ~$7–25/month | Good for <500 concurrent connections |
| **Split: Replit (API) + Railway (WS)** — Main app stays on Replit, WebSocket server on Railway | 1–2 days to set up | ~$5–10/month for Railway | Good for <2K concurrent |
| **Split: Replit (API) + ECS Fargate (WS)** — WebSocket on AWS alongside your other infra | 2–3 days to set up | ~$10–20/month | Good for <10K concurrent |
| **Move everything to ECS Fargate** — Leave Replit entirely | 1–2 weeks migration | ~$30–50/month | Production-grade |

For Approach A, use Replit Reserved VM. For Approach B, use the Replit + Railway split (or Replit Reserved VM if it's holding up). For Approach C, move to ECS Fargate.

### Deployment Decision for Approach B (Split Architecture Detail)

If you go with the split approach (Replit for API, Railway for WebSocket), here's how it connects:

- Your React client establishes two connections on load: REST calls to your Replit Express API (same as today), and a WebSocket connection to the Railway-hosted WS server.
- Both the Express API and the WS server connect to the same Neon Postgres database and the same Upstash Redis instance.
- When a user sends a message: React → REST POST to Replit → Drizzle insert to Neon → publish event to Redis pub/sub → Railway WS server picks it up → broadcasts to connected clients.
- The WS server on Railway is a thin Node.js app — maybe 100 lines of code. It authenticates connections (by validating the session cookie against Postgres or Redis), subscribes to Redis channels, and forwards messages to the right WebSocket connections. It doesn't have any business logic.

---

## Database Schema

This schema works for all three approaches. Approach A uses a subset of these tables, B uses most, C uses all.

```
channels
├── id (uuid, PK)
├── name (text, unique)
├── description (text, nullable)
├── type (enum: 'public', 'private', 'dm', 'group_dm')
├── created_by (uuid, FK → users.id)
├── is_archived (boolean, default false)
├── created_at (timestamp)
└── updated_at (timestamp)

channel_members
├── id (uuid, PK)
├── channel_id (uuid, FK → channels.id)
├── user_id (uuid, FK → users.id)
├── role (enum: 'owner', 'admin', 'member')
├── last_read_at (timestamp)            ← for unread calculation
├── last_read_message_id (uuid, nullable) ← faster than timestamp comparison
├── is_muted (boolean, default false)
├── joined_at (timestamp)
└── UNIQUE(channel_id, user_id)

messages
├── id (uuid, PK)
├── channel_id (uuid, FK → channels.id)
├── sender_id (uuid, FK → users.id)
├── parent_message_id (uuid, nullable, FK → messages.id)  ← for threads
├── content (text)
├── is_edited (boolean, default false)
├── is_deleted (boolean, default false)  ← soft delete
├── created_at (timestamp)
└── updated_at (timestamp)

message_attachments            (Approach B+)
├── id (uuid, PK)
├── message_id (uuid, FK → messages.id)
├── file_url (text)
├── file_name (text)
├── file_type (text)
├── file_size_bytes (integer)
└── created_at (timestamp)

message_reactions
├── id (uuid, PK)
├── message_id (uuid, FK → messages.id)
├── user_id (uuid, FK → users.id)
├── emoji (text)                        ← store the emoji character itself
├── created_at (timestamp)
└── UNIQUE(message_id, user_id, emoji)

message_mentions
├── id (uuid, PK)
├── message_id (uuid, FK → messages.id)
├── mentioned_user_id (uuid, FK → users.id)
├── created_at (timestamp)
└── UNIQUE(message_id, mentioned_user_id)

pinned_messages                (Approach B+)
├── id (uuid, PK)
├── message_id (uuid, FK → messages.id)
├── channel_id (uuid, FK → channels.id)
├── pinned_by (uuid, FK → users.id)
└── pinned_at (timestamp)
```

**Indexes (critical for performance):**
- `messages(channel_id, created_at DESC)` — channel history pagination
- `messages(parent_message_id)` — thread loading
- `channel_members(user_id)` — "which channels am I in?"
- `message_mentions(mentioned_user_id, created_at DESC)` — notification feed

At your scale (150 users, maybe a few thousand messages per day), Neon Postgres handles this trivially. You won't need to think about partitioning or read replicas for years.

---

## Timelines

### Approach A Timeline: 2–3 Weeks

| Week | What Gets Built |
|---|---|
| **Week 1** | Database schema + Drizzle migrations. REST endpoints for channels CRUD, message CRUD, channel membership. WebSocket server setup (attach to existing Express, session-based auth on upgrade). Basic real-time message broadcasting. |
| **Week 2** | Frontend: channel sidebar, message list with infinite scroll, message composer, DM creation flow. TanStack Query integration for message fetching. WebSocket client hook that invalidates/updates query cache on incoming messages. Typing indicators. Online/offline presence (in-memory). |
| **Week 3** | Unread counts and badges. @mentions with in-app notification dropdown. Emoji reactions. Message editing and deletion. Markdown rendering in messages. Polish, bug fixes, testing. |

### Approach B Timeline: 5–7 Weeks

| Week | What Gets Built |
|---|---|
| **Weeks 1–3** | Everything from Approach A. |
| **Week 4** | Redis integration (Upstash). Migrate presence from in-memory to Redis. Migrate unread counts to Redis cache. Add Redis pub/sub for WebSocket broadcasting. Reconnection logic with "fetch messages since X" backfill. |
| **Week 5** | Threads UI and API. File/image uploads via Supabase Storage. Pin messages. |
| **Week 6** | Full-text message search (Postgres tsvector). Private channels with invite flow. Email notifications for offline mentions (Postmark). |
| **Week 7** | Integration testing. Performance testing with simulated load. Polish, edge cases, mobile responsiveness. |

### Approach C Timeline: 10–14 Weeks

| Week | What Gets Built |
|---|---|
| **Weeks 1–7** | Everything from Approach B. |
| **Weeks 8–9** | Separate WebSocket service on ECS Fargate. SQS message queue between API and WS service. Migrate file storage to S3 + CloudFront. |
| **Weeks 10–11** | Read receipts. Scheduled messages. Custom user status. User groups. |
| **Weeks 12–13** | Admin dashboard. Message retention policies. Data export. |
| **Week 14** | Load testing, monitoring setup (CloudWatch), documentation. |

---

## Recommendation

**Start with Approach A. Ship it in 2–3 weeks. Get user feedback.** If messaging takes off and you're pushing 200+ concurrent users, migrate to Approach B — the database schema is the same, you're just adding Redis and hardening the WebSocket layer. Approach C is insurance for a future that may never arrive.

For deployment, use Replit Reserved VM for Approach A. If WebSocket reliability becomes an issue, split the WebSocket server out to Railway before investing in the full Approach B build — that's a 1–2 day change that buys you a lot of stability.