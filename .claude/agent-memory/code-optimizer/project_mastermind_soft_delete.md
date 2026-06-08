---
name: mastermind-soft-delete
description: Mastermind messages are soft-delete only (is_deleted flag); never hard-deleted, which affects how cascade FK choices should be judged
metadata:
  type: project
---

Mastermind messaging (4th app, branch feature/mastermind) treats messages as soft-delete only: `messages.is_deleted` flag, content blanked to a tombstone, rows never hard-deleted in normal operation.

**Why:** Design spec (`.claude/docs/mastermind.md`, Phase 1) mandates "nothing is ever hard-deleted" — admins delete-not-edit others' messages, and history must survive. The only hard-delete path is a channel hard-delete from the archive view (Part 2), which cascades.

**How to apply:** When reviewing FK `onDelete` on anything referencing `messages.id` (e.g. `messages.parent_message_id` self-ref, future thread tables), judge `cascade` against the soft-delete-forever principle — a per-message hard delete cascading away replies/attachments would contradict the spec. Channel-level cascade is fine. See [[no-db-transactions]] for the related atomicity concern when soft-delete writes blank content + insert tombstone across multiple statements.
