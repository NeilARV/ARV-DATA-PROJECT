---
name: mastermind-ws-delivery-scope
description: WS MessageCreated events only reach clients subscribed to that channel; client subscribes to active channel only — cross-channel live features need broadcastToUser
metadata:
  type: project
---

`broadcastToChannel` (server/websocket/registry.ts) delivers only to clients in that channel's subscriber set. The client (MessageList.tsx) subscribes to ONLY the active channel and unsubscribes on switch. So a client never receives `MessageCreated` for channels it isn't currently viewing.

**Why:** This bit the Part 7 unread-badge feature — the increment-badge-for-other-channels code path was dead because those WS events never arrive at the client.

**How to apply:** Any cross-channel live feature (unread badges, notification dots for non-active channels) must NOT rely on `MessageCreated`/`broadcastToChannel`. Use the user-scoped `broadcastToUser` path (registry.ts, documented "Built for Parts 7/8; no emitters yet") with a dedicated per-user event. Relates to [[mastermind-ws-date-serialization]].
