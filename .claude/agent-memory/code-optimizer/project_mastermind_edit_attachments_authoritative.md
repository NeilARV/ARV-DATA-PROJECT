---
name: mastermind-edit-attachments-authoritative
description: Mastermind message edits send the full desired attachment set; server reconciles by fileUrl and the MessageUpdated broadcast carries authoritative attachments, so the cache no longer preserves cached attachments on update
metadata:
  type: project
---

Mastermind message editing now supports changing attachments (previously edit dropped them silently). The contract: the client sends the FULL desired attachment set (kept existing + newly uploaded) on `PATCH /api/messages/:id`. `updateMessage` (messages.services.ts) treats `attachments` as authoritative when present and calls `reconcileAttachments`, which diffs desired-vs-existing by `fileUrl` (deletes removed rows + their Supabase storage, inserts added). If the `attachments` key is omitted entirely, existing rows are left untouched — but the current client (`MessageItem.editMutation`) always sends it, so the omit path is unexercised.

`client/src/lib/mastermind-messages.ts::applyMessageMutation` was changed to STOP preserving cached attachments on `MessageUpdated` — it now lets `incoming.attachments` flow through (reactions are still kept from cache for per-viewer `reactedByMe`). This is correct because the `MessageUpdated` broadcast `message` comes from `getEnrichedMessageById`, which hydrates the real attachment set; for deleted messages that helper returns `attachments: []`, so deletes still clear attachments.

**Why:** edits can now add/remove attachments, so a field-wise merge that kept stale cached attachments would mask removals for other viewers.

**How to apply:** the correctness hinge is that every `MessageUpdated` broadcast carries the true attachment set. If a future code path broadcasts a MessageUpdated without a fully-enriched message (e.g. a partial DTO), viewers will lose their attachments. Storage deletes in `reconcileAttachments` are destructive and non-transactional ([[project_no_db_transactions]]) — they fire BEFORE the `messages` row update, so a throw after the reconcile leaves an attachment permanently deleted with no content change. Also note edit still skips the channel guard ([[project_mastermind_message_id_routes_bypass_channel_guard]]). Cross-ref [[project_mastermind_reactions_broadcast_only]] (same broadcast-only, no-optimistic-update model) and [[project_mastermind_ws_delivery_scope]].
