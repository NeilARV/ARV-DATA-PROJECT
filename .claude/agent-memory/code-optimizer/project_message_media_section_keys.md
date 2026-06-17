---
name: message-media-section-keys
description: MessageMedia builds a dynamic sections[] array; outer wrapper keyed by index can leak per-preview useState across reconciliations/unfurls
metadata:
  type: project
---

`client/src/components/mastermind/MessageMedia.tsx` builds a `sections[]` array conditionally (images section, files section, then one entry per link preview) and renders the outer wrappers with `key={i}` (array index).

**Why:** Each `LinkPreviewRow` holds its own `useState` for `imageFailed`/`logoFailed`. The position of a given preview in `sections[]` shifts whenever the images/files sections appear or disappear — which happens when a background unfurl populates `message.linkPreviews` (previews are absent until the cache fills) or when a `MessageUpdated` event reconciles attachments (see [[project_mastermind_edit_attachments_authoritative]]). An index-keyed wrapper can make React reuse one preview's error state against a different preview. The inner row already has a stable `key={preview.url}`, but the outer `<div key={i}>` defeats it.

**How to apply:** When reviewing this component (or similar dynamic section lists in Mastermind), prefer a stable per-section key (`"images"`, `"files"`, `preview.url`) over the positional index. Flag index keys here as a state-leak risk, not just a lint nit.
