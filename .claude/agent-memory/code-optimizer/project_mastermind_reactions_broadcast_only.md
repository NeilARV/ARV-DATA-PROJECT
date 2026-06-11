---
name: mastermind-reactions-broadcast-only
description: Mastermind reaction counts are broadcast-driven with NO optimistic update; idempotent add/remove can drift counts if the WS delta is sent unconditionally
metadata:
  type: project
---

Mastermind reactions intentionally do NOT optimistically update client state. The acting client relies on receiving its own `reaction.changed` WS broadcast (the actor is subscribed to the channel) and applies a single delta via `applyReactionDelta` in `client/src/lib/mastermind-messages.ts`. This is by design to keep per-viewer `reactedByMe` correct off one channel-wide broadcast.

**Why:** A single broadcast must yield correct per-viewer pills; optimistic + echo would double-count. The design trades a small round-trip latency for correctness.

**How to apply:** The correctness hinge is that the WS delta must mirror the actual DB change. `addReaction` uses `onConflictDoNothing` and `removeReaction` deletes by exact key — both are no-ops when nothing changed. As of the feature/mastermind branch the controllers (`server/controllers/messages/reactions.controllers.ts`) broadcast `action: add/remove` UNCONDITIONALLY, so a double-tap (two tabs / fast clicks) increments every client's count without a matching DB change, drifting until a refetch/backfill re-hydrates from the aggregate query. The fix is to make the service report whether a row actually changed (`.returning()` on insert/delete) and only broadcast when it did. Relates to [[mastermind-ws-delivery-scope]] (delta only reaches active-channel subscribers).
