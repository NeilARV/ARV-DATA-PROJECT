---
name: supabase-remove-batch-cap
description: removeAttachmentStorageByUrls passes all paths to Supabase .remove() in one call; channel-scoped cleanup is unbounded and can exceed the per-request object cap
metadata:
  type: project
---

`removeAttachmentStorageByUrls` (server/services/messages/attachments.services.ts) passes the entire `paths` array to a single Supabase Storage `.remove()` call. There is no chunking.

**Why:** Per-message cleanup is naturally bounded (one message's attachments), but channel-delete cleanup (channels.services.ts `deleteChannel`) collects every attachment across all of a channel's messages — unbounded. Supabase `.remove()` enforces a per-request object cap (commonly ~1000); exceeding it returns `{ error }` and the whole batch is left orphaned (logged, not deleted). Failure mode is graceful (orphaned files + log line), not a crash.

**How to apply:** If a chunking fix is ever added, it belongs inside `removeAttachmentStorageByUrls` so both message and channel paths benefit. When reviewing any new caller of this function that can pass a large/unbounded URL set, flag the missing chunk as IMPROVE (not CRITICAL). Related: [[project_mastermind_edit_attachments_authoritative]].
