---
name: mastermind-message-id-routes-bypass-channel-guard
description: Mastermind /api/messages/:id routes (edit, delete, reactions) resolve by message id and skip getReadableChannelOrThrow — channel-level gates (admin-only, archived) must be re-checked in each message-id service
metadata:
  type: project
---

The Mastermind message-id-scoped routes — `PATCH /api/messages/:id`, `DELETE /api/messages/:id`, `POST`/`DELETE /api/messages/:id/reactions` — are gated only by `requireMastermind` and resolve their target by **message id, not channel id**. They do NOT pass through `getReadableChannelOrThrow` (which lives in messages.services and pins.services and enforces public/non-archived/admin-only).

Each such service re-derives the channel itself:
- `updateMessage`/`softDeleteMessage` guard via `senderId === callerId` (+ admin/owner for delete), which incidentally blocks non-members.
- `getReactableChannelId` (reactions.services) only checks `type==='public' && !isArchived` — it was missing the `isAdminOnly` check when admin-only channels shipped, letting a non-admin react to an admin-channel message by id (existence oracle + a live ReactionChanged broadcast into the private channel).

**Why:** the admin-only feature gated every *channel-id* surface but the *message-id* surfaces each have their own channel re-derivation and are easy to forget.

**How to apply:** whenever a channel-level visibility/state rule is added (admin-only, future private/DM membership, etc.), audit ALL message-id services that re-derive the channel — not just the channel-id paths. The reaction path is the canonical miss. Cross-ref [[project_mastermind_ws_delivery_scope]] (broadcast only reaches subscribers, which is the backstop that limited the blast radius) and [[project_mastermind_eligibility_duplicated]] (same "duplicated rule must change together" failure mode).
